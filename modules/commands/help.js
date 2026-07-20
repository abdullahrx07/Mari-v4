const fs = require("fs");
const path = require("path");

module.exports.config = {
  name: "help",
  premium: false,
  version: "4.4.0",
  hasPermssion: 0,
  credits: "rX",
  usePrefix: true,
  description: "Paged help menu 2 pages + random GIF attached both pages, auto unsend 15s",
  commandCategory: "system",
  usages: "[command name | page number]",
  cooldowns: 5,
};

module.exports.run = async function ({ api, event, args }) {
  try {
    // Use already-loaded commands from global.client.commands instead of
    // re-requiring every file from disk. This is faster, avoids re-running
    // onLoad hooks, and prevents crashes from partially-cached bad modules.
    const commandMap = (global.client && global.client.commands) ? global.client.commands : new Map();

    let commands = [];
    for (const [, raw] of commandMap) {
      try {
        if (!raw) continue;
        const cfg = raw.config || {};
        if (!cfg.name) continue;

        // detect type: goat = has onStart, mirai = has run
        const type = typeof raw.onStart === "function"
          ? "GoatBot"
          : typeof raw.run === "function"
            ? "Mirai"
            : "Unknown";

        commands.push({
          name: cfg.name,
          aliases: cfg.aliases || [],
          category: cfg.commandCategory || cfg.category || "Other",
          description: (
            typeof cfg.description === "string"
              ? cfg.description
              : cfg.description?.en || cfg.description?.bn || "No description available."
          ),
          author: cfg.credits || cfg.author || "Unknown",
          version: cfg.version || "N/A",
          usages: (
            typeof cfg.usages === "string"
              ? cfg.usages
              : typeof cfg.guide === "string"
                ? cfg.guide
                : cfg.guide?.en || "No usage info"
          ),
          cooldowns: cfg.cooldowns || cfg.countDown || "N/A",
          type,
        });
      } catch {}
    }

    // ---------- Command detail ----------
    if (args[0] && isNaN(args[0])) {
      const find = args[0].toLowerCase();
      const cmd = commands.find(c =>
        c.name.toLowerCase() === find ||
        (c.aliases && c.aliases.map(a => a.toLowerCase()).includes(find))
      );
      if (!cmd)
        return api.sendMessage(`❌ Command "${find}" not found.`, event.threadID, event.messageID);

      let msg = `╭──❏ 𝐂𝐌𝐃 𝐈𝐍𝐅𝐎 ❏──╮\n`;
      msg += `│ ✧ Name: ${cmd.name}\n`;
      if (cmd.aliases.length > 0) msg += `│ ✧ Aliases: ${cmd.aliases.join(", ")}\n`;
      msg += `│ ✧ Type: ${cmd.type}\n`;
      msg += `│ ✧ Category: ${cmd.category}\n`;
      msg += `│ ✧ Version: ${cmd.version}\n`;
      msg += `│ ✧ Author: ${cmd.author}\n`;
      msg += `│ ✧ Cooldowns: ${cmd.cooldowns}s\n`;
      msg += `╰─────────────────────⭓\n`;
      msg += `📘 Description: ${cmd.description}\n`;
      msg += `📗 Usage: ${global.config.PREFIX}${cmd.name} ${cmd.usages}`;

      return api.sendMessage(msg, event.threadID, (err, info) => {
        if (!err) setTimeout(() => api.unsendMessage(info.messageID), 15000);
      }, event.messageID);
    }

    // ---------- Pagination ----------
    const page = parseInt(args[0]) || 1;
    const commandsPerPage = Math.ceil(commands.length / 2);
    const start = (page - 1) * commandsPerPage;
    const end = start + commandsPerPage;
    const pageCommands = commands.slice(start, end);

    const categories = {};
    for (let cmd of pageCommands) {
      if (!categories[cmd.category]) categories[cmd.category] = [];
      categories[cmd.category].push({ name: cmd.name, type: cmd.type });
    }

    let msg = `╭──❏ 𝐀𝐮𝐭𝐨 𝐃𝐞𝐭𝐞𝐜𝐭 𝐇𝐞𝐥𝐩 - Page ${page} ❏──╮\n`;
    msg += `│ ✧ Total Commands: ${commands.length}\n`;
    msg += `│ ✧ Prefix: ${global.config.PREFIX}\n`;
    msg += `╰─────────────────────⭓\n\n`;

    for (let [cat, cmds] of Object.entries(categories)) {
      msg += `╭─‣ 𝗖𝗮𝘁𝗲𝗴𝗼𝗿𝘆 : ${cat}\n`;
      for (let i = 0; i < cmds.length; i += 2) {
        const a = cmds[i];
        const b = cmds[i + 1];
        const tagA = a.type === "GoatBot" ? "🐐" : "✨";
        const tagB = b ? (b.type === "GoatBot" ? "🐐" : "✨") : null;
        const row = [`${tagA}「${a.name}」`];
        if (b) row.push(`✘ ${tagB}「${b.name}」`);
        msg += `├‣ ${row.join(" ")}\n`;
      }
      msg += `╰────────────◊\n\n`;
    }

    msg += `🐐 GoatBot  ✨ Mirai\n`;
    msg += `⭔ Type ${global.config.PREFIX}help [command] to see details\n`;
    msg += `╭─[⋆˚🦋𝐌𝐚𝐫𝐢𝐚 × 𝐫𝐗🎀⋆˚]\n`;
    msg += `╰‣ 𝐀𝐝𝐦𝐢𝐧 : 𝐫𝐗 𝐀𝐛𝐝𝐮𝐥𝐥𝐚𝐡\n`;
    msg += `╰‣ 𝐑𝐢𝐩𝐨𝐫𝐭 : !callad (yourmsg)\n`;
    msg += `╰‣ 𝐓𝐲𝐩𝐞 !help2 𝐭𝐨 𝐬𝐞𝐞 𝐧𝐞𝐱𝐭 𝐩𝐚𝐠𝐞\n`;

    let attachment = null;
    const cache = path.join(__dirname, "noprefix");
    if (fs.existsSync(cache)) {
      const names = ["mari1"];
      const exts = [".gif", ".mp4", ".webp", ".png", ".jpg"];
      let found = [];
      fs.readdirSync(cache).forEach(file => {
        const lower = file.toLowerCase();
        if (names.some(n => lower.startsWith(n)) && exts.includes(path.extname(lower)))
          found.push(path.join(cache, file));
      });
      if (found.length > 0)
        attachment = fs.createReadStream(found[Math.floor(Math.random() * found.length)]);
    }

    api.sendMessage({ body: msg, attachment }, event.threadID, (err, info) => {
      if (!err) setTimeout(() => { try { api.unsendMessage(info.messageID); } catch {} }, 15000);
    }, event.messageID);

  } catch (err) {
    api.sendMessage("❌ Error: " + err.message, event.threadID, event.messageID);
  }
};
