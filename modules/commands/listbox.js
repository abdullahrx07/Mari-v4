module.exports.config = {
  name: 'listbox',
  version: '1.0.1',
  credits: '𝐫𝐗',
  hasPermssion: 2,
  description: 'List threads where bot is active',
  commandCategory: 'System',
  usages: 'listbox',
  cooldowns: 15
};

module.exports.handleReply = async function({ api, event, Threads, handleReply }) {
  if (parseInt(event.senderID) !== parseInt(handleReply.author)) return;

  const args = event.body.trim().split(" ");
  const action = args[0].toLowerCase();
  const index = parseInt(args[1]);
  const idgr = handleReply.groupid[index - 1];

  if (!idgr) return api.sendMessage("⚠ Invalid number!", event.threadID, event.messageID);

  switch (action) {
    case "ban": {
      const data = (await Threads.getData(idgr)).data || {};
      data.banned = 1;
      data.banReason = "Banned by Admin"; // চাইলে reason যোগ করুন
      await Threads.setData(idgr, { data });
      global.data.threadBanned.set(parseInt(idgr), 1);
      api.sendMessage(`[${idgr}] has been banned successfully ✅`, event.threadID, event.messageID);
      break;
    }

    case "unban": {
      const data = (await Threads.getData(idgr)).data || {};
      data.banned = 0;
      delete data.banReason;
      await Threads.setData(idgr, { data });
      global.data.threadBanned.delete(parseInt(idgr));
      api.sendMessage(`[${idgr}] has been unbanned successfully ✅`, event.threadID, event.messageID);
      break;
    }

    case "out": {
      api.removeUserFromGroup(api.getCurrentUserID(), idgr);
      const name = (await Threads.getData(idgr)).name || "Unknown";
      api.sendMessage(`✅ Left group:\n${name}\n🆔 ${idgr}`, event.threadID, event.messageID);
      break;
    }
  }
};

module.exports.run = async function({ api, event }) {
  const inbox = await api.getThreadList(100, null, ['INBOX']);
  const list = inbox.filter(group => group.isSubscribed && group.isGroup);

  let listthread = [];
  for (let group of list) {
    const info = await api.getThreadInfo(group.threadID);
    listthread.push({
      id: group.threadID,
      name: group.name || "No Name",
      members: info.userInfo.length
    });
  }

  // Sort by member count (descending)
  listthread.sort((a, b) => b.members - a.members);

  let msg = '╭───× 𝐁𝐨𝐱 𝐋𝐢𝐬𝐭 ×───╮\n\n';
  let i = 1, groupid = [];
  const tidEmojis = ["☑", "➳", "ᰔ", "✦", "✿", "⧕"];
  const memberEmojis = ["♛", "❖", "✎", "⚘", "☘", "✿"];

  for (let group of listthread) {
    let tidIcon = tidEmojis[(i - 1) % tidEmojis.length];
    let memberIcon = memberEmojis[(i - 1) % memberEmojis.length];

    msg += `${i}. ${group.name}\n${tidIcon} TID: ${group.id}\n${memberIcon} Member: ${group.members}\n───×\n\n`;
    groupid.push(group.id);
    i++;
  }

  msg += '╰─────────────⧕\n';
  msg += '\n✨ Reply "out <number>" to leave,\n"ban <number>" to ban,\n"unban <number>" to unban that group.';

  api.sendMessage(msg, event.threadID, (err, info) => {
    global.client.handleReply.push({
      name: module.exports.config.name,
      author: event.senderID,
      messageID: info.messageID,
      groupid,
      type: 'reply'
    });
  });
};
