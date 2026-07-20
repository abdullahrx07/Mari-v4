module.exports.config = {
  name: "inbox",
  version: "3.0.0",
  hasPermssion: 0,
  credits: "rX",
  description: "Bot sends a private message to your personal inbox (normal FB & E2EE, even from a group)",
  commandCategory: "utility",
  usages: "[message]",
  cooldowns: 5,
};

module.exports.run = async function ({ api, event, args }) {
  const { senderID, isGroup, e2ee } = event;
  let { threadID, isE2EE } = event;
  threadID = String(threadID || "");

  // Fallback E2EE detection: if threadID is a JID (contains "@"), treat as E2EE
  // even if isE2EE flag was not set by the FCA library for this event type.
  if (!isE2EE && threadID.includes("@")) isE2EE = true;

  const text = args.length > 0
    ? args.join(" ")
    : "📩 This is a private message from the bot to your inbox!";

  const safeSend = (msg, tid) => new Promise((resolve) => {
    try {
      api.sendMessage(msg, tid, (err) => resolve(err));
    } catch (e) {
      resolve(e);
    }
  });

  try {
    if (isE2EE) {
      // ── E2EE path ──────────────────────────────────────────────────────
      // 1-to-1 E2EE chat: threadID IS already the user's personal JID.
      // Group E2EE chat: threadID is the GROUP jid — sending there would
      // just post back in the group, not the user's inbox. We need the
      // sender's own JID (with device suffix) to open a real 1-1 chat —
      // that's carried on event.e2ee.senderJid (see includes/Fca/e2ee.js
      // _mapMsg -> e2ee: { chatJid, senderJid, ... }).
      const personalJid = isGroup
        ? (e2ee && e2ee.senderJid ? String(e2ee.senderJid) : null)
        : threadID;

      if (!personalJid) {
        return safeSend(
          "❌ Couldn't resolve your personal E2EE JID from this group — try messaging the bot directly first.",
          threadID
        );
      }

      await safeSend(isGroup ? "✅ Sent to your inbox!" : "✅ Sending to your inbox...", threadID);
      await safeSend(`📩 Inbox\n\n${text}`, personalJid);
    } else {
      // ── Normal (non-E2EE) path ──────────────────────────────────────────
      // senderID must be a plain numeric Facebook user ID here.
      // If it looks like a JID, bail rather than sending to a broken thread ID.
      const sid = String(senderID || "");
      if (sid.includes("@")) {
        return safeSend(
          "❌ Could not determine your inbox ID. If you're in an E2EE thread, message the bot directly first.",
          threadID
        );
      }
      await safeSend("✅ Sending to your inbox...", threadID);
      await safeSend(`📩 Inbox\n\n${text}`, sid);
    }
  } catch (err) {
    return safeSend(
      `❌ Failed to send inbox message:\n${err.message || err}`,
      threadID
    );
  }
};
