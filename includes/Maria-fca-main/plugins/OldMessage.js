"use strict";

var utils = require("../utils");
var log = require("npmlog");
var bluebird = require("bluebird");
const { globalAntiSuspension } = require('../extra/antiSuspension');

var allowedProperties = {
  attachment: true,
  url: true,
  sticker: true,
  emoji: true,
  emojiSize: true,
  body: true,
  mentions: true,
  location: true,
  replyToMessage: true,
  replyTo: true,
  textEffect: true,
  text_effect: true,
  text_effect_id: true,
  textEffectId: true,
  textEffectID: true,
  effect: true,
  effect_id: true,
  effectID: true,
  text_effect_name: true,
  effectName: true,
  effect_name: true,
  tags: true,
  buttons: true,
  call_to_actions: true,
};

const TEXT_EFFECTS = {
  hearts: "1",
  heart: "1",
  love: "1",
  gift: "2",
  present: "2",
  box: "2",
  giftbox: "2",
  fire: "3",
  flame: "3",
  hot: "3",
  confetti: "4",
  party: "4",
  celebrate: "4",
  celebration: "4",
  sparkles: "5",
  sparkle: "5",
  star: "5",
  stars: "5",
  magic: "5",
};

function toTextEffectId(effect) {
  if (effect === null || effect === undefined) return null;
  if (typeof effect === "number") return String(effect);
  if (typeof effect === "string") {
    const str = effect.trim();
    if (!str) return null;
    const key = str.toLowerCase();
    if (TEXT_EFFECTS[key]) return TEXT_EFFECTS[key];
    if (!isNaN(str)) return str;
    return str;
  }
  return null;
}

module.exports = function (defaultFuncs, api, ctx) {
  function uploadAttachment(attachments, callback) {
    var uploads = [];

    // create an array of promises
    for (var i = 0; i < attachments.length; i++) {
      if (!utils.isReadableStream(attachments[i])) throw { error: "Attachment should be a readable stream and not " + utils.getType(attachments[i]) + "." };
      var form = {
        upload_1024: attachments[i],
        voice_clip: "true"
      };

      uploads.push(
        defaultFuncs
          .postFormData("https://upload.facebook.com/ajax/mercury/upload.php", ctx.jar, form, {}, {})
          .then(utils.parseAndCheckLogin(ctx, defaultFuncs))
          .then(function (resData) {
            if (resData.error) throw resData;
            // We have to return the data unformatted unless we want to change it
            // back in sendMessage.
            return resData.payload.metadata[0];
          })
      );
    }

    // resolve all promises
    bluebird
      .all(uploads)
      .then(resData => callback(null, resData))
      .catch(function (err) {
        log.error("uploadAttachment", err);
        return callback(err);
      });
  }

  function getUrl(url, callback) {
    var form = {
      image_height: 960,
      image_width: 960,
      uri: url
    };

    defaultFuncs
      .post("https://www.facebook.com/message_share_attachment/fromURI/", ctx.jar, form)
      .then(utils.parseAndCheckLogin(ctx, defaultFuncs))
      .then(function (resData) {
        if (resData.error) return callback(resData);
        if (!resData.payload) return callback({ error: "Invalid url" });
        callback(null, resData.payload.share_data.share_params);
      })
      .catch(function (err) {
        log.error("getUrl", err);
        return callback(err);
      });
  }

  function sendContent(form, threadID, isSingleUser, messageAndOTID, callback) {
    // There are three cases here:
    // 1. threadID is of type array, where we're starting a new group chat with users
    //    specified in the array.
    // 2. User is sending a message to a specific user.
    // 3. No additional form params and the message goes to an existing group chat.
    if (utils.getType(threadID) === "Array") {
      for (var i = 0; i < threadID.length; i++) form["specific_to_list[" + i + "]"] = "fbid:" + threadID[i];
      form["specific_to_list[" + threadID.length + "]"] = "fbid:" + ctx.userID;
      form["client_thread_id"] = "root:" + messageAndOTID;
      log.info("sendMessage", "Sending message to multiple users: " + threadID);
    }
    else {
      // This means that threadID is the id of a user, and the chat
      // is a single person chat
      if (isSingleUser) {
        form["specific_to_list[0]"] = "fbid:" + threadID;
        form["specific_to_list[1]"] = "fbid:" + ctx.userID;
        form["other_user_fbid"] = threadID;
      }
      else form["thread_fbid"] = threadID;
    }

    if (ctx.globalOptions.pageID) {
      form["author"] = "fbid:" + ctx.globalOptions.pageID;
      form["specific_to_list[1]"] = "fbid:" + ctx.globalOptions.pageID;
      form["creator_info[creatorID]"] = ctx.userID;
      form["creator_info[creatorType]"] = "direct_admin";
      form["creator_info[labelType]"] = "sent_message";
      form["creator_info[pageID]"] = ctx.globalOptions.pageID;
      form["request_user_id"] = ctx.globalOptions.pageID;
      form["creator_info[profileURI]"] = "https://www.facebook.com/profile.php?id=" + ctx.userID;
    }

    defaultFuncs
      .post("https://www.facebook.com/messaging/send/", ctx.jar, form)
      .then(utils.parseAndCheckLogin(ctx, defaultFuncs))
      .then(function (resData) {
        if (!resData) return callback({ error: "Send message failed." });
        if (resData.error) {
          if (resData.error === 1545012) {
            log.warn("sendMessage", "Got error 1545012. This might mean that you're not part of the conversation " + threadID);
          }
          else {
            log.error("sendMessage", resData);
          }
          try {
            globalAntiSuspension.checkAccountHealth(resData);
          } catch (_) {}
          return callback(resData);
        }

        var messageInfo = resData.payload.actions.reduce(function (p, v) {
          return (
            {
              threadID: v.thread_fbid,
              messageID: v.message_id,
              timestamp: v.timestamp
            } || p
          );
        }, null);

        return callback(null, messageInfo);
      })
      .catch(function (err) {
        log.error("sendMessage", err);
        if (utils.getType(err) == "Object" && err.error === "Not logged in.") ctx.loggedIn = false;
        try {
          globalAntiSuspension.checkAccountHealth(err);
        } catch (_) {}
        return callback(err);
      });
  }

  function send(form, threadID, messageAndOTID, callback, isGroup) {
    // We're doing a query to this to check if the given id is the id of
    // a user or of a group chat. The form will be different depending
    // on that.
    if (utils.getType(threadID) === "Array") sendContent(form, threadID, false, messageAndOTID, callback);
    else {
      if (utils.getType(isGroup) != "Boolean") sendContent(form, threadID, threadID.length === 15, messageAndOTID, callback);
      else sendContent(form, threadID, !isGroup, messageAndOTID, callback);
    }
  }

  function handleUrl(msg, form, callback, cb) {
    if (msg.url) {
      form["shareable_attachment[share_type]"] = "100";
      getUrl(msg.url, function (err, params) {
        if (err) return callback(err);
        form["shareable_attachment[share_params]"] = params;
        cb();
      });
    }
    else cb();
  }

  function handleLocation(msg, form, callback, cb) {
    if (msg.location) {
      if (msg.location.latitude == null || msg.location.longitude == null) return callback({ error: "location property needs both latitude and longitude" });
      form["location_attachment[coordinates][latitude]"] = msg.location.latitude;
      form["location_attachment[coordinates][longitude]"] = msg.location.longitude;
      form["location_attachment[is_current_location]"] = !!msg.location.current;
    }
    cb();
  }

  function handleSticker(msg, form, callback, cb) {
    if (msg.sticker) form["sticker_id"] = msg.sticker;
    cb();
  }

  function handleEmoji(msg, form, callback, cb) {
    if (msg.emojiSize != null && msg.emoji == null) return callback({ error: "emoji property is empty" });
    if (msg.emoji) {
      if (msg.emojiSize == null) msg.emojiSize = "medium";
      if (msg.emojiSize != "small" && msg.emojiSize != "medium" && msg.emojiSize != "large") return callback({ error: "emojiSize property is invalid" });
      if (form["body"] != null && form["body"] != "") return callback({ error: "body is not empty" });
      form["body"] = msg.emoji;
      form["tags[0]"] = "hot_emoji_size:" + msg.emojiSize;
    }
    cb();
  }

  function handleAttachment(msg, form, callback, cb) {
    if (msg.attachment) {
      form["image_ids"] = [];
      form["gif_ids"] = [];
      form["file_ids"] = [];
      form["video_ids"] = [];
      form["audio_ids"] = [];

      if (utils.getType(msg.attachment) !== "Array") msg.attachment = [msg.attachment];
      if (msg.attachment.every(e=>/_id$/.test(e[0]))) {
        //console.log(msg.attachment)
        msg.attachment.map(e=>form[`${e[0]}s`].push(e[1]));
        return cb();
        }
      uploadAttachment(msg.attachment, function (err, files) {
        if (err) return callback(err);
        files.forEach(function (file) {
          var key = Object.keys(file);
          var type = key[0]; // image_id, file_id, etc
          form["" + type + "s"].push(file[type]); // push the id
        });
        cb();
      });
    }
    else cb();
  }

  function handleMention(msg, form, callback, cb) {
    if (msg.mentions) {
      for (let i = 0; i < msg.mentions.length; i++) {
        const mention = msg.mentions[i];
        const tag = mention.tag;
        if (typeof tag !== "string") return callback({ error: "Mention tags must be strings." });
        const offset = msg.body.indexOf(tag, mention.fromIndex || 0);
        if (offset < 0) log.warn("handleMention", 'Mention for "' + tag + '" not found in message string.');
        if (mention.id == null) log.warn("handleMention", "Mention id should be non-null.");

        const id = mention.id || 0;
        const emptyChar = '\u200E';
        form["body"] = emptyChar + msg.body;
        form["profile_xmd[" + i + "][offset]"] = offset + 1;
        form["profile_xmd[" + i + "][length]"] = tag.length;
        form["profile_xmd[" + i + "][id]"] = id;
        form["profile_xmd[" + i + "][type]"] = "p";
      }
    }
    cb();
  }

  return function sendMessage(msg, threadID, callback, replyToMessage, isGroup) {
    typeof isGroup == "undefined" ? isGroup = null : "";
    if (!callback && (utils.getType(threadID) === "Function" || utils.getType(threadID) === "AsyncFunction")) return threadID({ error: "Pass a threadID as a second argument." });
    if (!replyToMessage && utils.getType(callback) === "String") {
      replyToMessage = callback;
      callback = function () { };
    }

    var resolveFunc = function () { };
    var rejectFunc = function () { };
    var returnPromise = new Promise(function (resolve, reject) {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    if (!callback) {
      callback = function (err, data) {
        if (err) return rejectFunc(err);
        resolveFunc(data);
      };
    }

    var msgType = utils.getType(msg);
    var threadIDType = utils.getType(threadID);
    var messageIDType = utils.getType(replyToMessage);

    if (msgType !== "String" && msgType !== "Object") return callback({ error: "Message should be of type string or object and not " + msgType + "." });

    // Changing this to accomodate an array of users
    if (threadIDType !== "Array" && threadIDType !== "Number" && threadIDType !== "String") return callback({ error: "ThreadID should be of type number, string, or array and not " + threadIDType + "." });

    if (replyToMessage && messageIDType !== 'String') return callback({ error: "MessageID should be of type string and not " + threadIDType + "." });

    if (msgType === "String") msg = { body: msg };
    var disallowedProperties = Object.keys(msg).filter(prop => !allowedProperties[prop]);
    if (disallowedProperties.length > 0) return callback({ error: "Dissallowed props: `" + disallowedProperties.join(", ") + "`" });

    var effectiveReplyTo = replyToMessage || msg.replyToMessage || msg.replyTo;

    var messageAndOTID = utils.generateOfflineThreadingID();
    // console.log(messageAndOTID)
    var form = {
      client: "mercury",
      action_type: "ma-type:user-generated-message",
      author: "fbid:" + ctx.userID,
      timestamp: Date.now(),
      timestamp_absolute: "Today",
      timestamp_relative: utils.generateTimestampRelative(),
      timestamp_time_passed: "0",
      is_unread: false,
      is_cleared: false,
      is_forward: false,
      is_filtered_content: false,
      is_filtered_content_bh: false,
      is_filtered_content_account: false,
      is_filtered_content_quasar: false,
      is_filtered_content_invalid_app: false,
      is_spoof_warning: false,
      source: "source:chat:web",
      "source_tags[0]": "source:chat",
      body: msg.body ? msg.body.toString() : "",
      html_body: false,
      ui_push_phase: "V3",
      status: "0",
      offline_threading_id: messageAndOTID,
      message_id: messageAndOTID,
      threading_id: utils.generateThreadingID(ctx.clientID),
      "ephemeral_ttl_mode:": "0",
      manual_retry_cnt: "0",
      has_attachment: !!(msg.attachment || msg.url || msg.sticker),
      signatureID: utils.getSignatureID(),
      replied_to_message_id: effectiveReplyTo
    };

    var textEffectVal = msg && (
      msg.textEffect ||
      msg.text_effect ||
      msg.text_effect_id ||
      msg.textEffectId ||
      msg.textEffectID ||
      msg.effect ||
      msg.effect_id ||
      msg.effectID ||
      msg.text_effect_name ||
      msg.effectName ||
      msg.effect_name
    );
    var textEffectId = toTextEffectId(textEffectVal);
    if (textEffectId) {
      // NOTE: the legacy "mercury" web-chat endpoint used by OldMessage does
      // NOT support text_effect_id — Facebook silently drops it server-side,
      // so the message still sends but arrives as plain text with no effect.
      // Effects only render when sent via MQTT/Lightspeed (see sendMessage.js
      // -> sendViaMqtt, which uses the /ls_req task payload). This field is
      // still attached here in case a future server version honors it, but
      // callers relying on OldMessage/sendMessageDM directly should not
      // expect effects to appear.
      form["text_effect_id"] = textEffectId;
      if (typeof log !== "undefined" && log && log.warn) {
        log.warn("OldMessage", "text_effect_id ('" + textEffectId + "') set, but this legacy endpoint does not render effects. Use api.listen()/listenMqtt() so sendMessage() can go via MQTT instead.");
      }
    }
    // console.log(form)

    const isAntiBan = ctx.globalOptions && ctx.globalOptions.antiBan;
    const configSource = (global.GoatBot && global.GoatBot.config) ? global.GoatBot.config : ctx.config || {};
    const enableTypingIndicator = typeof configSource.enableTypingIndicator !== 'undefined' ? configSource.enableTypingIndicator : ctx.config?.enableTypingIndicator;

    const executeSend = () => {
      handleLocation(msg, form, callback, () =>
        handleSticker(msg, form, callback, () =>
          handleAttachment(msg, form, callback, () =>
            handleUrl(msg, form, callback, () =>
              handleEmoji(msg, form, callback, () =>
                handleMention(msg, form, callback, () =>
                  sendContent(form, threadID, isGroup, messageAndOTID, callback)
                )
              )
            )
          )
        )
      );
    };

    const startSending = async () => {
      if (isAntiBan) {
        try {
          await globalAntiSuspension.prepareBeforeMessage(threadID, msg.body || "");
        } catch (err) {
          log.warn("AntiSuspension", "prepareBeforeMessage error: " + (err.message || err));
        }
      }

      if (isAntiBan || enableTypingIndicator) {
        var delayMs = 1000;
        var showTyping = false;

        if (msg.body && msg.body.toString().trim().length > 0) {
          showTyping = false;
          if (isAntiBan) {
            const text = msg.body.toString();
            const charsPerSecond = 5 + Math.random() * 3; // 5 to 8 characters per second
            const baseDelay = (text.length / charsPerSecond) * 1000;
            delayMs = Math.min(4000, Math.max(1500, baseDelay + Math.random() * 500));
          } else {
            delayMs = Number(configSource.typingDuration || ctx.config?.typingDuration || 4000);
          }
        } else if (isAntiBan) {
          // Simulate prep time for attachment/sticker
          delayMs = 1000 + Math.random() * 1000;
        } else {
          delayMs = 0;
        }

        if (delayMs > 0) {
          if (showTyping) {
            try { api.sendTypingIndicator(true, threadID, () => {}); } catch (_) {}
          }
          const originalCallback = callback;
          callback = (err, data) => {
            if (showTyping) {
              try { api.sendTypingIndicator(false, threadID, () => {}); } catch (_) {}
            }
            if (typeof originalCallback === 'function') {
              originalCallback(err, data);
            }
          };
          setTimeout(() => {
            executeSend();
          }, delayMs);
        } else {
          executeSend();
        }
      } else {
        executeSend();
      }
    };

    startSending();

    return returnPromise;
  };
};
