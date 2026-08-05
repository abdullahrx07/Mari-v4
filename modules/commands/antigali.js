let antiGaliStatus = false; // Default Off
let offenseTracker = {}; // threadID -> userID -> { count, uidSaved }
let skipMode = 0; // 0 = no skip, 1 = admin only skip, 2 = admin + group admin skip

const badWords = [
  "কুত্তার বাচ্চা","মাগী","মাগীচোদ","চোদা","চুদ","চুদা","চুদামারান",
  "চুদির","চুত","চুদি","চুতমারানি","চুদের বাচ্চা","shawya","বালের","বালের ছেলে","বালছাল",
  "বালছাল কথা","মাগীর ছেলে","রান্ডি","রান্দি","রান্দির ছেলে","বেশ্যা","বেশ্যাপনা",
  "Khanki","mgi","তোকে চুদি","তুই চুদ","fuck","f***","fck","mc","bc","xdi","abal","fucking",
  "motherfucker","guyar","mfer","motherfuer","mthrfckr","putki","abdullak chudi","abdullak xudi","jawra","bot chudi","bastard",
  "bessa","hijra","a*hole","dick","fu***k","cock","prick","pussy","Mariak cudi","cunt","fag","mgi","retard",
  "magi","magir","magirchele","land","randir","randirchele","chuda","chud","chudir","chut","chudi","chutmarani",
  "tor mayer","tor baper","toke chudi","chod","jairi","khankir pola","khanki magi"
];

module.exports.config = {
  name: "antigali",
  version: "3.4.0",
  hasPermssion: 0,
  credits: "Rx Abdullah",
  description: "Per-user anti-gali with UID match for kick + admin skip options (reply-select)",
  commandCategory: "moderation",
  usages: "!antigali on / !antigali off / !antigali (select skip mode)",
  cooldowns: 0
};

module.exports.handleEvent = async function ({ api, event, Threads }) {
  try {
    if (!antiGaliStatus || !event.body) return;

    const message = event.body.toLowerCase();
    const threadID = event.threadID;
    const userID = event.senderID;
    const botID = api.getCurrentUserID && api.getCurrentUserID();

    if (!offenseTracker[threadID]) offenseTracker[threadID] = {};
    if (!offenseTracker[threadID][userID]) offenseTracker[threadID][userID] = { count: 0, uidSaved: userID };

    if (!badWords.some(word => message.includes(word))) return;

    // fetch thread info (for admin checks)
    let threadInfo = {};
    try {
      if (Threads && typeof Threads.getData === "function") {
        const tdata = await Threads.getData(threadID);
        threadInfo = tdata.threadInfo || {};
      } else if (typeof api.getThreadInfo === "function") {
        threadInfo = await api.getThreadInfo(threadID) || {};
      }
    } catch (e) {
      console.error("get thread info error:", e);
    }

    const isAdminInThread = (uid) => {
      try {
        if (!threadInfo || !threadInfo.adminIDs) return false;
        return threadInfo.adminIDs.some(item => {
          if (typeof item === "string") return item == String(uid);
          if (item && item.id) return String(item.id) == String(uid);
          return false;
        });
      } catch (e) {
        return false;
      }
    };

    const isBotAdmin = (uid) => {
      try {
        const adminList = (global.config && global.config.adminBot) || [];
        return adminList.some(id => String(id) == String(uid));
      } catch (e) {
        return false;
      }
    };

    // ---- SKIP LOGIC (based on selected mode) ----
    if (skipMode === 1 && isBotAdmin(userID)) return; // admin only skip
    if (skipMode === 2 && (isBotAdmin(userID) || isAdminInThread(userID))) return; // admin + group admin skip

    let userData = offenseTracker[threadID][userID];
    userData.count += 1;
    const count = userData.count;

    let userInfo = {};
    try {
      userInfo = await api.getUserInfo(userID);
    } catch (e) {
      console.error("getUserInfo error:", e);
    }
    const userName = userInfo[userID]?.name || "User";

    // ---- Frame removed, simple detection text ----
    const detectMsg = `⚠️ Prohibited word detected — ${userName} (UID: ${userID}) | Offense ${count}/3`;
    await api.sendMessage(detectMsg, threadID, event.messageID);

    setTimeout(() => {
      api.unsendMessage(event.messageID).catch(err => {
        console.error("Failed to unsend:", err);
      });
    }, 60000);

    if (count === 3) {
      const botIsAdmin = botID ? isAdminInThread(botID) : false;
      if (!botIsAdmin) {
        userData.count = 2;
        return api.sendMessage(
          `⚠️ Cannot remove ${userName} (UID: ${userID}) — bot is not a group admin.`,
          threadID
        );
      }

      if (isAdminInThread(userID)) {
        userData.count = 2;
        return api.sendMessage(
          `⚠️ Cannot remove ${userName} (UID: ${userID}) — user is a group admin.`,
          threadID
        );
      }

      try {
        await api.removeUserFromGroup(userID, threadID);
        userData.count = 0;
        return api.sendMessage(
          `🚨 ${userName} (UID: ${userID}) removed due to repeated offenses.`,
          threadID
        );
      } catch (kickErr) {
        console.error("Kick error:", kickErr);
        userData.count = 2;
        return api.sendMessage(
          `⚠️ Failed to kick ${userName} (UID: ${userID}). Check bot permissions.`,
          threadID
        );
      }
    }

  } catch (error) {
    console.error("HandleEvent error:", error);
    try {
      await api.sendMessage("⚠️ Anti-Gali system error occurred. Check bot logs.", event.threadID);
    } catch (e) { /* ignore */ }
  }
};

module.exports.run = async function ({ api, event, args }) {
  try {
    if (args[0] === "on") {
      antiGaliStatus = true;
      return api.sendMessage("🎀 Anti-gali is now ON", event.threadID);
    } else if (args[0] === "off") {
      antiGaliStatus = false;
      return api.sendMessage("🎀 Anti-Gali system is now OFF", event.threadID);
    } else if (!args[0]) {
      // show skip-mode selection
      const info = await api.sendMessage(
        "🛡️ Anti-Gali Skip Mode\n\nReply with:\n1️⃣ - Skip detection for Admin only\n2️⃣ - Skip detection for Admin + Group Admin\n\n(Reply to this message with 1 or 2)",
        event.threadID
      );
      global.client.handleReply.push({
        name: this.config.name,
        messageID: info.messageID,
        author: event.senderID
      });
      return;
    } else {
      return api.sendMessage("Usage: !antigali on / !antigali off / !antigali", event.threadID);
    }
  } catch (runErr) {
    console.error("Run command error:", runErr);
    try {
      await api.sendMessage("⚠️ Failed to run Anti-Gali command. Check bot logs.", event.threadID);
    } catch (e) { /* ignore */ }
  }
};

module.exports.handleReply = async function ({ api, event, handleReply }) {
  try {
    if (event.senderID !== handleReply.author) return; // only original requester can select
    const choice = event.body.trim();

    if (choice === "1") {
      skipMode = 1;
      return api.sendMessage("✅ Skip mode set: Admin only will be skipped from anti-gali detection.", event.threadID);
    } else if (choice === "2") {
      skipMode = 2;
      return api.sendMessage("✅ Skip mode set: Admin + Group Admin will be skipped from anti-gali detection.", event.threadID);
    } else {
      return api.sendMessage("❌ Invalid choice. Reply with 1 or 2.", event.threadID);
    }
  } catch (e) {
    console.error("handleReply error:", e);
  }
};
