module.exports.config = {
  name: "inbox",
  version: "2.0.0",
  hasPermssion: 0,
  credits: "rX",
  description: "Bot sends a private message to you (works in normal & E2EE)",
  commandCategory: "utility",
  usages: "[message]",
  cooldowns: 5,
};

module.exports.run = async function ({ api, event, args }) {
  const { threadID, senderID, isE2EE } = event;

  // Message to send — default if no args given
  const text = args.length > 0
    ? args.join(" ")
    : "📩 This is a private message from the bot to your inbox!";

  try {
    if (isE2EE) {
      // ── E2EE path ────────────────────────────────────────────────
      // For 1-to-1 E2EE chat: threadID IS the user's JID already.
      // api.sendMessage routes to E2EE bridge automatically when
      // threadID contains "@" (see includes/Fca/src/sendMessage.js).
      await api.sendMessage("✅ Sending to your inbox...", threadID);
      await api.sendMessage(`📩 Inbox\n\n${text}`, threadID);
    } else {
      // ── Normal path ───────────────────────────────────────────────
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
