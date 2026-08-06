let antiGaliStatus = false; // Default Off
let offenseTracker = {}; // threadID -> userID -> { count, uidSaved }

const badWords = [
  "কুত্তার বাচ্চা","মাগী","মাগীচোদ","চোদা","চুদ","চুদা","চুদামারান",
  "চুদির","চুত","চুদি","চুতমারানি","চুদের বাচ্চা","shawya","বালের","বালের ছেলে","বালছাল",
  "বালছাল কথা","মাগীর ছেলে","রান্ডি","রান্দি","রান্দির ছেলে","বেশ্যা","বেশ্যাপনা",
  "Khanki","mgi","তোকে চুদি","তুই চুদ","fuck","f***","fck","mc","bc","xhudas","abal","fucking",
  "motherfucker","guyar","mfer","motherfuer","mthrfckr","putki","abdullak chudi","abdullak xudi","jawra","bot chudi","bastard",
  "bessa","hijra","a*hole","dick","fu***k","cock","prick","pussy","Mariak cudi","cunt","fag","faggot","retard",
  "magi","magir","magirchele","land","randir","randirchele","chuda","chud","chudir","chut","chudi","chutmarani",
  "tor mayer","tor baper","toke chudi","chod","jairi","khankir pola","khanki magi"
];

module.exports.config = {
  name: "antigali",
  version: "3.6.0",
  hasPermssion: 0,
  credits: "Rx Abdullah",
  description: "Anti-gali — requires bot to be group admin to enable; bot-admin & group-admin fully silent",
  commandCategory: "moderation",
  usages: "!antigali on / !antigali off",
  cooldowns: 0
};

// bot admin = config.adminBot list
const isBotAdmin = (uid) => {
  try {
    const adminList = (global.config && global.config.adminBot) || [];
    return adminList.some(id => String(id) == String(uid));
  } catch (e) {
    return false;
  }
};

// group admin = thread's adminIDs list
const isGroupAdmin = (threadInfo, uid) => {
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

const getThreadInfo = async (api, Threads, threadID) => {
  try {
    if (Threads && typeof Threads.getData === "function") {
      const tdata = await Threads.getData(threadID);
      return tdata.threadInfo || {};
    } else if (typeof api.getThreadInfo === "function") {
      return await api.getThreadInfo(threadID) || {};
    }
  } catch (e) {
    console.error("get thread info error:", e);
  }
  return {};
};

module.exports.handleEvent = async function ({ api, event, Threads }) {
  try {
    if (!antiGaliStatus || !event.body) return;

    const threadID = event.threadID;
    const userID = event.senderID;

    // ---- FIRST CHECK: bot admin? stay 100% silent ----
    if (isBotAdmin(userID)) return;

    // ---- SECOND CHECK: group admin? stay 100% silent ----
    const threadInfo = await getThreadInfo(api, Threads, threadID);
    if (isGroupAdmin(threadInfo, userID)) return;

    const message = event.body.toLowerCase();
    const botID = api.getCurrentUserID && api.getCurrentUserID();

    if (!offenseTracker[threadID]) offenseTracker[threadID] = {};
    if (!offenseTracker[threadID][userID]) offenseTracker[threadID][userID] = { count: 0, uidSaved: userID };

    if (!badWords.some(word => message.includes(word))) return;

    // ---- USER: normal alert flow ----
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

    const detectMsg = `⚠️ Prohibited word detected — ${userName} (UID: ${userID}) | Offense ${count}/3`;
    await api.sendMessage(detectMsg, threadID, event.messageID);

    setTimeout(() => {
      api.unsendMessage(event.messageID).catch(err => {
        console.error("Failed to unsend:", err);
      });
    }, 60000);

    if (count === 3) {
      const botIsGroupAdmin = botID ? isGroupAdmin(threadInfo, botID) : false;
      if (!botIsGroupAdmin) {
        userData.count = 2;
        return api.sendMessage(
          `⚠️ Cannot remove ${userName} (UID: ${userID}) — bot is not a group admin.`,
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

module.exports.run = async function ({ api, event, args, Threads }) {
  try {
    if (args[0] === "on") {
      // ---- check bot is group admin before enabling ----
      const threadInfo = await getThreadInfo(api, Threads, event.threadID);
      const botID = api.getCurrentUserID && api.getCurrentUserID();
      const botIsGroupAdmin = botID ? isGroupAdmin(threadInfo, botID) : false;

      if (!botIsGroupAdmin) {
        return api.sendMessage(
          "❌ Bot ke age group admin banao, tarpor anti-gali ON kora jabe.",
          event.threadID
        );
      }

      antiGaliStatus = true;
      return api.sendMessage("🎀 Anti-gali is now ON", event.threadID);
    } else if (args[0] === "off") {
      antiGaliStatus = false;
      return api.sendMessage("🎀 Anti-Gali system is now OFF", event.threadID);
    } else {
      return api.sendMessage("Usage: !antigali on / !antigali off", event.threadID);
    }
  } catch (runErr) {
    console.error("Run command error:", runErr);
    try {
      await api.sendMessage("⚠️ Failed to run Anti-Gali command. Check bot logs.", event.threadID);
    } catch (e) { /* ignore */ }
  }
};
