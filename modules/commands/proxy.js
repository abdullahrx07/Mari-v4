module.exports.config = {
  name: "proxy",
  version: "1.0.2",
  hasPermssion: 0,
  credits: "rX Abdullah",
  description: "rX Proxy Server",
  commandCategory: "Utility",
  usages: "Proxy server",
  cooldowns: 5,
  prefix: false, // <-- no prefix system চালু হলো
};

module.exports.languages = {
  "en": {
    "menu": "> 🌐 𝐏𝐫𝐨𝐱𝐲 𝐒𝐞𝐭𝐮𝐩\n\n1️⃣ Proxy for iOS\n2️⃣ Proxy for Android\n\n👉 Reply the number (1 or 2)",
    "invalid": "❌ Invalid choice! Please reply 1 or 2.",
    "confirm": "⚙️ You chose: %1\n\nReact 👍 to continue\nReact 😡 to cancel.",
    "cancel": "❌ OK, cancelled.",
    "continue": "✅ Join this link to continue:\nhttps://t.me/rxabdullah10"
  }
};

module.exports.handleReaction = async function({ api, event, handleReaction, getText }) {
  if (event.userID != handleReaction.author) return;

  const { threadID, reaction } = event;
  const messageID = handleReaction.messageID;

  if (reaction == "👍") {
    await api.editMessage(getText("continue"), messageID);
  } 
  else if (reaction == "😡") {
    await api.editMessage(getText("cancel"), messageID);
  }
};

module.exports.handleReply = async function({ api, event, handleReply, getText }) {
  if (event.senderID != handleReply.author) return;

  const { threadID, messageID, body } = event;
  const choice = body.trim();

  if (choice != "1" && choice != "2") {
    return api.sendMessage(getText("invalid"), threadID, messageID);
  }

  const chosen = choice == "1" ? "Proxy for iOS" : "Proxy for Android";

  await api.editMessage(getText("confirm", chosen), handleReply.messageID);

  global.client.handleReaction.push({
    name: module.exports.config.name,
    messageID: handleReply.messageID,
    author: event.senderID
  });
};

module.exports.run = async function({ api, event, getText }) {
  return api.sendMessage(
    getText("menu"),
    event.threadID,
    (err, info) => {
      global.client.handleReply.push({
        name: module.exports.config.name,
        messageID: info.messageID,
        author: event.senderID
      });
    }
  );
};

// === Custom trigger system ===
// এই অংশটা নিশ্চিত করবে যে শুধুমাত্র "Proxy server" লিখলেই command ট্রিগার হবে
module.exports.handleEvent = async function({ api, event }) {
  if (!event.body) return;
  const text = event.body.trim().toLowerCase();

  if (text === "proxy server") {
    module.exports.run({ api, event, getText: (key, ...args) => {
      const lang = module.exports.languages["en"];
      return lang[key].replace(/%(\d+)/g, (_, n) => args[n - 1]);
    }});
  }
};
