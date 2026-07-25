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

module.exports.handleEvent = async function ({ api, event }) {
 const { threadID, body, messageID, senderID } = event;
 if (!body) return;

 const lowerBody = body.toLowerCase();

 // Global + group prefix
 const { PREFIX } = global.config;
 let threadSetting = global.data.threadData.get(threadID) || {};
 let groupPrefix = threadSetting.PREFIX || PREFIX;

 // 🔑 Own prefix check
 const userPrefixData = await global.systemData.get("user_prefixes", {});
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
