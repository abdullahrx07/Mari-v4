const fs = require("fs");
const path = require("path");

module.exports.config = {
  name: "apis",
  premium: false,
  version: "1.0.0",
  hasPermssion: 2, // ⚠️ OWNER ONLY — this edits raw command files
  credits: "rX",
  usePrefix: true,
  description: "Scan a command file for API links (https://) and UID numbers (14-digit), then reply to edit + hot reload",
  commandCategory: "owner",
  usages: "<command name>",
  cooldowns: 5,
};

// ---------- helper: scan raw source for https:// links and 14-digit numbers ----------
function scanApiAndUid(rawCode) {
  const results = [];

  // any https:// link -> API
  const apiRegex = /(["'`]?)(https:\/\/[^\s"'`]+)\1/g;
  let m;
  while ((m = apiRegex.exec(rawCode)) !== null) {
    const value = m[2];
    const full = m[0];
    if (!results.some(r => r.value === value && r.label === "API")) {
      results.push({ label: "API", value, full });
    }
  }

  // any standalone 14-digit number -> UID
  const uidRegex = /(["'`]?)(\d{14})\1/g;
  while ((m = uidRegex.exec(rawCode)) !== null) {
    const value = m[2];
    const full = m[0];
    if (!results.some(r => r.value === value && r.label === "UID")) {
      results.push({ label: "UID", value, full });
    }
  }

  return results;
}

module.exports.run = async function ({ api, event, args }) {
  try {
    const commandDir = __dirname;

    if (!args[0]) {
      return api.sendMessage(
        `❌ Command name dao.\nExample: ${global.config.PREFIX}apis eval`,
        event.threadID,
        event.messageID
      );
    }

    const find = args[0].toLowerCase();
    const files = fs.readdirSync(commandDir).filter(f => f.endsWith(".js"));

    let targetFile = null;
    let cmdName = null;
    let cmdVersion = null;
    let cmdAuthor = null;
    let cmdPerm = null;

    for (let file of files) {
      try {
        const filePath = path.join(commandDir, file);
        const raw = require(filePath);
        const cfg = raw?.config || {};
        if (!cfg.name) continue;

        const aliases = (cfg.aliases || []).map(a => a.toLowerCase());
        if (cfg.name.toLowerCase() === find || aliases.includes(find)) {
          targetFile = filePath;
          cmdName = cfg.name;
          cmdVersion = cfg.version || "N/A";
          cmdAuthor = cfg.credits || cfg.author || "Unknown";
          cmdPerm = cfg.hasPermssion ?? cfg.hasPermission ?? 0;
          break;
        }
      } catch {}
    }

    if (!targetFile) {
      return api.sendMessage(`❌ Command "${find}" not found.`, event.threadID, event.messageID);
    }

    const rawCode = fs.readFileSync(targetFile, "utf8");
    const matches = scanApiAndUid(rawCode);

    let msg = `╭──❏ 𝐀𝐏𝐈 / 𝐔𝐈𝐃 𝐒𝐂𝐀𝐍 ❏──╮\n`;
    msg += `│ ✧ Name: ${cmdName}\n`;
    msg += `│ ✧ Version: ${cmdVersion}\n`;
    msg += `│ ✧ Author: ${cmdAuthor}\n`;
    msg += `│ ✧ HasPermssion: ${cmdPerm}\n`;
    msg += `╰─────────────────────⭓\n`;

    if (matches.length === 0) {
      msg += `ℹ️ Kono API link (https://) ba 14-digit UID number pawa jay nai.`;
      return api.sendMessage(msg, event.threadID, event.messageID);
    }

    msg += `✧ API/UID Found: ${matches.length}\n`;
    matches.forEach((f, i) => {
      msg += `${i + 1}. [${f.label}] ${f.value}\n`;
    });
    msg += `\n`;
    if (matches.length === 1) {
      msg += `↩️ Replace.`;
    } else {
      msg += `↩️ Reply  "<index> <notun value>" to replace.\nExample: 2 61572070399999`;
    }

    return api.sendMessage(msg, event.threadID, (err, info) => {
      if (err) return;
      global.client.handleReply = global.client.handleReply || [];
      global.client.handleReply.push({
        name: this.config.name,
        messageID: info.messageID,
        author: event.senderID,
        filePath: targetFile,
        cmdName,
        matches,
      });
      setTimeout(() => { try { api.unsendMessage(info.messageID); } catch {} }, 60000);
    }, event.messageID);

  } catch (err) {
    api.sendMessage("❌ Error: " + err.message, event.threadID, event.messageID);
  }
};

// ---------- Reply handler: replace API / UID + hot reload ----------
module.exports.handleReply = async function ({ api, event, handleReply }) {
  try {
    if (event.senderID !== handleReply.author) {
      return api.sendMessage("❌ Etuku khali jei owner scan korse she e korte parbe.", event.threadID, event.messageID);
    }

    const { filePath, matches, cmdName } = handleReply;
    let raw;
    try {
      raw = fs.readFileSync(filePath, "utf8");
    } catch {
      return api.sendMessage("❌ File ta r khuje pawa jay nai.", event.threadID, event.messageID);
    }

    const body = (event.body || "").trim();
    if (!body) return api.sendMessage("❌ Kisu dile na, abar try koro.", event.threadID, event.messageID);

    let targetMatch, newValue;

    if (matches.length === 1) {
      targetMatch = matches[0];
      newValue = body;
    } else {
      const parts = body.split(" ");
      const idx = parseInt(parts[0]) - 1;
      if (isNaN(idx) || !matches[idx]) {
        return api.sendMessage(
          `❌ Format: "<index> <notun value>"\nEkhane ${matches.length} ta field ase, sothik index dio (1-${matches.length}).`,
          event.threadID,
          event.messageID
        );
      }
      targetMatch = matches[idx];
      newValue = parts.slice(1).join(" ").trim();
    }

    if (!newValue)
      return api.sendMessage("❌ Notun value dao, format thik nai.", event.threadID, event.messageID);

    if (targetMatch.label === "UID" && !/^\d{14}$/.test(newValue)) {
      return api.sendMessage("❌ Notun UID 14 digit number hote hobe.", event.threadID, event.messageID);
    }
    if (targetMatch.label === "API" && !/^https:\/\//.test(newValue)) {
      return api.sendMessage("❌ Notun value https:// diye shuru hote hobe.", event.threadID, event.messageID);
    }

    if (!raw.includes(targetMatch.full)) {
      return api.sendMessage("❌ Original value ta file e r pawa jay nai, hoyto age e change hoye gese.", event.threadID, event.messageID);
    }

    const updatedFull = targetMatch.full.replace(targetMatch.value, newValue);
    raw = raw.replace(targetMatch.full, updatedFull);
    fs.writeFileSync(filePath, raw, "utf8");

    // hot reload (no restart needed)
    let reloadOk = true;
    try {
      delete require.cache[require.resolve(filePath)];
      const reloaded = require(filePath);
      if (global.client && global.client.commands && reloaded?.config?.name) {
        global.client.commands.set(reloaded.config.name, reloaded);
      }
    } catch (reloadErr) {
      reloadOk = false;
    }

    const confirmMsg =
      `✅「${cmdName}」er ${targetMatch.label} update hoye gese!\n` +
      `✧ Age: ${targetMatch.value}\n` +
      `✧ Ekhon: ${newValue}\n` +
      (reloadOk ? `🔄 File reload hoye gese, restart lagbe na.` : `⚠️ File update hoyeche kintu reload e error hoyeche, ekbar restart dio.`);

    return api.sendMessage(confirmMsg, event.threadID, (err, info) => {
      if (!err) setTimeout(() => { try { api.unsendMessage(info.messageID); } catch {} }, 15000);
    }, event.messageID);

  } catch (err) {
    api.sendMessage("❌ Error: " + err.message, event.threadID, event.messageID);
  }
};
