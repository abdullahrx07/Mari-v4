"use strict";

var log    = require("npmlog");
var path   = require("path");
var urlMod = require("url");
var http   = require("http");
var crypto = require("crypto");

// ── thread: detect E2EE JIDs (any string containing "@") ──────────────────
function isE2EEChatJid(value) {
  return typeof value === "string" && value.indexOf("@") !== -1;
}

// ── media server: local HTTP cache for decrypted E2EE attachments ─────────
var _mediaCache  = new Map();
var _mediaServer = null;
var _mediaPort   = null;

function _cleanExpired() {
  var now = Date.now();
  _mediaCache.forEach(function (entry, id) {
    if (entry.expiry < now) _mediaCache.delete(id);
  });
}

function _startMediaServer() {
  if (_mediaServer && _mediaPort) return Promise.resolve(_mediaPort);
  return new Promise(function (resolve, reject) {
    var s = http.createServer(function (req, res) {
      var id    = req.url.replace(/^\/e2ee\//, "").split("?")[0];
      var entry = _mediaCache.get(id);
      if (!entry) { res.writeHead(404); return res.end("Not found"); }
      res.writeHead(200, {
        "Content-Type"  : entry.mimeType || "application/octet-stream",
        "Content-Length": entry.buffer.length,
        "Cache-Control" : "no-cache"
      });
      res.end(entry.buffer);
    });
    s.listen(0, "127.0.0.1", function () {
      _mediaPort   = s.address().port;
      _mediaServer = s;
      resolve(_mediaPort);
    });
    s.on("error", reject);
  });
}

async function storeMedia(buffer, mimeType) {
  var port = await _startMediaServer();
  _cleanExpired();
  var id = crypto.randomBytes(10).toString("hex");
  _mediaCache.set(id, {
    buffer  : buffer,
    mimeType: mimeType || "application/octet-stream",
    expiry  : Date.now() + 10 * 60 * 1000
  });
  return "http://127.0.0.1:" + port + "/e2ee/" + id;
}

// ── bridge: manages the native Labyrinth E2EE client lifecycle ────────────
var _dynamicImport = null;
function _getDynamicImport() {
  if (!_dynamicImport)
    _dynamicImport = new Function("specifier", "return import(specifier);");
  return _dynamicImport;
}

var _E2EE_LIB_URL = urlMod.pathToFileURL(
  path.join(__dirname, "lib", "index.mjs")
).href;

// Polyfill File / Blob for Node < 20 before the ESM bundle initialises
(function _polyfillFileGlobal() {
  try {
    if (typeof globalThis.File === "undefined") {
      var b = require("buffer");
      if (b && typeof b.File === "function") globalThis.File = b.File;
    }
    if (typeof globalThis.Blob === "undefined") {
      var b2 = require("buffer");
      if (b2 && typeof b2.Blob === "function") globalThis.Blob = b2.Blob;
    }
  } catch (_) {}
})();

function _isPromiseLike(v) { return v && typeof v.then === "function"; }

function _callUserCallback(cb, err, msg) {
  if (typeof cb !== "function") return;
  try {
    var r = cb(err, msg);
    if (_isPromiseLike(r)) r.catch(function (e) { log.error("e2ee", e); });
  } catch (e) { log.error("e2ee", e); }
}

// Mention type codes (same as meta-main/mautrix-meta):
//   p=person  s=silent  t=@everyone  a=@here  c=channel  cu=custom  ai=AI  n=unknown
// Native bridge payloads have been observed using slightly different key
// names across versions/thread types (userId / id / participantId / jid),
// and the id itself can arrive as a full JID ("123456:69@msgr") instead of
// a plain numeric Facebook UID. `_mentionUid()` normalizes all of that so
// downstream code (api.getUserInfo, command target-detection, etc.) always
// gets back a plain numeric string key — the same shape non-E2EE mentions use.
function _mentionUid(m) {
  if (!m) return null;
  var raw = m.userId != null ? m.userId
          : m.id != null ? m.id
          : m.participantId != null ? m.participantId
          : m.jid != null ? m.jid
          : m.uid != null ? m.uid
          : null;
  if (raw == null || (typeof raw === "object")) return null;
  return _numericId(String(raw));
}

function _parseMentions(arr, text) {
  var out = {};
  if (!Array.isArray(arr)) return out;
  arr.forEach(function (m) {
    var uid = _mentionUid(m);
    if (!uid) return;
    var o = Number(m && m.offset || 0), l = Number(m && m.length || 0);
    var tag = (text && l > 0) ? text.substring(o, o + l) : "";
    out[uid] = tag;
  });
  return out;
}

function _parseMentionTypes(arr) {
  var out = {};
  if (!Array.isArray(arr)) return out;
  arr.forEach(function (m) {
    var uid = _mentionUid(m);
    if (!uid) return;
    var t = m.type || m.mentionType || m.t || "p";
    out[uid] = String(t);
  });
  return out;
}

function _hasMentionType(arr, typeCode) {
  if (!Array.isArray(arr)) return false;
  return arr.some(function (m) {
    var t = m && (m.type || m.mentionType || m.t || "p");
    return t === typeCode;
  });
}

function _normalizeAttType(t) {
  if (!t) return t;
  t = String(t).toLowerCase();
  if (t === "image")               return "photo";
  if (t === "document")            return "file";
  if (t === "voice" || t === "ptt") return "audio";
  return t;
}

function _normalizeAtt(a) {
  if (!a || typeof a !== "object") return a;
  return {
    type: _normalizeAttType(a.type),
    ID: a.stickerId != null ? String(a.stickerId) : undefined,
    url: a.url, filename: a.fileName, mimeType: a.mimeType,
    fileSize: a.fileSize != null ? String(a.fileSize) : undefined,
    width: a.width, height: a.height, duration: a.duration,
    previewUrl: a.previewUrl, description: a.description, source: a.sourceText,
    mediaKey: a.mediaKey, mediaSha256: a.mediaSha256, mediaEncSha256: a.mediaEncSha256,
    directPath: a.directPath, latitude: a.latitude, longitude: a.longitude, isE2EE: true
  };
}

// Extract numeric prefix from an E2EE JID like "61568577897207:69@msgr" -> "61568577897207"
function _numericId(jid) {
  if (!jid) return "";
  var s = String(jid);
  var m = s.match(/^(\d+)/);
  return m ? m[1] : s;
}

function _mapMsg(ev) {
  var text = ev && ev.text ? String(ev.text) : "";
  var sid  = ev && ev.senderId != null ? _numericId(String(ev.senderId)) : "";
  var tid  = ev && ev.chatJid  ? String(ev.chatJid)
           : (ev && ev.threadId != null ? String(ev.threadId) : "");
  var messageReply = null;
  if (ev && ev.replyTo) {
    // Native bridge returns replyTo.messageId (not .id); support both for safety
    var _rtId = ev.replyTo.messageId != null ? ev.replyTo.messageId
              : ev.replyTo.id != null ? ev.replyTo.id : undefined;
    // senderId can arrive as an empty protobuf object {} — treat that as unknown
    var _rtSender = (ev.replyTo.senderId != null &&
                     typeof ev.replyTo.senderId !== 'object')
                  ? _numericId(String(ev.replyTo.senderId)) : "";
    messageReply = {
      messageID: _rtId != null ? String(_rtId) : undefined,
      senderID:  _rtSender,
      body:      ev.replyTo.text != null ? String(ev.replyTo.text) : "",
      isE2EE:    true
    };
  }
  var rawMentions = ev.mentions || [];
  return {
    // Mirror normal FCA convention: replies get "message_reply" so command
    // logic like `event.type === "message_reply"` (used for reply-based
    // target detection in admin.js, give.js, pp.js, etc.) also works in
    // E2EE groups. Non-reply messages keep the original "e2ee_message" type.
    type: messageReply ? "message_reply" : "e2ee_message",
    senderID: sid, body: text, threadID: tid,
    messageID: ev.id != null ? String(ev.id) : ev.id,
    messageReply: messageReply,
    attachments: Array.isArray(ev.attachments) ? ev.attachments.map(_normalizeAtt) : [],
    mentions: _parseMentions(rawMentions, text),
    mentionTypes: _parseMentionTypes(rawMentions),
    mentionedIDs: rawMentions.map(_mentionUid).filter(Boolean),
    hasMentionEveryone: _hasMentionType(rawMentions, "t"),
    hasMentionHere: _hasMentionType(rawMentions, "a"),
    timestamp: ev.timestampMs != null ? Number(ev.timestampMs) : Date.now(),
    isGroup: /@(?:g\.us|group\.facebook\.com|msgr)$/i.test(ev.chatJid || ""),
    isE2EE: true,
    e2ee: { chatJid: ev.chatJid, senderJid: ev.senderJid, replyTo: ev.replyTo || null, rawMentions: rawMentions },
    args: text.trim() ? text.trim().split(/\s+/) : []
  };
}

function _mapEdit(ev) {
  var text = ev && ev.text ? String(ev.text) : "";
  return {
    type: "e2ee_message_edit", senderID: ev && ev.senderId != null ? String(ev.senderId) : "",
    body: text, threadID: ev && ev.chatJid ? String(ev.chatJid) : "",
    messageID: ev ? ev.messageId : undefined,
    timestamp: ev && ev.timestampMs != null ? Number(ev.timestampMs) : Date.now(),
    isGroup: /@(?:g\.us|group\.facebook\.com|msgr)$/i.test(ev && ev.chatJid ? ev.chatJid : ""),
    isE2EE: true,
    e2ee: { chatJid: ev ? ev.chatJid : undefined, senderJid: ev ? ev.senderJid : undefined },
    args: text.trim() ? text.trim().split(/\s+/) : []
  };
}

function _mapReaction(ev) {
  var messageId = ev ? ev.messageId : undefined;
  // Who reacted (the native "senderId" of a reaction event is the reactor,
  // not the original message's author) — normalize JID -> plain numeric UID.
  var reactorId = ev && ev.senderId != null && typeof ev.senderId !== "object"
    ? _numericId(String(ev.senderId)) : undefined;
  // Who authored the message being reacted to — look it up from the map
  // populated when that message originally came in (see e2eeMessage handler
  // below), so `senderID` keeps the same meaning it has for non-E2EE
  // reactions (original author, used e.g. to detect "bot's own message").
  var originalAuthor;
  if (messageId != null && global._e2eeSenderJidMap) {
    var _owner = global._e2eeSenderJidMap.get(String(messageId));
    if (_owner) originalAuthor = _numericId(String(_owner));
  }
  return {
    type: "e2ee_message_reaction",
    threadID: ev && ev.chatJid ? String(ev.chatJid) : "",
    messageID: messageId, reaction: ev ? ev.reaction : undefined,
    senderID: originalAuthor != null ? originalAuthor : reactorId,
    userID:   reactorId,
    isE2EE: true,
    e2ee: { chatJid: ev ? ev.chatJid : undefined, senderJid: ev ? ev.senderJid : undefined }
  };
}

function _mapReceipt(ev) {
  return {
    type: "e2ee_receipt", isE2EE: true,
    e2ee: {
      receiptType: ev ? ev.type : undefined, chatJid: ev ? ev.chat : undefined,
      senderJid: ev ? ev.sender : undefined, messageIds: ev ? ev.messageIds : []
    }
  };
}

function _cookiesFromJar(ctx) {
  var out = {};
  var jar = [];
  try { jar = ctx.jar.getCookies("https://www.facebook.com"); } catch (_) {}
  jar.forEach(function (c) { if (c && c.key) out[c.key] = c.value; });
  if (!out.c_user && out.i_user) out.c_user = out.i_user;
  return out;
}

function _normalizeMediaInput(input) {
  if (Buffer.isBuffer(input)) return input;
  if (Array.isArray(input))   return Buffer.from(input);
  if (input && input.type === "Buffer" && Array.isArray(input.data)) return Buffer.from(input.data);
  if (typeof input === "string") return Buffer.from(input, "base64");
  throw new Error("E2EE media data must be Buffer, byte array, Buffer-JSON, or base64 string");
}

function createBridge(ctx) {
  if (ctx._e2eeBridge) return ctx._e2eeBridge;

  var state = {
    client: null, connected: false, connectingPromise: null,
    listenerAttached: false, lastGlobalCallback: null,
    lastReadyPayload: null, fullyReady: false
  };

  function _ensureEnabled() {
    if (ctx.globalOptions.enableE2EE === false)
      throw new Error("E2EE is disabled. Set enableE2EE:true in config.");
  }

  async function _loadClient() {
    var mod;
    try { mod = await _getDynamicImport()(_E2EE_LIB_URL); }
    catch (err) {
      throw new Error("Cannot load E2EE bundle (" + _E2EE_LIB_URL + "): " +
        (err && err.message ? err.message : String(err)));
    }
    if (!mod || !mod.Client)
      throw new Error("E2EE bundle loaded but Client export not found");
    return mod.Client;
  }

  function _attachEvents(initCb) {
    if (!state.client || state.listenerAttached) return;
    state.listenerAttached = true;
    if (typeof initCb === "function") state.lastGlobalCallback = initCb;

    state.client.on("ready", function (p) {
      state.lastReadyPayload = p;
      _callUserCallback(state.lastGlobalCallback, null, { type: "e2ee_ready", isE2EE: true, data: p || null });
    });
    state.client.on("fullyReady", function () {
      state.fullyReady = true;
      _callUserCallback(state.lastGlobalCallback, null, { type: "e2ee_fully_ready", isE2EE: true });
    });
    state.client.on("e2eeConnected", function () {
      _callUserCallback(state.lastGlobalCallback, null, { type: "e2ee_connected", isE2EE: true });
    });
    state.client.on("deviceDataChanged", function (p) {
      if (p && p.deviceData) ctx._e2eeDeviceData = p.deviceData;
      _callUserCallback(state.lastGlobalCallback, null,
        { type: "e2ee_device_data_changed", isE2EE: true, deviceData: p ? p.deviceData : undefined });
    });
    state.client.on("e2eeMessage", function (ev) {
      var mapped = _mapMsg(ev);
      global._e2eeMessageMap   = global._e2eeMessageMap   || new Map();
      global._e2eeSenderJidMap = global._e2eeSenderJidMap || new Map();
      if (mapped.messageID && mapped.threadID)
        global._e2eeMessageMap.set(String(mapped.messageID), String(mapped.threadID));
      if (mapped.messageID && ev.senderJid)
        global._e2eeSenderJidMap.set(String(mapped.messageID), String(ev.senderJid));
      // Track participants per thread — used by getThreadInfo for E2EE JIDs
      global._e2eeThreadParticipants = global._e2eeThreadParticipants || new Map();
      if (ev.chatJid && ev.senderJid) {
        var _ptid = String(ev.chatJid);
        if (!global._e2eeThreadParticipants.has(_ptid))
          global._e2eeThreadParticipants.set(_ptid, new Map());
        var _puid = _numericId(String(ev.senderJid));
        if (_puid) global._e2eeThreadParticipants.get(_ptid).set(_puid, String(ev.senderJid));
      }
      // Register replyTo message ID so unsend/react works on replied messages
      if (ev.replyTo && ev.chatJid) {
        var _rtReg = ev.replyTo.messageId || ev.replyTo.id;
        if (_rtReg) global._e2eeMessageMap.set(String(_rtReg), String(ev.chatJid));
      }
      _callUserCallback(state.lastGlobalCallback, null, mapped);
    });
    state.client.on("e2eeMessageEdit", function (ev) { _callUserCallback(state.lastGlobalCallback, null, _mapEdit(ev)); });
    state.client.on("e2eeReaction",    function (ev) { _callUserCallback(state.lastGlobalCallback, null, _mapReaction(ev)); });
    state.client.on("e2eeReceipt",     function (ev) { _callUserCallback(state.lastGlobalCallback, null, _mapReceipt(ev)); });
    state.client.on("error", function (err) {
      var msg = err && err.message ? err.message : String(err || "");
      if (/close 1006|unexpected EOF|ECONNRESET|ETIMEDOUT|read loop/i.test(msg)) {
        log.warn("e2ee", "Transient network error — will reconnect:", msg); return;
      }
      _callUserCallback(state.lastGlobalCallback, err || new Error("Unknown E2EE error"));
    });
    state.client.on("disconnected", function (info) {
      state.connected = false; state.fullyReady = false;
      log.warn("e2ee", "E2EE disconnected — reconnecting in 5s");
      setTimeout(function () {
        if (!state.connectingPromise) {
          var cb = (ctx && ctx._globalCallback) || state.lastGlobalCallback;
          connect(cb).catch(function (e) { log.error("e2ee", "Reconnect failed:", e && e.message ? e.message : e); });
        }
      }, 5000);
      _callUserCallback(state.lastGlobalCallback, null, { type: "e2ee_disconnected", isE2EE: true, data: info || null });
    });
  }

  async function connect(globalCallback) {
    _ensureEnabled();
    if (typeof globalCallback === "function") state.lastGlobalCallback = globalCallback;
    if (state.connected && state.client) return state.client;
    if (state.connectingPromise) return state.connectingPromise;

    state.connectingPromise = (async function () {
      var Client = await _loadClient();
      if (!state.client) {
        var cookies = _cookiesFromJar(ctx);
        if (!cookies.c_user || !cookies.xs)
          throw new Error("Cannot start E2EE: c_user/xs cookies missing");

        var opts = {
          enableE2EE: true,
          e2eeMemoryOnly: ctx.globalOptions.e2eeMemoryOnly !== false,
          autoReconnect: true, logLevel: "none"
        };
        if (ctx.globalOptions.e2eeDevicePath) opts.devicePath = ctx.globalOptions.e2eeDevicePath;
        if (ctx.globalOptions.e2eeDeviceData) opts.deviceData = ctx.globalOptions.e2eeDeviceData;
        if (!opts.deviceData && global._pendingE2eeDeviceData) {
          opts.deviceData = global._pendingE2eeDeviceData;
          delete global._pendingE2eeDeviceData;
        }

        state.client = new Client(cookies, opts);
        _attachEvents(globalCallback);
      }
      await state.client.connect();
      state.connected = true; state.fullyReady = false;
      return state.client;
    })();

    try   { return await state.connectingPromise; }
    finally { state.connectingPromise = null; }
  }

  async function disconnect() {
    if (!state.client) { state.connected = false; return; }
    try { await state.client.disconnect(); }
    finally {
      state.connected = false; state.connectingPromise = null;
      state.listenerAttached = false; state.client = null;
    }
  }

  async function _ensureClient() {
    _ensureEnabled();
    if (state.connected && state.client) return state.client;
    return connect();
  }

  var bridge = {
    connect, disconnect,
    isConnected : function () { return !!(state.client && state.connected); },
    isFullyReady: function () {
      if (!state.client || !state.connected) return false;
      if (typeof state.client.isFullyReady === "function") {
        try { return !!state.client.isFullyReady(); } catch (_) {}
      }
      return !!state.fullyReady;
    },
    getState     : function () { return state; },
    getDeviceData: async function () { return (await _ensureClient()).getDeviceData(); },
    sendMessage  : async function (jid, text, opts) {
      return (await _ensureClient()).sendE2EEMessage(jid, text, opts || {});
    },
    sendReaction : async function (jid, msgId, senderJid, emoji) {
      return (await _ensureClient()).sendE2EEReaction(jid, msgId, senderJid, emoji);
    },
    sendTyping   : async function (jid, isTyping) {
      return (await _ensureClient()).sendE2EETyping(jid, isTyping !== false);
    },
    unsendMessage: async function (jid, msgId) {
      return (await _ensureClient()).unsendE2EEMessage(jid, msgId);
    },
    markAsRead   : async function (jid, watermarkTs) {
      var client = await _ensureClient();
      return client.markAsRead(jid, watermarkTs != null ? BigInt(watermarkTs) : undefined);
    },
    editMessage  : async function (jid, msgId, text) {
      return (await _ensureClient()).editE2EEMessage(jid, msgId, text);
    },
    downloadMedia: async function (opts) {
      var client = await _ensureClient();
      var size   = opts.fileSize != null ? Number(opts.fileSize) : undefined;
      var res = await client.downloadE2EEMedia({
        directPath: opts.directPath, mediaKey: opts.mediaKey,
        mediaSha256: opts.mediaSha256, mediaEncSha256: opts.mediaEncSha256,
        mediaType: opts.mediaType, mimeType: opts.mimeType, fileSize: size
      });
      return { data: res.data, mimeType: res.mimeType, fileSize: Number(res.fileSize) };
    },
    sendMedia: async function (jid, mediaType, data, opts) {
      var client = await _ensureClient();
      var buf    = _normalizeMediaInput(data);
      var o      = opts || {};
      var ntype  = String(mediaType || "").toLowerCase();
      switch (ntype) {
        case "image":
          return client.sendE2EEImage(jid, buf, o.mimeType || "image/jpeg",
            { caption: o.caption || "", width: o.width, height: o.height,
              replyToId: o.replyToId, replyToSenderJid: o.replyToSenderJid });
        case "video":
          return client.sendE2EEVideo(jid, buf, o.mimeType || "video/mp4",
            { caption: o.caption || "", duration: o.duration, width: o.width, height: o.height,
              replyToId: o.replyToId, replyToSenderJid: o.replyToSenderJid });
        case "audio": case "voice": {
          var mime    = o.mimeType || "audio/ogg; codecs=opus";
          var isVoice = ntype === "voice" || !!o.ptt;
          return client.sendE2EEAudio(jid, buf, mime,
            { ptt: isVoice, duration: o.duration != null ? Number(o.duration) : undefined,
              replyToId: o.replyToId, replyToSenderJid: o.replyToSenderJid });
        }
        case "file": case "document":
          return client.sendE2EEDocument(jid, buf, o.filename || "file.bin",
            o.mimeType || "application/octet-stream",
            { replyToId: o.replyToId, replyToSenderJid: o.replyToSenderJid });
        case "sticker":
          return client.sendE2EESticker(jid, buf, o.mimeType || "image/webp",
            { replyToId: o.replyToId, replyToSenderJid: o.replyToSenderJid });
        default: throw new Error("Unsupported E2EE mediaType: " + ntype);
      }
    }
  };

  ctx._e2eeBridge = bridge;
  return bridge;
}

// ── patch API: wraps existing api methods to auto-route E2EE JIDs ─────────
// Call patchApiForE2EE(api, ctx) once after buildAPI() when E2EE enabled.
global._e2eeMessageMap   = global._e2eeMessageMap   || new Map();
global._e2eeSenderJidMap = global._e2eeSenderJidMap || new Map();

var _EXT_MIME = {
  jpg:"image/jpeg", jpeg:"image/jpeg", png:"image/png", gif:"image/gif",
  webp:"image/webp", bmp:"image/bmp",
  mp4:"video/mp4", mov:"video/quicktime", avi:"video/x-msvideo",
  mkv:"video/x-matroska", webm:"video/webm",
  mp3:"audio/mpeg", ogg:"audio/ogg; codecs=opus", oga:"audio/ogg; codecs=opus",
  opus:"audio/ogg; codecs=opus", wav:"audio/wav", m4a:"audio/mp4",
  aac:"audio/aac", flac:"audio/flac",
  pdf:"application/pdf", txt:"text/plain", json:"application/json"
};

function _ext(att) {
  var p = (att && att.path) ? String(att.path) : (att && att.filename ? String(att.filename) : "");
  return p.split(".").pop().toLowerCase();
}
function _mediaType(att) {
  var e = _ext(att);
  if (["jpg","jpeg","png","gif","webp","bmp"].includes(e))        return "image";
  if (["mp4","mov","avi","mkv","webm"].includes(e))               return "video";
  if (["mp3","ogg","oga","opus","wav","m4a","aac","flac"].includes(e)) return "audio";
  return "document";
}
function _mimeType(att, mt) {
  if (att && att.mimeType)    return String(att.mimeType);
  if (att && att.contentType) return String(att.contentType);
  var e = _ext(att);
  if (_EXT_MIME[e]) return _EXT_MIME[e];
  if (mt === "image") return "image/jpeg";
  if (mt === "video") return "video/mp4";
  if (mt === "audio") return "audio/ogg; codecs=opus";
  return "application/octet-stream";
}

function patchApiForE2EE(api, ctx) {
  // Routing for sendMessage/editMessage/setMessageReaction/unsendMessage is
  // integrated directly inside each fca/src/*.js file. This function only
  // adds the shared helper methods onto the api object.

  if (typeof api.downloadE2EEMedia !== "function") {
    api.downloadE2EEMedia = function (options) {
      return createBridge(ctx).downloadMedia(options);
    };
  }

  // resolveE2EEAttachment — download encrypted attachment, return local URL
  if (typeof api.resolveE2EEAttachment !== "function") {
    api.resolveE2EEAttachment = async function (att) {
      if (!att || !att.isE2EE) return att;
      if (att.url && /^https?:\/\//.test(att.url)) return att;
      if (!att.directPath || !att.mediaKey || !att.mediaSha256 || !att.mimeType) return att;
      try {
        var rawType = att.type === "photo" ? "image" : (att.type || "image");
        var res = await api.downloadE2EEMedia({
          directPath: att.directPath, mediaKey: att.mediaKey,
          mediaSha256: att.mediaSha256, mediaEncSha256: att.mediaEncSha256 || undefined,
          mediaType: rawType, mimeType: att.mimeType, fileSize: Number(att.fileSize)
        });
        var localUrl = await storeMedia(res.data, res.mimeType || att.mimeType || "image/jpeg");
        return Object.assign({}, att, { url: localUrl });
      } catch (e) {
        log.error("E2EE", "resolveE2EEAttachment failed:", e && e.message ? e.message : String(e));
        return att;
      }
    };
  }

  if (typeof api.sendTypingE2EE !== "function") {
    api.sendTypingE2EE = function (chatJid, isTyping) {
      if (!isE2EEChatJid(chatJid)) return Promise.resolve();
      return createBridge(ctx).sendTyping(chatJid, isTyping !== false).catch(function () {});
    };
  }

  // markAsRead — route E2EE JID threads through the native bridge instead of
  // the normal FCA path (which posts to a Messenger-only endpoint / publishes
  // over the regular MQTT connection, neither of which understands E2EE JIDs
  // and previously caused read receipts to silently no-op for encrypted chats).
  if (!api._origMarkAsRead) {
    api._origMarkAsRead = api.markAsRead;
    api.markAsRead = function (threadID, read, callback) {
      if (typeof read === "function") { callback = read; read = true; }
      if (read === undefined) read = true;
      if (isE2EEChatJid(threadID)) {
        var p = createBridge(ctx).markAsRead(String(threadID), Date.now());
        if (typeof callback === "function") {
          p.then(function (r) { callback(null, r); }).catch(function (e) { callback(e); });
          return;
        }
        return p;
      }
      return api._origMarkAsRead(threadID, read, callback);
    };
  }

  // ── getThreadInfo: E2EE-aware override ───────────────────────────────────
  // Normal getThreadInfo uses GraphQL with thread_fbid — that fails for E2EE
  // JIDs (which contain "@"). This override returns a synthetic threadInfo
  // built from the participant cache populated by incoming message events.
  // Fields mirror the shape of formatThreadGraphQLResponse() so existing bot
  // commands (admin checks, name lookups, etc.) work unchanged.
  if (!api._origGetThreadInfo) {
    api._origGetThreadInfo = api.getThreadInfo;
    api.getThreadInfo = function (threadID, callback) {
      if (!isE2EEChatJid(String(threadID))) {
        return api._origGetThreadInfo(threadID, callback);
      }

      var jid     = String(threadID);
      var isGroup = /@(?:g\.us|group\.facebook\.com|msgr)$/i.test(jid);
      var ptMap   = global._e2eeThreadParticipants && global._e2eeThreadParticipants.get(jid);
      var participantIDs = ptMap ? Array.from(ptMap.keys()) : [];

      var returnPromise;
      if (typeof callback !== "function") {
        var _res, _rej;
        returnPromise = new Promise(function (res, rej) { _res = res; _rej = rej; });
        callback = function (err, data) { if (err) _rej(err); else _res(data); };
      }

      function buildThreadInfo(userInfoMap) {
        return {
          threadID       : jid,
          // Group name: use cached name if available, else derive from JID prefix
          threadName     : isGroup
            ? (global._e2eeThreadNames && global._e2eeThreadNames.get(jid)) ||
              ("E2EE Group " + jid.split("@")[0])
            : null,
          participantIDs : participantIDs,
          userInfo       : participantIDs.map(function (uid) {
            var u = userInfoMap && userInfoMap[uid];
            return {
              id         : uid,
              name       : u && u.name      ? u.name      : uid,
              firstName  : u && u.firstName ? u.firstName : uid,
              vanity     : u && u.vanity    ? u.vanity    : null,
              url        : u && u.url       ? u.url       : null,
              thumbSrc   : u && u.thumbSrc  ? u.thumbSrc  : null,
              profileUrl : u && u.thumbSrc  ? u.thumbSrc  : null,
              gender     : u && u.gender    ? u.gender    : 0,
              type       : "User",
              isFriend   : false,
              isBirthday : false
            };
          }),
          unreadCount       : 0,
          messageCount      : 0,
          timestamp         : String(Date.now()),
          muteUntil         : null,
          isGroup           : isGroup,
          isSubscribed      : true,
          isArchived        : false,
          folder            : "INBOX",
          cannotReplyReason : null,
          eventReminders    : null,
          emoji             : null,
          color             : null,
          threadTheme       : null,
          nicknames         : {},
          adminIDs          : [],
          approvalMode      : false,
          approvalQueue     : [],
          isE2EE            : true,
          e2ee              : { chatJid: jid }
        };
      }

      if (participantIDs.length > 0) {
        try {
          api.getUserInfo(participantIDs, function (err, umap) {
            callback(null, buildThreadInfo(err ? null : umap));
          });
        } catch (_) {
          callback(null, buildThreadInfo(null));
        }
      } else {
        callback(null, buildThreadInfo(null));
      }

      return returnPromise;
    };
  }
}

module.exports = {
  isE2EEChatJid  : isE2EEChatJid,
  storeMedia     : storeMedia,
  createBridge   : createBridge,
  patchApiForE2EE: patchApiForE2EE
};
