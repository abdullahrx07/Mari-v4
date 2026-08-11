const axios = require("axios");

let simsim = "";
let count_req = 0; 
// Note : THIS CODE MADE BY RX @RX_ABDULLAH007 (GIVE CREDIT OTHERWISE EVERYONE FUCK YOU AT 300 KM SPEED)

// 🔒 threadID lock — thread thake trigger active thakle porer trigger ignore hobe
const triggerLocks = new Set();

async function sendTypingIndicatorV2(sendTyping, threadID) {
 try {
 var wsContent = {
 app_id: 2220391788200892,
 payload: JSON.stringify({
 label: 3, //original author - rX Abdullah
 payload: JSON.stringify({
 thread_key: threadID.toString(),
 is_group_thread: +(threadID.toString().length >= 16),
 is_typing: +sendTyping,
 attribution: 0
 }),
 version: 5849951561777440
 }),
 request_id: ++count_req,
 type: 4
 };
 await new Promise((resolve, reject) =>
 mqttClient.publish('/ls_req', JSON.stringify(wsContent), {}, (err, _packet) =>
 err ? reject(err) : resolve()
 )
 );
 } catch (err) {
 console.log("⚠️ Typing indicator error:", err.message);
 }
}

(async () => {
 try {
 const res = await axios.get("https://raw.githubusercontent.com/abdullahrx07/X-api/main/MaRiA/baseApiUrl.json");
 if (res.data && res.data.mari) simsim = res.data.mari;
 } catch {}
})();

// 🤖 bot's own UID cache — resolved lazily from api.getCurrentUserID()
let botUID = null;
function getBotUID(api) {
 if (botUID) return botUID;
 try {
 if (typeof api.getCurrentUserID === "function") {
 botUID = api.getCurrentUserID();
 }
 } catch {}
 return botUID;
}

module.exports.config = {
 name: "baby",
 aliases: ["maria", "hippi"],
 premium: false, 
 version: "1.2.1",
 hasPermssion: 0,
 credits: "rX",
 description: "AI auto teach with Teach & List support + Typing effect",
 commandCategory: "chat",
 usages: "[query]\nlist\nteach [Question] - [Reply]\nedit [Question] - [OldReply] - [NewReply]\nremove/rm [Question] - [Reply]\ndel (reply to bot's wrong answer)\nmsg [trigger]\nmsg [trigger] -20 (custom show limit)\nautoteach on/off",
 cooldowns: 0,
 prefix: false
};

module.exports.run = async function ({ api, event, args, Users }) {
 const uid = event.senderID;
 const senderName = await Users.getNameUser(uid);
 const query = args.join(" ").toLowerCase();

 try {
 if (!simsim) return api.sendMessage("❌ API not loaded yet.", event.threadID, event.messageID);

 if (args[0] === "autoteach") {
 const mode = args[1];
 if (!["on", "off"].includes(mode))
 return api.sendMessage("✅ Use: baby autoteach on/off", event.threadID, event.messageID);

 const status = mode === "on";
 await axios.post(`${simsim}/setting`, { autoTeach: status });
 return api.sendMessage(`✅ Auto teach is now ${status ? "ON 🟢" : "OFF 🔴"}`, event.threadID, event.messageID);
 }

 if (args[0] === "list") {
 const res = await axios.get(`${simsim}/list`);
 return api.sendMessage(
 `╭─╼🌟 𝐁𝐚𝐛𝐲 𝐀𝐈 𝐒𝐭𝐚𝐭𝐮𝐬\n├ 📝 𝐓𝐞𝐚𝐜𝐡𝐞𝐝 𝐐𝐮𝐞𝐬𝐭𝐢𝐨𝐧𝐬: ${res.data.totalQuestions}\n├ 📦 𝐒𝐭𝐨𝐫𝐞𝐝 𝐑𝐞𝐩𝐥𝐢𝐞𝐬: ${res.data.totalReplies}\n╰─╼👤 𝐃𝐞𝐯𝐞𝐥𝐨𝐩𝐞𝐫: 𝐫𝐗 𝐀𝐛𝐝𝐮𝐥𝐥𝐚𝐡`,
 event.threadID,
 event.messageID
 );
 }

 if (args[0] === "msg") {
 let trigger = args.slice(1).join(" ").trim();
 if (!trigger) return api.sendMessage("❌ | Use: !baby msg [trigger]\nOr: !baby msg [trigger] -20 (custom limit)", event.threadID, event.messageID);

 // 🔢 optional custom limit: "!baby msg trigger -20" → shows only 20 replies
 let customLimit = null;
 const limitMatch = trigger.match(/\s*-(\d+)\s*$/);
 if (limitMatch) {
 customLimit = parseInt(limitMatch[1], 10);
 trigger = trigger.replace(/\s*-(\d+)\s*$/, "").trim();
 if (!trigger) return api.sendMessage("❌ | Use: !baby msg [trigger] -20", event.threadID, event.messageID);
 }

 const res = await axios.get(`${simsim}/simsimi-list?ask=${encodeURIComponent(trigger)}`);
 if (!res.data.replies || res.data.replies.length === 0)
 return api.sendMessage("❌ No replies found.", event.threadID, event.messageID);

 // 🔢 150+ reply thakle shudhu limit porjonto show korbe, baki koyta ase seta note hisebe dekhabe
 const REPLY_LIMIT = (customLimit && customLimit > 0) ? customLimit : 150;
 const allReplies = res.data.replies;
 const shownReplies = allReplies.slice(0, REPLY_LIMIT);
 const remaining = allReplies.length - shownReplies.length;

 const formatted = shownReplies.map((rep, i) => `➤ ${i + 1}. ${rep}`).join("\n");
 const limitNote = remaining > 0
 ? `\n⚠️ ${REPLY_LIMIT} 𝐭𝐚 𝐫𝐞𝐩𝐥𝐲 𝐝𝐞𝐤𝐡𝐚𝐧𝐨 𝐡𝐨𝐲𝐞𝐜𝐡𝐞, 𝐚𝐫𝐨 ${remaining} 𝐭𝐚 𝐛𝐚𝐤𝐢 𝐚𝐜𝐡𝐞 (𝐝𝐞𝐤𝐡𝐚𝐧𝐨 𝐣𝐚𝐜𝐜𝐡𝐞 𝐧𝐚, 𝐭𝐚𝐛𝐞 𝐤𝐢𝐩 𝐬𝐡𝐮𝐛𝐡 𝐫𝐞𝐩𝐥𝐢𝐫 𝐮𝐩𝐨𝐫 𝐤𝐚𝐣 𝐤𝐨𝐫𝐛𝐞)।\n`
 : "";
 const msg = `📌 𝗧𝗿𝗶𝗴𝗴𝗲𝗿: ${trigger.toUpperCase()}\n📋 𝗧𝗼𝘁𝗮𝗹: ${res.data.total}\n━━━━━━━━━━━━━━\n${formatted}\n━━━━━━━━━━━━━━${limitNote}✏️ Reply with the numbers you want to KEEP (e.g. "2, 7") — everything else will be removed.`;

 return api.sendMessage(msg, event.threadID, (err, info) => {
 if (!err) {
 global.client.handleReply.push({
 name: module.exports.config.name,
 messageID: info.messageID,
 author: event.senderID,
 type: "msgSelect",
 trigger
 });
 }
 }, event.messageID);
 }

 if (args[0] === "teach") {
 const parts = query.replace("teach ", "").split(" - ");
 if (parts.length < 2)
 return api.sendMessage("❌ | Use: teach [Question] - [Reply]", event.threadID, event.messageID);

 const [ask, ans] = parts;
 const res = await axios.get(`${simsim}/teach?ask=${encodeURIComponent(ask)}&ans=${encodeURIComponent(ans)}&senderID=${uid}&senderName=${encodeURIComponent(senderName)}`);
 return api.sendMessage(`✅ ${res.data.message}`, event.threadID, event.messageID);
 }

 if (args[0] === "edit") {
 const parts = query.replace("edit ", "").split(" - ");
 if (parts.length < 3)
 return api.sendMessage("❌ | Use: edit [Question] - [OldReply] - [NewReply]", event.threadID, event.messageID);

 const [ask, oldR, newR] = parts;
 const res = await axios.get(`${simsim}/edit?ask=${encodeURIComponent(ask)}&old=${encodeURIComponent(oldR)}&new=${encodeURIComponent(newR)}`);
 return api.sendMessage(res.data.message, event.threadID, event.messageID);
 }

 if (["remove", "rm"].includes(args[0])) {
 const parts = query.replace(/^(remove|rm)\s*/, "").split(" - ");
 if (parts.length < 2)
 return api.sendMessage("❌ | Use: remove [Question] - [Reply]", event.threadID, event.messageID);

 const [ask, ans] = parts;
 const res = await axios.get(`${simsim}/delete?ask=${encodeURIComponent(ask)}&ans=${encodeURIComponent(ans)}`);
 return api.sendMessage(res.data.message, event.threadID, event.messageID);
 }

 if (args[0] === "del") {
 return api.sendMessage(
 "❌ | Reply to the bot's wrong answer message with \"!baby del\" to delete it.",
 event.threadID,
 event.messageID
 );
 }

 if (!query) {
 const texts = ["Hey baby 💖", "Yes, I'm here 😘"];
 const reply = texts[Math.floor(Math.random() * texts.length)];
 return api.sendMessage(reply, event.threadID);
 }

 await sendTypingIndicatorV2(true, event.threadID);
 await new Promise(r => setTimeout(r, 2000));
 await sendTypingIndicatorV2(false, event.threadID);

 const res = await axios.get(`${simsim}/simsimi?text=${encodeURIComponent(query)}&senderName=${encodeURIComponent(senderName)}`);
 return api.sendMessage(res.data.response, event.threadID, (err, info) => {
 if (!err) {
 global.client.handleReply.push({
 name: module.exports.config.name,
 messageID: info.messageID,
 author: event.senderID,
 type: "simsimi"
 });
 }
 }, event.messageID);

 } catch (e) {
 return api.sendMessage(`❌ Error: ${e.message}`, event.threadID, event.messageID);
 }
};

module.exports.handleReply = async function ({ api, event, Users, handleReply }) {
 const senderName = await Users.getNameUser(event.senderID);
 const text = event.body?.trim();
 const lowered = text?.toLowerCase();
 if (!text || !simsim) return;

 // ==========================
 //  !baby del  — reply to bot's wrong answer to delete it
 // ==========================
 if (lowered === "del" || lowered === "!baby del") {
 try {
 const originalReply = handleReply?.body; // bot's original sent message text
 if (!originalReply) {
 return api.sendMessage("❌ Couldn't read the original message to delete.", event.threadID, event.messageID);
 }

 const res = await axios.get(`${simsim}/deleteByReply?reply=${encodeURIComponent(originalReply)}`);
 return api.sendMessage(res.data.message, event.threadID, event.messageID);
 } catch (e) {
 return api.sendMessage(`❌ Failed to delete: ${e.message}`, event.threadID, event.messageID);
 }
 }

 // ==========================
 //  !baby msg selection — "keep these numbers" reply
 // ==========================
 if (handleReply?.type === "msgSelect") {
 // only original command caller can respond
 if (event.senderID !== handleReply.author) return;

 const numbers = text
 .split(",")
 .map(n => parseInt(n.trim(), 10))
 .filter(n => Number.isInteger(n));

 if (numbers.length === 0) {
 return api.sendMessage("❌ Send numbers like: 2, 7", event.threadID, event.messageID);
 }

 try {
 const res = await axios.post(`${simsim}/keepOnly`, {
 ask: handleReply.trigger,
 keepIndexes: numbers
 });
 return api.sendMessage(res.data.message, event.threadID, event.messageID);
 } catch (e) {
 return api.sendMessage(`❌ Failed to update: ${e.message}`, event.threadID, event.messageID);
 }
 }

 // ==========================
 //  normal simsimi conversation continuation
 // ==========================
 try {
 await sendTypingIndicatorV2(true, event.threadID);
 await new Promise(r => setTimeout(r, 2000));
 await sendTypingIndicatorV2(false, event.threadID);

 const res = await axios.get(`${simsim}/simsimi?text=${encodeURIComponent(lowered)}&senderName=${encodeURIComponent(senderName)}`);
 return api.sendMessage(res.data.response, event.threadID, (err, info) => {
 if (!err) {
 global.client.handleReply.push({
 name: module.exports.config.name,
 messageID: info.messageID,
 author: event.senderID,
 type: "simsimi"
 });
 }
 }, event.messageID);
 } catch (e) {
 return api.sendMessage(`❌ Error: ${e.message}`, event.threadID, event.messageID);
 }
};

const greetingReplies = [
 "𝐀𝐬𝐬𝐚𝐥𝐚𝐦𝐮 𝐰𝐚𝐥𝐚𝐢𝐤𝐮𝐦 ♥",
 "বলেন sir__😌",
 "𝐁𝐨𝐥𝐨 𝐣𝐚𝐧 𝐤𝐢 𝐤𝐨𝐫𝐭𝐞 𝐩𝐚𝐫𝐢 𝐭𝐨𝐦𝐫 𝐣𝐨𝐧𝐧𝐨 🐸",
 "𝐋𝐞𝐛𝐮 𝐤𝐡𝐚𝐰 𝐝𝐚𝐤𝐭𝐞 𝐝𝐚𝐤𝐭𝐞 𝐭𝐨 𝐡𝐚𝐩𝐚𝐲 𝐠𝐞𝐬𝐨",
 "𝐆𝐚𝐧𝐣𝐚 𝐤𝐡𝐚 𝐦𝐚𝐧𝐮𝐬𝐡 𝐡𝐨 🍁",
 "𝐋𝐞𝐦𝐨𝐧 𝐭𝐮𝐬 🍋",
 "মুড়ি খাও 🫥",
 ".__𝐚𝐦𝐤𝐞 𝐬𝐞𝐫𝐞 𝐝𝐞𝐰 𝐚𝐦𝐢 𝐚𝐦𝐦𝐮𝐫 𝐤𝐚𝐬𝐞 𝐣𝐚𝐛𝐨!!🥺.....😗",
 "লুঙ্গি টা ধর মুতে আসি🙊🙉",
 "──‎ 𝐇𝐮𝐌..? 👉👈",
 "আম গাছে আম নাই ঢিল কেন মারো, তোমার সাথে প্রেম নাই বেবি কেন ডাকো 😒🐸",
 "কি হলো, মিস টিস করচ্ছো নাকি 🤣",
 "𝐓𝐫𝐮𝐬𝐭 𝐦𝐞 𝐢𝐚𝐦 𝐦𝐚𝐫ɪ𝐚 🧃",
 "𝐇ᴇʏ 𝐗ᴀɴ 𝐈'ᴍ 𝐌𝐚𝐫ɪ𝐚 𝐁𝐚𝐛𝐲✨"
];

// shared greeting sender — used for bare-word trigger AND bot mentions
async function sendGreeting(api, event) {
 const reply = greetingReplies[Math.floor(Math.random() * greetingReplies.length)];

 await sendTypingIndicatorV2(true, event.threadID);
 await new Promise(r => setTimeout(r, 5000));
 await sendTypingIndicatorV2(false, event.threadID);

 return api.sendMessage(reply, event.threadID, (err, info) => {
 if (!err) {
 global.client.handleReply.push({
 name: module.exports.config.name,
 messageID: info.messageID,
 author: event.senderID,
 type: "simsimi"
 });
 }
 });
}

// checks event.mentions (standard fca-style map: { "<uid>": "name", ... }) for bot's own uid
function isBotMentioned(event, uid) {
 if (!uid || !event.mentions) return false;
 return Object.prototype.hasOwnProperty.call(event.mentions, uid);
}

module.exports.handleEvent = async function ({ api, event, Users }) {
 const text = event.body?.toLowerCase().trim();
 if (!simsim) return;

 const senderName = await Users.getNameUser(event.senderID);
 const triggers = ["baby", "bby", "xan", "bbz", "mari", "মারিয়া"];
 const uid = getBotUID(api);

 // ==========================
 //  Bot mentioned directly — always greeting, regardless of extra text
 // ==========================
 if (isBotMentioned(event, uid)) {
 if (triggerLocks.has(event.threadID)) return;
 triggerLocks.add(event.threadID);
 try {
 return await sendGreeting(api, event);
 } finally {
 triggerLocks.delete(event.threadID);
 }
 }

 if (!text) return;

 if (triggers.includes(text)) {
 // 🔒 typing chola obosthay same thread theke abar trigger asle ignore
 if (triggerLocks.has(event.threadID)) return;
 triggerLocks.add(event.threadID);

 try {
 return await sendGreeting(api, event);
 } finally {
 triggerLocks.delete(event.threadID);
 }
 }

 const matchPrefix = /^(baby|bby|xan|bbz|mari|মারিয়া)\s+/i;
 if (matchPrefix.test(text)) {
 const query = text.replace(matchPrefix, "").trim();
 if (!query) return;

 // 🔒 typing chola obosthay same thread theke abar trigger asle ignore
 if (triggerLocks.has(event.threadID)) return;
 triggerLocks.add(event.threadID);

 try {
 await sendTypingIndicatorV2(true, event.threadID);
 await new Promise(r => setTimeout(r, 5000));
 await sendTypingIndicatorV2(false, event.threadID);

 const res = await axios.get(`${simsim}/simsimi?text=${encodeURIComponent(query)}&senderName=${encodeURIComponent(senderName)}`);
 return api.sendMessage(res.data.response, event.threadID, (err, info) => {
 if (!err) {
 global.client.handleReply.push({
 name: module.exports.config.name,
 messageID: info.messageID,
 author: event.senderID,
 type: "simsimi"
 });
 }
 }, event.messageID);
 } catch (e) {
 return api.sendMessage(`❌ Error: ${e.message}`, event.threadID, event.messageID);
 } finally {
 triggerLocks.delete(event.threadID);
 }
 }

 if (event.type === "message_reply") {
 try {
 const setting = await axios.get(`${simsim}/setting`);
 if (!setting.data.autoTeach) return;

 const ask = event.messageReply.body?.toLowerCase().trim();
 const ans = event.body?.toLowerCase().trim();
 if (!ask || !ans || ask === ans) return;

 setTimeout(async () => {
 try {
 await axios.get(`${simsim}/teach?ask=${encodeURIComponent(ask)}&ans=${encodeURIComponent(ans)}&senderName=${encodeURIComponent(senderName)}`);
 console.log("✅ Auto-taught:", ask, "→", ans);
 } catch (err) {
 console.error("❌ Auto-teach internal error:", err.message);
 }
 }, 300);
 } catch (e) {
 console.log("❌ Auto-teach setting error:", e.message);
 }
 }
};
