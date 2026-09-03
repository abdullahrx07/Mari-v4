"use strict";

const utils = require("../utils");

// Updated string-based reaction IDs (from FB GraphQL)
// THIS CODE MADE BY RX ABDULLAH [DO NOT CHANGE AUTOR TO GET NEW UPDATE]
const REACTION_ID_MAP = {
  0:  null,                   // unlike
  1:  "1635855486666999",     // like
  2:  "1678524932434102",     // love/heart
  16: "1678524932434102",     // love (alias)
  4:  "613557422527858",      // haha
  3:  "478547315650144",      // wow
  7:  "286193415024482",      // sad
  8:  "583784041771853",      // angry
};

function formatData(resData) {
  if (!resData) return {};
  const reactData = resData.feedback_react || resData.feedback_react_v2;
  if (!reactData || !reactData.feedback) return resData;
  return {
    viewer_feedback_reaction_info: reactData.feedback.viewer_feedback_reaction_info,
    supported_reactions: reactData.feedback.supported_reactions,
    top_reactions: reactData.feedback.top_reactions
      ? reactData.feedback.top_reactions.edges
      : [],
    reaction_count: reactData.feedback.reaction_count,
  };
}

module.exports = function (defaultFuncs, api, ctx) {
  return function setPostReaction(postID, type, callback) {
    let resolveFunc = () => {};
    let rejectFunc  = () => {};
    const returnPromise = new Promise((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc  = reject;
    });

    if (!callback) {
      if (utils.getType(type) === "Function" || utils.getType(type) === "AsyncFunction") {
        callback = type;
        type = 0;
      } else {
        callback = (err, data) => err ? rejectFunc(err) : resolveFunc(data);
      }
    }

    const typeMap = {
      0: 0, 1: 1, 2: 2, 16: 16, 4: 4, 3: 3, 7: 7, 8: 8,
      unlike: 0, like: 1, heart: 2, love: 16,
      haha: 4, wow: 3, sad: 7, angry: 8,
    };

    if (type !== undefined && type !== null) {
      const key = String(type).toLowerCase();
      if (Object.prototype.hasOwnProperty.call(typeMap, key)) type = typeMap[key];
    }

    if (typeof type !== "number" || isNaN(type)) {
      callback({ error: "setPostReaction: Invalid reaction type" });
      return returnPromise;
    }

    const feedbackID = postID ? Buffer.from("feedback:" + postID).toString("base64") : "";
    const reactionID = REACTION_ID_MAP[type];

    // ttstamp fallback — same algo as utils.makeDefaults
    const ttstamp = ctx.ttstamp || (() => {
      let t = "2";
      for (let i = 0; i < ctx.fb_dtsg.length; i++) t += ctx.fb_dtsg.charCodeAt(i);
      return t;
    })();

    // Build input — only include feedback_reaction_id when not unliking
    const input = {
      actor_id:              ctx.userID,
      feedback_id:           feedbackID,
      feedback_source:       "OBJECT",
      is_tracking_encrypted: true,
      tracking:              [],
      session_id:            utils.getGUID(),
      client_mutation_id:    Math.round(Math.random() * 19).toString(),
    };
    if (reactionID) input.feedback_reaction_id = reactionID;

    const form = {
      av:                        ctx.userID,
      __aaid:                    0,
      __user:                    ctx.userID,
      __a:                       1,
      __req:                     utils.getSignatureID(),
      __hs:                      ctx.fb_dtsg_ag,
      dpr:                       1,
      __ccg:                     "EXCELLENT",
      __rev:                     ctx.req_ID,
      __s:                       utils.getSignatureID(),
      __hsi:                     ctx.hsi,
      __comet_req:               15,
      fb_dtsg:                   ctx.fb_dtsg,
      jazoest:                   ttstamp,
      lsd:                       ctx.fb_dtsg,
      __spin_r:                  ctx.req_ID,
      __spin_b:                  "trunk",
      __spin_t:                  Math.floor(Date.now() / 1000),
      server_timestamps:         true,
      fb_api_caller_class:       "RelayModern",
      fb_api_req_friendly_name:  "CometUFIFeedbackReactMutation",
      doc_id:                    "4769042373179384",
      variables: JSON.stringify({
        input,
        useDefaultActor:       false,
        scale:                 1,
        canUseNicknameOnComet: false,
      }),
    };

    defaultFuncs
      .post("https://www.facebook.com/api/graphql/", ctx.jar, form)
      .then(utils.parseAndCheckLogin(ctx, defaultFuncs))
      .then(function (resData) {
        if (!resData) throw { error: "setPostReaction returned empty object." };
        if (resData.error || resData.errors) throw resData;
        return callback(null, formatData(resData.data || resData));
      })
      .catch(function (err) {
        console.error("setPostReaction", err);
        return callback(err);
      });

    return returnPromise;
  };
};
