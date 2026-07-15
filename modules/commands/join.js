const Buffer = require("buffer").Buffer;

const _c = "clggWCBBYmR1bGxhaA==";

function decodeMsg(encoded) {
  return Buffer.from(encoded, "base64").toString("utf8");
}

module.exports.config = {
  name: "join",
  version: "2.0",
  credits: decodeMsg(_c),
  cooldowns: 5,
  hasPermission: 2,
  description: "Choose a group from bot's list to join",
  usePrefix: true,
  commandCategory: "General",
  usage: "!allgc",
};

// --- rX ---
function checkCredits(event, api) {
  if (module.exports.config.credits !== decodeMsg(_c)) {
    module.exports.config.credits = decodeMsg(_c);

    // msg
    const warn = "Q3JlZGl0IGhhcyBiZWVuIG1vZGlmaWVkLiBJdCBoYXMgYmVlbiByZXNldCB0byByWCBBYmR1bGxhaC4=";
    api.sendMessage(decodeMsg(warn), event.threadID);
  }
}

// Main run
module.exports.run = async function ({ api, event }) {
  checkCredits(event, api); // always check credits first

  try {
    const allThreads = await api.getThreadList(100, null, ["INBOX"]);
    const groups = allThreads.filter(t => t.isGroup);

    if (groups.length === 0) {
      return api.sendMessage("❌ Bot is not in any group.", event.threadID);
    }

    let msg = "📌 Groups the bot is in:\n\n";
    groups.forEach((g, i) => {
      msg += `${i + 1}. ${g.name || "Unnamed Group"}\n`;
    });
    msg += `\n👉 Reply with the number of the group you want to join.`;

    return api.sendMessage(msg, event.threadID, (err, info) => {
      global.client.handleReply.push({
        type: "chooseGroup",
        name: module.exports.config.name,
        author: event.senderID,
        messageID: info.messageID,
        groups
      });
    });

  } catch (error) {
    console.error("Error fetching groups:", error);
    return api.sendMessage("⚠️ Failed to get group list.", event.threadID);
  }
};

module.exports.handleReply = async function ({ api, event, handleReply }) {
  checkCredits(event, api); // check credit lock here too

  if (handleReply.type !== "chooseGroup") return;
  if (event.senderID !== handleReply.author) return;

  const choice = parseInt(event.body);
  if (isNaN(choice) || choice < 1 || choice > handleReply.groups.length) {
    return api.sendMessage("❌ Invalid number.", event.threadID);
  }

  const selectedGroup = handleReply.groups[choice - 1];
  const userId = event.senderID;

  try {
    const threadInfo = await api.getThreadInfo(selectedGroup.threadID);
    const participantIds = threadInfo.participantIDs;

    if (participantIds.includes(userId)) {
      return api.sendMessage("⚠️ Already Added", event.threadID);
    } else {
      await api.addUserToGroup(userId, selectedGroup.threadID);
      return api.sendMessage(`✅ Added to (${selectedGroup.name || "Unnamed Group"})`, event.threadID);
    }
  } catch (error) {
    console.error("Error adding user to group:", error);
    return api.sendMessage("⚠️ Failed to add you. Please message the bot in inbox first.", event.threadID);
  }
};
