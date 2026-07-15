module.exports.config = {
 name: "pp",
 alishes: "uid, pp", 
 version: "1.1.0",
 hasPermssion: 0,
 credits: "rX",
 description: "Get a user's profile picture (UID, reply, mention, full name or link).",
 commandCategory: "Công cụ",
 cooldowns: 0
};

module.exports.run = async function({ event, api, args, Users, client }) {
 const fs = global.nodemodule["fs-extra"];
 const request = global.nodemodule["request"];

 let uid;

 // ===== Helper: Full Name Mention Detection =====
 async function getUIDByFullName(api, threadID, body) {
 if (!body.includes("@")) return null;
 const match = body.match(/@(.+)/);
 if (!match) return null;

 const targetName = match[1].trim().toLowerCase().replace(/\s+/g, " ");
 const threadInfo = await api.getThreadInfo(threadID);
 const users = threadInfo.userInfo || [];

 const user = users.find(u => {
 if (!u.name) return false;
 const fullName = u.name.trim().toLowerCase().replace(/\s+/g, " ");
 return fullName === targetName;
 });

 return user ? user.id : null;
 }

 // ===== Determine UID =====
 if (event.type === "message_reply") {
 uid = event.messageReply.senderID;
 } else if (args[0]) {
 if (args[0].indexOf(".com/") !== -1) {
 // Facebook profile link
 uid = await api.getUID(args[0]);
 } else if (args.join().includes("@")) {
 // Mention or full name
 uid = Object.keys(event.mentions || {})[0];
 if (!uid) {
 // Try full name detection
 uid = await getUIDByFullName(api, event.threadID, args.join(" "));
 }
 } else {
 uid = args[0]; // Assume direct UID
 }
 } else {
 uid = event.senderID; // Default to sender
 }

 if (!uid) return api.sendMessage("❌ Could not detect the user.", event.threadID, event.messageID);

 // ===== Get user info =====
 const userInfo = await api.getUserInfo(uid);
 const name = userInfo[uid]?.name || "Unknown";

 // ===== Download profile picture =====
 const pathImg = __dirname + "/cache/1.png";
 const callback = () => api.sendMessage({
 body: `== Profile ==\nName: ${name}\nID: ${uid}`,
 attachment: fs.createReadStream(pathImg)
 }, event.threadID, () => fs.unlinkSync(pathImg), event.messageID);

 const url = `https://graph.facebook.com/${uid}/picture?height=1500&width=1500&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`;
 return request(encodeURI(url)).pipe(fs.createWriteStream(pathImg)).on('close', () => callback());
};
