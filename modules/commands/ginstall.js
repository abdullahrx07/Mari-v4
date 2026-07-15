const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const cheerio = require("cheerio");

const CMDS_DIR = path.join(process.cwd(), "modules", "commands");

// ─── utils ───────────────────────────────────────────────────────────────────

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

function isURL(str) {
  try { new URL(str); return true; } catch { return false; }
}

function extractUrlFromText(text) {
  const m = text.match(/https?:\/\/[^\s]+/i);
  return m ? m[0] : null;
}

async function fetchCode(url) {
  const domain = getDomain(url);
  let raw = url;

  if (domain === "pastebin.com" && !url.includes("/raw/"))
    raw = url.replace("pastebin.com/", "pastebin.com/raw/");

  if (domain === "github.com" && url.includes("/blob/"))
    raw = url.replace("github.com", "raw.githubusercontent.com").replace("/blob/", "/");

  try {
    const res = await axios.get(raw, { timeout: 15000 });
    let code = res.data;
    if (domain === "savetext.net") {
      const $ = cheerio.load(code);
      code = $("#content").text().trim();
    }
    return typeof code === "string" ? code : null;
  } catch { return null; }
}

function extractName(code) {
  const m = code.match(/name\s*:\s*["']([^"']+)["']/);
  return m ? m[1].trim() + ".js" : null;
}

function autoload(filePath) {
  try {
    delete require.cache[require.resolve(filePath)];
    let mod = require(filePath);

    try {
      const { normalize } = require("../../utils/goatCompat");
      mod = normalize(mod, path.basename(filePath));
    } catch (_) {}

    if (!mod?.config?.name) return { ok: false, reason: "Missing config.name" };

    const name = mod.config.name.toLowerCase();
    global.client.commands.set(name, mod);

    if (Array.isArray(mod.config.aliases))
      mod.config.aliases.forEach(a => global.client.commands.set(a.toLowerCase(), mod));

    if (mod.handleEvent && !global.client.eventRegistered.includes(name))
      global.client.eventRegistered.push(name);

    if (typeof mod.onLoad === "function")
      try { mod.onLoad({ api: global.client.api }); } catch (_) {}

    return { ok: true, name };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

// ─── command ─────────────────────────────────────────────────────────────────

module.exports = {
  config: {
    name: "ginstall",
    aliases: ["inst"],
    version: "1.0.0",
    author: "rX",
    countDown: 5,
    role: 2,
    hasPrefix: true,
    description: "Install a Goat/Mirai command from URL or reply",
    category: "system",
    commandCategory: "system",
    hasPermssion: 3,
    credits: "rX",
    cooldowns: 5,
  },

  onStart: async function ({ args, message, event, api }) {
    const { senderID } = event;

    let rawCode = "";
    let fileName = "";

    // — source: reply
    if (event.messageReply?.body) {
      const replyText = event.messageReply.body.trim();
      const url = extractUrlFromText(replyText);
      if (url) {
        rawCode = await fetchCode(url);
        if (!rawCode) return message.reply("✖ URL থেকে code আনা গেলো না।");
      } else {
        rawCode = replyText;
      }
      fileName = extractName(rawCode);
    }

    // — source: direct URL arg
    else if (args[0] && isURL(args[0])) {
      rawCode = await fetchCode(args[0]);
      if (!rawCode) return message.reply("✖ URL invalid বা unreachable।");
      fileName = extractName(rawCode);
    }

    // — source: filename + inline code
    else if (args.length >= 2 && args[0].endsWith(".js")) {
      fileName = args[0];
      rawCode = args.slice(1).join(" ");
    }

    if (!rawCode)
      return message.reply(
        "⚠ কোনো code পাওয়া যায়নি।\n\n" +
        "Usage:\n" +
        "• কোড বা URL সহ message এ reply করো\n" +
        "• !install <raw_url>\n" +
        "• !install <name.js> <code>"
      );

    if (!fileName)
      return message.reply("✖ Command name detect করা গেলো না।\nCode এ valid name field আছে কিনা দেখো।");

    // syntax check
    try { new Function(rawCode); }
    catch (err) { return message.reply(`✖ Syntax error:\n${err.message}`); }

    const filePath = path.join(CMDS_DIR, fileName);

    // already exists → confirm via reaction
    if (fs.existsSync(filePath)) {
      return message.reply(
        `⚠ ${fileName} already exists।\n\nReact করো overwrite করতে।`,
        (err, info) => {
          if (!info?.messageID) return;
          global.client.handleReaction.push({
            name: module.exports.config.name,
            messageID: info.messageID,
            author: senderID,
            data: { rawCode, fileName }
          });
        }
      );
    }

    // write & load
    fs.writeFileSync(filePath, rawCode, "utf-8");
    const result = autoload(filePath);

    return message.reply(
      result.ok
        ? `✅ Installed: ${fileName}\n📌 "${result.name}" live — restart লাগবে না।`
        : `✖ Installed but autoload failed:\n${result.reason}\nRestart দিলে apply হবে।`
    );
  },

  onReaction: async function ({ Reaction, event, message }) {
    if (String(event.userID) !== String(Reaction.author)) return;

    const { rawCode, fileName } = Reaction.data;
    const filePath = path.join(CMDS_DIR, fileName);

    fs.writeFileSync(filePath, rawCode, "utf-8");
    const result = autoload(filePath);

    return message.reply(
      result.ok
        ? `✅ Overwritten & Reloaded: ${fileName}\n📌 "${result.name}" live।`
        : `✖ Overwrite failed:\n${result.reason}`
    );
  }
};
