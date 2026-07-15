const fs = require("fs");
const path = require("path");

module.exports.config = {
  name: "cs",
  version: "1.0.3",
  hasPermssion: 0,
  credits: "rX",
  usePrefix: true,
  description: "Show command store",
  commandCategory: "system",
  usages: "[page number]",
  cooldowns: 5,
};

module.exports.run = async function ({ api, event, args }) {
  try {
    const commandDir = __dirname;
    const files = fs.readdirSync(commandDir).filter(file => file.endsWith(".js"));

    let commands = [];
    for (let i = 0; i < files.length; i++) {
      try {
        let cmd = require(path.join(commandDir, files[i]));
        if (!cmd.config) continue;

        commands.push({
          name: cmd.config.name || files[i].replace(".js", ""),
          author: cmd.config.credits || "Unknown",
          version: cmd.config.version || "N/A",
        });
      } catch (e) {}
    }

    let page = parseInt(args[0]) || 1;
    let limit = 10;
    let totalPages = Math.ceil(commands.length / limit);

    if (totalPages === 0) {
      return api.sendMessage("❌ No commands found.", event.threadID, event.messageID);
    }

    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;

    let start = (page - 1) * limit;
    let end = start + limit;
    let list = commands.slice(start, end);

    let msg = `╭─‣ 𝐂𝐦𝐝 𝐒𝐭𝐨𝐫𝐞 🎀\n`;
    msg += `├‣ 𝐀𝐝𝐦𝐢𝐧: ${global.config.BOTNAME || "Unknown"}\n`;
    msg += `├‣ 𝐓𝐨𝐭𝐚𝐥 𝐂𝐨𝐦𝐦𝐚𝐧𝐝𝐬: ${commands.length}\n`;
    msg += `╰────────────◊\n`;

    list.forEach((cmd, i) => {
      msg += `╭─‣ ${start + i + 1}: ${cmd.name}\n`;
      msg += `├‣ Author: ${cmd.author}\n`;
      msg += `├‣ Version: ${cmd.version}\n`;
      msg += `╰────────────◊\n`;
    });

    msg += `\n📄 | 𝐏𝐚𝐠𝐞 [${page}-${totalPages}]\n`;
    if (page < totalPages) {
      msg += `ℹ | 𝐓𝐲𝐩𝐞 ${global.config.PREFIX}cs ${page + 1} - 𝐭𝐨 𝐬𝐞𝐞 𝐧𝐞𝐱𝐭 𝐩𝐚𝐠𝐞.`;
    }

    api.sendMessage(msg, event.threadID, (err, info) => {
      if (!err) {
        // rX
        setTimeout(() => {
          api.unsendMessage(info.messageID);
        }, 15000);
      }
    }, event.messageID);

  } catch (err) {
    api.sendMessage("❌ Error: " + err.message, event.threadID, event.messageID);
  }
};
