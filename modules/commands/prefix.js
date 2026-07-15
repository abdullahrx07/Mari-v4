const fs = require("fs");
const path = require("path");

module.exports.config = {
 name: "prefix",
 version: "3.0.0",
 hasPermission: 0,
 credits: "DongDev | Modified by Rx Abdullah",
 description: "Show bot prefix with random gif",
 commandCategory: "Hệ thống",
 usages: "[]",
 cooldowns: 0
};

const userPrefixPath = path.join(__dirname, "rx", "userPrefix.json");

const loadUserPrefix = () => {
  if (!fs.existsSync(userPrefixPath)) {
    fs.writeFileSync(userPrefixPath, JSON.stringify({}, null, 2));
  }
  return JSON.parse(fs.readFileSync(userPrefixPath, "utf-8"));
};

module.exports.handleEvent = async function ({ api, event }) {
 const { threadID, body, messageID, senderID } = event;
 if (!body) return;

 const lowerBody = body.toLowerCase();

 // Global + group prefix
 const { PREFIX } = global.config;
 let threadSetting = global.data.threadData.get(threadID) || {};
 let groupPrefix = threadSetting.PREFIX || PREFIX;

 // 🔑 Own prefix check
 const userPrefixData = loadUserPrefix();
 const ownPrefix = userPrefixData[String(senderID)];

 // Trigger words
 if (
 lowerBody === "prefix" ||
 lowerBody === "prefix bot là gì" ||
 lowerBody === "quên prefix r" ||
 lowerBody === "dùng sao"
 ) {
 // 🎲 Random gif
 const gifs = ["mari1.gif"];
 const randomGif = gifs[Math.floor(Math.random() * gifs.length)];
 const gifPath = path.join(__dirname, "noprefix", randomGif);

 // 📝 Build status text (own prefix line shown only if set)
 let statusText = `╭─‣ вσт ѕтαтυѕ
├‣ ѕуѕтєм : ${PREFIX}
├‣ ɢʀᴏᴜᴘ : ${groupPrefix}`;

 if (ownPrefix) {
   statusText += `\n├‣ уσυʀ σwɴ : ${ownPrefix}`;
 }

 statusText += `
├‣ ғʙ : ʀxαвᴅυℓℓαн007
╰────────────◊`;

 // 📨 Send message (text + gif)
 return api.sendMessage(
 {
 body: statusText,
 attachment: fs.createReadStream(gifPath)
 },
 threadID,
 messageID
 );
 }
};

module.exports.run = async function () {};
