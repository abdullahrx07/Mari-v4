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
  const { threadID, senderID, isE2EE, isGroup, e2ee } = event;

  const text = args.length > 0
    ? args.join(" ")
    : "📩 This is a private message from the bot to your inbox!";

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
        return api.sendMessage(
          "❌ Couldn't resolve your personal E2EE JID from this group — try messaging the bot directly first.",
          threadID
        );
      }

      if (isGroup) {
        await api.sendMessage("✅ Sent to your inbox!", threadID);
      } else {
        await api.sendMessage("✅ Sending to your inbox...", threadID);
      }
      await api.sendMessage(`📩 Inbox\n\n${text}`, personalJid);
    } else {
      // ── Normal (non-E2EE) path ──────────────────────────────────────────
      // senderID == threadID for regular DMs; for groups this opens
      // a new DM thread to the sender.
      await api.sendMessage("✅ Sending to your inbox...", threadID);
      await api.sendMessage(`📩 Inbox\n\n${text}`, senderID);
    }
  } catch (err) {
    return api.sendMessage(
      `❌ Failed to send inbox message:\n${err.message || err}`,
      threadID
    );
  }
};
