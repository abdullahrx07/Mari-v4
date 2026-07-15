const moment = require("moment-timezone");

module.exports.config = {
  name: "listban",
  version: "2.0.0",
  credits: "rx",
  hasPermssion: 2,
  description: "List and manage banned users/threads",
  commandCategory: "System",
  usages: "listban [thread/user]",
  cooldowns: 5
};

module.exports.handleReply = async function({ api, event, handleReply, Threads, Users }) {
  if (parseInt(event.senderID) !== parseInt(handleReply.author)) return;
  const index = parseInt(event.body.trim());
  const idTarget = handleReply.listBanned[index - 1];

  if (!idTarget) return api.sendMessage("⚠ Invalid number!", event.threadID, event.messageID);

  switch (handleReply.type) {
    case "unbanthread": {
      const data = (await Threads.getData(idTarget)).data || {};
      data.banned = 0;
      data.reason = null;
      data.dateAdded = null;
      await Threads.setData(idTarget, { data });
      global.data.threadBanned.delete(parseInt(idTarget));
      return api.sendMessage(`✅ Unbanned group:\n🆔 ${idTarget}`, event.threadID, event.messageID);
    }
    case "unbanuser": {
      const data = (await Users.getData(idTarget)).data || {};
      data.banned = 0;
      data.reason = null;
      data.dateAdded = null;
      await Users.setData(idTarget, { data });
      global.data.userBanned.delete(parseInt(idTarget));
      return api.sendMessage(`✅ Unbanned user:\n🆔 ${idTarget}`, event.threadID, event.messageID);
    }
  }
};

module.exports.run = async function({ api, event, args, Threads, Users }) {
  const { threadID, messageID } = event;
  let listBanned = [];
  let i = 1;

  switch (args[0]) {
    case "thread":
    case "t":
    case "-t": {
      const threadBanned = global.data.threadBanned.keys();
      for (const singleThread of threadBanned) {
        const threadData = await Threads.getData(singleThread);
        const info = threadData.threadInfo || {};
        const data = threadData.data || {};
        listBanned.push(
          `${i++}. ${info.threadName || "No Name"}\n` +
          `   TID - ${singleThread}\n` +
          `   Reason - ${data.reason || "Spamming"}\n` +
          `   Date - ${data.dateAdded || "Unknown"}`
        );
      }
      return api.sendMessage(
        listBanned.length != 0 ?
          `╭───× 𝐛𝐚𝐧 𝐥𝐢𝐬𝐭 ×───╮\n│ ᰔ𝐌𝐚𝐫𝐢𝐚 × 𝐫𝐗 𝐂𝐡𝐚𝐭𝐛𝐨𝐭\n│ ───× \n${listBanned.join("\n│ ───× \n")}\n╰─────────────⧕\n\n✨ Reply with number to unban group.` :
          "⚠ No banned groups!",
        threadID,
        (err, info) => {
          if (listBanned.length != 0) {
            global.client.handleReply.push({
              name: module.exports.config.name,
              messageID: info.messageID,
              author: event.senderID,
              type: "unbanthread",
              listBanned
            });
          }
        },
        messageID
      );
    }

    case "user":
    case "u":
    case "-u": {
      const userBanned = global.data.userBanned.keys();
      for (const singleUser of userBanned) {
        const userData = await Users.getData(singleUser);
        const data = userData.data || {};
        const name = global.data.userName.get(singleUser) || await Users.getNameUser(singleUser);
        listBanned.push(
          `${i++}. ${name}\n` +
          `   UID - ${singleUser}\n` +
          `   Reason - ${data.reason || "Spamming"}\n` +
          `   Date - ${data.dateAdded || "Unknown"}`
        );
      }
      return api.sendMessage(
        listBanned.length != 0 ?
          `╭───× 𝐛𝐚𝐧 𝐥𝐢𝐬𝐭 ×───╮\n│ ᰔ𝐌𝐚𝐫𝐢𝐚 × 𝐫𝐗 𝐂𝐡𝐚𝐭𝐛𝐨𝐭\n│ ───× \n${listBanned.join("\n│ ───× \n")}\n╰─────────────⧕\n\n✨ Reply with number to unban user.` :
          "⚠ No banned users!",
        threadID,
        (err, info) => {
          if (listBanned.length != 0) {
            global.client.handleReply.push({
              name: module.exports.config.name,
              messageID: info.messageID,
              author: event.senderID,
              type: "unbanuser",
              listBanned
            });
          }
        },
        messageID
      );
    }

    case "ban": {
      // Example: ban thread <id> bad word
      const targetType = args[1]; // thread or user
      const targetID = args[2];
      const reason = args.slice(3).join(" ") || "Spamming";
      const date = moment().tz("Asia/Dhaka").format("DD/MM/YYYY");

      if (targetType === "thread") {
        const data = (await Threads.getData(targetID)).data || {};
        data.banned = 1;
        data.reason = reason;
        data.dateAdded = date;
        await Threads.setData(targetID, { data });
        global.data.threadBanned.set(parseInt(targetID), 1);
        return api.sendMessage(
          `✅ Banned group:\n🆔 ${targetID}\n📌 Reason: ${reason}\n📅 Date: ${date}`,
          threadID,
          messageID
        );
      } else if (targetType === "user") {
        const data = (await Users.getData(targetID)).data || {};
        data.banned = 1;
        data.reason = reason;
        data.dateAdded = date;
        await Users.setData(targetID, { data });
        global.data.userBanned.set(parseInt(targetID), 1);
        return api.sendMessage(
          `✅ Banned user:\n🆔 ${targetID}\n📌 Reason: ${reason}\n📅 Date: ${date}`,
          threadID,
          messageID
        );
      } else {
        return api.sendMessage("⚠ Usage: ban [thread/user] [ID] [reason]", threadID, messageID);
      }
    }

    default: {
      return api.sendMessage(
        "⚠ Usage:\nlistban thread\nlistban user\nban [thread/user] [ID] [reason]",
        threadID,
        messageID
      );
    }
  }
};
