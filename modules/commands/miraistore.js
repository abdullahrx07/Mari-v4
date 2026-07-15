const fs = require("fs");
const path = require("path");
const axios = require("axios");

const API_BASE = "https://mirai-store.vercel.app";
const userSeenNoti = new Map();

function isBotAdmin(senderID) {
  const adminList = (global.config && global.config.adminBot) || [];
  return adminList.includes(String(senderID));
}

let _updateCheckCache = null;
const UPDATE_CHECK_INTERVAL = 1000 * 60 * 30;

async function checkSelfUpdate() {
  const now = Date.now();
  if (_updateCheckCache && (now - _updateCheckCache.checkedAt) < UPDATE_CHECK_INTERVAL) {
    return _updateCheckCache.result;
  }

  try {
    const res = await axios.get(`${API_BASE}/miraistore/search?q=miraistore&limit=10`);
    const cmds = Array.isArray(res.data?.commands)
      ? res.data.commands
      : (res.data && !res.data.message ? [res.data] : []);

    const myAuthor = module.exports.config.credits;
    const match =
      cmds.find(c => c.name?.toLowerCase() === "miraistore" && c.author === myAuthor) ||
      cmds.find(c => c.name?.toLowerCase() === "miraistore");

    if (!match) { _updateCheckCache = { checkedAt: now, result: null }; return null; }

    const parseVer = v => String(v).split(".").map(n => parseInt(n) || 0);
    const cmp = (a, b) => {
      const pa = parseVer(a), pb = parseVer(b);
      const len = Math.max(pa.length, pb.length);
      for (let i = 0; i < len; i++) {
        const d = (pa[i] || 0) - (pb[i] || 0);
        if (d !== 0) return d;
      }
      return 0;
    };

    const current = module.exports.config.version;
    const latest  = match.version || "N/A";
    const hasUpdate = cmp(latest, current) > 0;
    const result = { hasUpdate, currentVersion: current, latestVersion: latest, latestId: match.id };
    _updateCheckCache = { checkedAt: now, result };
    return result;
  } catch (_) {
    return null;
  }
}

const AUTOSYNC_CACHE_PATH = path.join(__dirname, "..", "miraistore_sync_cache.json");

module.exports.config = {
  name: "miraistore",
  aliases: ["ms", "shop"],
  premium: true,
  version: "3.1.0",
  hasPermission: 1,
  credits: "rX",
  description: "Mirai Command Store (Search, Like, Upload, Install, Delete, Trending, List)",
  commandCategory: "system",
  usages:
    "!ms <id | name | category | author>\n" +
    "!ms n\n" +
    "!ms install <id>\n" +
    "!ms event install <id>\n" +
    "!ms event <filename>\n" +
    "!ms like <id>\n" +
    "!ms trending\n" +
    "!ms upload <commandName>\n" +
    "!ms upload event <eventName>\n" +
    "!ms sync\n" +
    "!ms delete <id> <secret>\n" +
    "!ms list [page]",
  cooldowns: 3,
  autoSync: true
};

module.exports.onLoad = function () {
  if (!global.miraistorePages) global.miraistorePages = new Map();

  setTimeout(() => {
    checkSelfUpdate()
      .then(info => {
        if (info?.hasUpdate) {
          console.log(
            `[MiraiStore] Update available! v${info.currentVersion} → v${info.latestVersion} (ID: ${info.latestId})`
          );
        }
      })
      .catch(() => {});
  }, 6000);

  if (module.exports.config.autoSync) {
    const ONE_DAY = 1000 * 60 * 60 * 24;
    setTimeout(() => {
      runAutoSync({ silent: true }).catch(() => {});
      setInterval(() => {
        runAutoSync({ silent: true }).catch(() => {});
      }, ONE_DAY);
    }, 5000);
  }
};

function detectFrameworkLocal(code) {
  const isGoatStyle =
    /module\.exports\s*=\s*\{/.test(code) &&
    /onStart\s*[:(]|onChat\s*[:(]|onLoad\s*[:(]/.test(code);
  const isMiraiStyle =
    /module\.exports\.config\s*=/.test(code) ||
    /module\.exports\.run\s*=/.test(code);
  if (isGoatStyle && !isMiraiStyle) return "goat";
  return "mirai";
}

async function getTodayUpdates() {
  try {
    const res = await axios.get(`${API_BASE}/miraistore/list?limit=50`);
    const allCmds = res.data.commands || [];
    const today = new Date().toDateString();
    return allCmds.filter(cmd => new Date(cmd.uploadDate).toDateString() === today);
  } catch (e) { return []; }
}

async function sendSearchPage(api, threadID, query, page, limit = 5, typeFilter = null) {
  const offset = (page - 1) * limit;
  try {
    let url = `${API_BASE}/miraistore/search?q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}`;
    if (typeFilter) url += `&type=${encodeURIComponent(typeFilter)}`;

    const res = await axios.get(url);
    const data = res.data;
    if (!data || !Array.isArray(data.commands) || data.commands.length === 0)
      return api.sendMessage("❌ No results found for this page.", threadID);

    const commands = data.commands;
    const total = data.total;
    const totalPages = Math.ceil(total / limit);

    let msg = `📂 Search Results (${total})\n\n`;
    commands.forEach(cmd => {
      msg += `╭─‣ ${cmd.name} 〄\n`;
      msg += `├‣ ID : ${cmd.id}\n`;
      msg += `├‣ Type : ${cmd.type || "N/A"}\n`;
      msg += `├‣ Author : ${cmd.author}\n`;
      msg += `├‣ Category : ${cmd.category}\n`;
      msg += `╰────────────◊\n`;
      msg += ` ✰ Upload : ${new Date(cmd.uploadDate || Date.now()).toDateString()}\n\n`;
    });

    if (totalPages > 1)
      msg += `Page ${page}/${totalPages}\nReply "page <number>" or react ➡️ to go to the next page.`;

    const infoMsg = await new Promise((resolve, reject) => {
      api.sendMessage(msg.trim(), threadID, (err, info) => {
        if (err) reject(err);
        else resolve(info);
      });
    });

    if (totalPages > 1) {
      const handleData = {
        name: module.exports.config.name,
        messageID: infoMsg.messageID,
        author: infoMsg.senderID,
        query, page, totalPages, limit, typeFilter
      };
      global.client.handleReply.push(handleData);
      global.client.handleReaction.push(handleData);
    }
  } catch (err) {
    console.error("SEARCH PAGE ERROR:", err.message);
    api.sendMessage("❌ Search API error.", threadID);
  }
}

async function animateInstall(api, threadID, cmdName) {
  const milestones = [
    { label: "Downloading source",   progress: 30,  delay: 600 },
    { label: "Verifying integrity",  progress: 60,  delay: 900 },
    { label: "Writing to disk",      progress: 85,  delay: 700 },
    { label: "Registering command",  progress: 100, delay: 600 }
  ];

  const frames = ["◖", "◕", "◔", "◓", "◒", "◑", "◐"];
  const buildBar = (pct) => {
    const filled = Math.floor(pct / 10);
    return "█".repeat(filled) + "░".repeat(10 - filled);
  };

  const initMsg = await new Promise((resolve, reject) => {
    api.sendMessage(
      `📦 Installing ${cmdName}...\n\n◖ Fetching package info...\n[░░░░░░░░░░] 0%`,
      threadID,
      (err, info) => { if (err) reject(err); else resolve(info); }
    );
  });

  const msgID = initMsg.messageID;

  for (let i = 0; i < milestones.length; i++) {
    const { label, progress, delay } = milestones[i];
    await new Promise(r => setTimeout(r, delay));
    const icon = frames[i % frames.length];
    const bar = buildBar(progress);
    api.editMessage(
      `📦 Installing ${cmdName}...\n\n${icon} ${label}...\n[${bar}] ${progress}%`,
      msgID
    );
  }

  return msgID;
}

async function animateUpload(api, threadID, cmdName) {
  const milestones = [
    { label: "Downloading source",   progress: 30,  delay: 600 },
    { label: "Verifying integrity",  progress: 60,  delay: 900 },
    { label: "Writing to disk",      progress: 85,  delay: 700 },
    { label: "Registering command",  progress: 100, delay: 600 }
  ];

  const frames = ["◖", "◕", "◔", "◓", "◒", "◑", "◐"];
  const buildBar = (pct) => {
    const filled = Math.floor(pct / 10);
    return "█".repeat(filled) + "░".repeat(10 - filled);
  };

  const initMsg = await new Promise((resolve, reject) => {
    api.sendMessage(
      `📤 Uploading ${cmdName}...\n\n◖ Fetching package info...\n[░░░░░░░░░░] 0%`,
      threadID,
      (err, info) => { if (err) reject(err); else resolve(info); }
    );
  });

  const msgID = initMsg.messageID;

  for (let i = 0; i < milestones.length; i++) {
    const { label, progress, delay } = milestones[i];
    await new Promise(r => setTimeout(r, delay));
    const icon = frames[i % frames.length];
    const bar = buildBar(progress);
    api.editMessage(
      `📤 Uploading ${cmdName}...\n\n${icon} ${label}...\n[${bar}] ${progress}%`,
      msgID
    );
  }

  return msgID;
}

function autoloadCommand(filePath, cmdName) {
  try {
    delete require.cache[require.resolve(filePath)];
    const cmd = require(filePath);
    if (cmd && cmd.config && cmd.config.name) {
      const name = cmd.config.name.toLowerCase();
      global.client.commands.set(name, cmd);
      if (Array.isArray(cmd.config.aliases)) {
        cmd.config.aliases.forEach(alias =>
          global.client.commands.set(alias.toLowerCase(), cmd)
        );
      }
      if (typeof cmd.onLoad === "function") cmd.onLoad();
      return { success: true, name };
    }
    return { success: false, reason: "Missing config.name in command file." };
  } catch (err) {
    return { success: false, reason: err.message };
  }
}

async function doInstall(api, threadID, id, forceKind = null) {
  let cmdData = null;

  try {
    const res = await axios.get(`${API_BASE}/miraistore/search?q=${encodeURIComponent(id)}`);
    const data = res.data;

    if (!isNaN(id) && data && !Array.isArray(data) && data.rawCode) {
      cmdData = data;
    } else if (Array.isArray(data?.commands)) {
      cmdData = data.commands.find(c => String(c.id) === String(id));
    } else if (Array.isArray(data)) {
      cmdData = data.find(c => String(c.id) === String(id));
    }

    if (!cmdData || !cmdData.rawCode)
      return api.sendMessage("❌ Command not found or rawCode missing.", threadID);

  } catch (err) {
    console.error("INSTALL FETCH ERROR:", err.message);
    return api.sendMessage("❌ Failed to fetch command info.", threadID);
  }

  try {
    new Function(cmdData.rawCode);
  } catch (err) {
    return api.sendMessage(`❌ Refused to install: remote code has a syntax error.\n${err.message}`, threadID);
  }

  const displayName = cmdData.name || `ms_${id}`;

  let isEvent;
  if (forceKind === "event") {
    isEvent = true;
  } else if (forceKind === "command") {
    isEvent = false;
  } else {
    isEvent = String(cmdData.type || "").endsWith("-event");
  }

  let progressMsgID;
  try {
    progressMsgID = await animateInstall(api, threadID, displayName);
  } catch (err) {
    console.error("ANIMATE ERROR:", err.message);
  }

  const fileName = displayName.replace(/\s+/g, "_") + ".js";
  const installDir = path.join(__dirname, "..", isEvent ? "events" : "commands");
  const filePath = path.join(installDir, fileName);
  const locationLabel = isEvent ? `events/${fileName}` : `commands/${fileName}`;

  try {
    if (!fs.existsSync(installDir)) fs.mkdirSync(installDir, { recursive: true });
    fs.writeFileSync(filePath, cmdData.rawCode, "utf-8");
  } catch (err) {
    if (progressMsgID) api.unsendMessage(progressMsgID);
    return api.sendMessage(`❌ Failed to write file:\n${err.message}`, threadID);
  }

  try {
    await axios.post(`${API_BASE}/miraistore/install/${cmdData.id}`);
  } catch (_) {}

  const loadResult = isEvent
    ? { success: false, reason: "Events are picked up on the next bot restart." }
    : autoloadCommand(filePath, displayName);

  const successMsg =
    `✅ Installed Successfully!\n` +
    `╭─‣ Name : ${cmdData.name || "Unknown"}\n` +
    `├‣ Type : ${cmdData.type || "N/A"}\n` +
    `├‣ Author : ${cmdData.author || "Unknown"}\n` +
    `├‣ Version : ${cmdData.version || "N/A"}\n` +
    `├‣ Category : ${cmdData.category || "N/A"}\n` +
    `├‣ ID : ${id}\n` +
    `├‣ Location : ${locationLabel}\n` +
    `╰────────────◊\n` +
    (loadResult.success
      ? `🚀 Command "${loadResult.name}" is now live! No restart needed.`
      : isEvent
      ? `⚠️ Event saved to events/ folder. Restart bot to apply.`
      : `⚠️ File saved but autoload failed:\n${loadResult.reason}\nRestart the bot to apply.`);

  if (progressMsgID) {
    api.editMessage(successMsg, progressMsgID, (err) => {
      if (err) {
        console.error("EDIT MESSAGE ERROR:", err.message || err);
        api.sendMessage(successMsg, threadID);
      } else {
        setTimeout(() => api.unsendMessage(progressMsgID), 5000);
      }
    });
  } else {
    api.sendMessage(successMsg, threadID);
  }
}

function loadSyncCache() {
  try { return JSON.parse(fs.readFileSync(AUTOSYNC_CACHE_PATH, "utf8")); }
  catch { return {}; }
}

function saveSyncCache(cache) {
  try { fs.writeFileSync(AUTOSYNC_CACHE_PATH, JSON.stringify(cache, null, 2)); }
  catch (_) {}
}

function hashContent(content) {
  let h = 0;
  for (let i = 0; i < content.length; i++) h = (h * 31 + content.charCodeAt(i)) | 0;
  return h.toString(16);
}

async function uploadCommandFile(fileName, filePath, kind = "command") {
  let data;
  try { data = fs.readFileSync(filePath, "utf8"); }
  catch (err) { return { ok: false, file: fileName, reason: `Read failed: ${err.message}` }; }

  try { new Function(data); }
  catch (err) { return { ok: false, file: fileName, reason: `Syntax error: ${err.message}` }; }

  const framework = detectFrameworkLocal(data);

  let rawUrl;
  try {
    const pasteRes = await axios.post("https://pastebin-api.vercel.app/paste", { text: data });
    if (!pasteRes.data?.id)
      return { ok: false, file: fileName, reason: "No paste ID returned." };
    rawUrl = `https://pastebin-api.vercel.app/raw/${pasteRes.data.id}`;
  } catch (err) {
    return { ok: false, file: fileName, reason: `Paste failed: ${err.message}` };
  }

  try {
    const res = await axios.post(`${API_BASE}/miraistore/upload`, { rawUrl, framework, kind });
    if (res.data?.error) return { ok: false, file: fileName, reason: res.data.error };
    return { ok: true, file: fileName, id: res.data.id, name: res.data.name, type: res.data.type, rawUrl };
  } catch (err) {
    return { ok: false, file: fileName, reason: err.message };
  }
}

async function runAutoSync({ silent = true, notifyApi = null, notifyThreadID = null } = {}) {
  const baseDir = path.join(__dirname, "..");
  const folders = [
    { dir: path.join(baseDir, "commands"), kind: "command" },
    { dir: path.join(baseDir, "events"),   kind: "event" }
  ].filter(f => fs.existsSync(f.dir));

  if (folders.length === 0) {
    return { uploaded: [], skipped: [], failed: [], error: "no commands/events folder found" };
  }

  const cache = loadSyncCache();
  const result = { uploaded: [], skipped: [], failed: [] };

  for (const { dir, kind } of folders) {
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".js"));
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const cacheKey = `${kind}:${file}`;
      let content;
      try { content = fs.readFileSync(fullPath, "utf8"); }
      catch (err) { result.failed.push({ file: cacheKey, reason: `Read failed: ${err.message}` }); continue; }

      const hash = hashContent(content);
      if (cache[cacheKey] === hash) { result.skipped.push(cacheKey); continue; }

      const up = await uploadCommandFile(cacheKey, fullPath, kind);
      if (up.ok) { cache[cacheKey] = hash; result.uploaded.push(up); }
      else { result.failed.push(up); }

      await new Promise(r => setTimeout(r, 500));
    }
  }

  saveSyncCache(cache);

  if (!silent && notifyApi && notifyThreadID) {
    const msg =
      `🔄 Autosync complete\n` +
      `✅ Uploaded : ${result.uploaded.length}\n` +
      `⏭️ Skipped (unchanged) : ${result.skipped.length}\n` +
      `❌ Failed : ${result.failed.length}` +
      (result.failed.length ? `\n\nFailed files:\n${result.failed.map(f => `• ${f.file} — ${f.reason}`).join("\n")}` : "");
    notifyApi.sendMessage(msg, notifyThreadID);
  }

  return result;
}

module.exports.handleReaction = async function ({ api, event, handleReaction }) {
  if (event.reaction !== "➡️" || event.userID === api.getCurrentUserID()) return;
  const { threadID, messageID } = event;
  const { query, page, totalPages, limit, typeFilter } = handleReaction;
  if (page < totalPages) {
    api.unsendMessage(messageID);
    await sendSearchPage(api, threadID, query, page + 1, limit, typeFilter);
  }
};

module.exports.handleReply = async function ({ api, event, handleReply }) {
  const { threadID, body } = event;
  const { query, totalPages, limit, typeFilter } = handleReply;
  const match = body.match(/^page (\d+)$/i);
  if (match) {
    const newPage = parseInt(match[1]);
    if (newPage >= 1 && newPage <= totalPages) {
      api.unsendMessage(handleReply.messageID);
      await sendSearchPage(api, threadID, query, newPage, limit, typeFilter);
    }
  }
};

module.exports.run = async function ({ api, event, args }) {
  const { threadID, senderID } = event;
  const sub = args[0] ? args[0].toLowerCase() : null;

  if (sub === "n" || sub === "notification") {
    const [updates, selfUpdate] = await Promise.all([
      getTodayUpdates(),
      checkSelfUpdate()
    ]);

    let msg = "";

    if (selfUpdate?.hasUpdate) {
      msg +=
        `🆙 [ MIRAISTORE SELF UPDATE ]\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `Current : v${selfUpdate.currentVersion}\n` +
        `Latest  : v${selfUpdate.latestVersion}\n` +
        `ID      : ${selfUpdate.latestId}\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `💡 Run this to update:\n` +
        `!ms install ${selfUpdate.latestId}\n\n`;
    }

    if (updates.length === 0 && !selfUpdate?.hasUpdate)
      return api.sendMessage("📅 No updates today.", threadID);

    if (updates.length > 0) {
      msg += `📂 Today's Store Updates\n━━━━━━━━━━━━━━━━━━\n`;
      updates.forEach(cmd =>
        msg += `╭─‣ ${cmd.name}\n├‣ ID: ${cmd.id}\n├‣ Type: ${cmd.type || "N/A"}\n├‣ Author: ${cmd.author}\n╰────────────◊\n\n`
      );
    }

    return api.sendMessage(msg.trim(), threadID);
  }

  if (!sub) {
    const [updates, selfUpdate] = await Promise.all([
      getTodayUpdates(),
      checkSelfUpdate()
    ]);

    if (selfUpdate?.hasUpdate && !userSeenNoti.get(`update_${selfUpdate.latestVersion}_${senderID}`)) {
      userSeenNoti.set(`update_${selfUpdate.latestVersion}_${senderID}`, true);
      return api.sendMessage(
        `🆙 [ MIRAISTORE UPDATE AVAILABLE ]\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `Current version : v${selfUpdate.currentVersion}\n` +
        `New version     : v${selfUpdate.latestVersion}\n` +
        `Store ID        : ${selfUpdate.latestId}\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `💡 Install the new version:\n` +
        `!ms install ${selfUpdate.latestId}\n\n` +
        `(Type "!ms" again to see the menu)`,
        threadID
      );
    }

    if (updates.length > 0 && !userSeenNoti.get(senderID)) {
      let n = `🔔 [ NOTIFICATION ]\nToday ${updates.length} update(s)!\n━━━━━━━━━━━━━━━━━━\n`;
      updates.forEach(f => n += ` ‣ ${f.name} (ID: ${f.id})\n`);
      n += `\n(Type "!ms n" for details or "!ms" again for menu)`;
      userSeenNoti.set(senderID, true);
      return api.sendMessage(n, threadID);
    }

    return api.sendMessage(
      "📦 Mirai Store\n\nUsage:\n" +
      "• !ms <id | name | category | author>\n" +
      "• !ms n (Noti)\n" +
      "• !ms install <id>\n" +
      "• !ms event install <id>  ← force as event\n" +
      "• !ms event <filename>    ← event file info\n" +
      "• !ms like <id>\n" +
      "• !ms trending\n" +
      "• !ms upload <commandName>\n" +
      "• !ms upload event <eventName>\n" +
      "• !ms sync\n" +
      "• !ms delete <id> <secret>\n" +
      "• !ms list [page]",
      threadID
    );
  }

  if (sub === "event") {
    const action = args[1] ? args[1].toLowerCase() : null;

    if (action === "install") {
      const id = args[2];
      if (!id) return api.sendMessage("❌ Usage: !ms event install <id>", threadID);
      return doInstall(api, threadID, id, "event");
    }

    if (action) {
      const baseDir = path.join(__dirname, "..");
      const eventsDir = path.join(baseDir, "events");
      const tryNames = [action, action + ".js"];
      let found = null;
      for (const n of tryNames) {
        const p = path.join(eventsDir, n);
        if (fs.existsSync(p)) { found = p; break; }
      }

      if (found) {
        let code = "";
        try { code = fs.readFileSync(found, "utf8"); } catch (_) {}
        const name     = code.match(/name\s*:\s*["'`](.*?)["'`]/)?.[1]    || action;
        const author   = code.match(/credits\s*:\s*["'`](.*?)["'`]/)?.[1] || "Unknown";
        const version  = code.match(/version\s*:\s*["'`](.*?)["'`]/)?.[1] || "N/A";
        const category = code.match(/commandCategory\s*:\s*["'`](.*?)["'`]/)?.[1] || "N/A";
        const desc     = code.match(/description\s*:\s*["'`](.*?)["'`]/)?.[1] || "No description";
        const framework = detectFrameworkLocal(code);

        return api.sendMessage(
          `📁 Local Event File Info\n` +
          `╭─‣ Name : ${name}\n` +
          `├‣ Type : ${framework}-event\n` +
          `├‣ Author : ${author}\n` +
          `├‣ Version : ${version}\n` +
          `├‣ Category : ${category}\n` +
          `├‣ Location : events/${path.basename(found)}\n` +
          `╰────────────◊\n` +
          `⭔ Description: ${desc}`,
          threadID
        );
      } else {
        try {
          const res = await axios.get(
            `${API_BASE}/miraistore/search?q=${encodeURIComponent(action)}&limit=5`
          );
          const data = res.data;
          const allCmds = Array.isArray(data.commands) ? data.commands : (data && !data.message ? [data] : []);
          const events = allCmds.filter(c => String(c.type || "").endsWith("-event"));

          if (events.length === 0)
            return api.sendMessage(`❌ No event found locally or in store: "${action}"`, threadID);

          let msg = `📂 Store Events matching "${action}"\n\n`;
          events.forEach(cmd => {
            msg += `╭─‣ Name : ${cmd.name}\n`;
            msg += `├‣ Type : ${cmd.type}\n`;
            msg += `├‣ Author : ${cmd.author}\n`;
            msg += `├‣ Version : ${cmd.version || "N/A"}\n`;
            msg += `├‣ Category : ${cmd.category}\n`;
            msg += `├‣ ID : ${cmd.id}\n`;
            msg += `╰────────────◊\n\n`;
          });
          msg += `💡 Use: !ms event install <id>  to install`;
          return api.sendMessage(msg.trim(), threadID);
        } catch (err) {
          console.error("EVENT SEARCH ERROR:", err.message);
          return api.sendMessage("❌ Event search API error.", threadID);
        }
      }
    }

    try {
      const res = await axios.get(`${API_BASE}/miraistore/list?limit=20`);
      const allCmds = res.data.commands || [];
      const events = allCmds.filter(c => String(c.type || "").endsWith("-event"));
      if (events.length === 0)
        return api.sendMessage("❌ No events found in store.", threadID);

      let msg = `📂 Store Events (${events.length})\n\n`;
      events.forEach(cmd => {
        msg += `╭─‣ ${cmd.name}\n`;
        msg += `├‣ Type : ${cmd.type}\n`;
        msg += `├‣ ID : ${cmd.id}\n`;
        msg += `├‣ Author : ${cmd.author}\n`;
        msg += `╰────────────◊\n\n`;
      });
      msg += `💡 Use: !ms event install <id>  to install`;
      return api.sendMessage(msg.trim(), threadID);
    } catch (err) {
      console.error("EVENT LIST ERROR:", err.message);
      return api.sendMessage("❌ Event list API error.", threadID);
    }
  }

  if (sub === "sync") {
    if (module.exports.config.hasPermission > 0 && !isBotAdmin(senderID))
      return api.sendMessage("❌ You are not allowed to run sync.", threadID);
    api.sendMessage("🔄 Syncing all commands to MiraiStore... background e cholbe.", threadID);
    runAutoSync({ silent: false, notifyApi: api, notifyThreadID: threadID }).catch(err => {
      console.error("[MiraiStore Sync] failed:", err.message);
      api.sendMessage(`❌ Sync crashed: ${err.message}`, threadID);
    });
    return;
  }

  if (sub === "upload") {
    if (module.exports.config.hasPermission > 0 && !isBotAdmin(senderID))
      return api.sendMessage("❌ You are not allowed to upload.", threadID);

    let cmdName, forceKind;
    if (args[1] && args[1].toLowerCase() === "event") {
      cmdName   = args[2];
      forceKind = "event";
    } else {
      cmdName   = args[1];
      forceKind = null;
    }

    if (!cmdName) return api.sendMessage("📁 Please provide a file name.\nUsage:\n• !ms upload <commandName>\n• !ms upload event <eventName>", threadID);

    const baseDir = path.join(__dirname, "..");

    const candidates = forceKind === "event"
      ? [{ dir: path.join(baseDir, "events"), kind: "event" }]
      : [
          { dir: path.join(baseDir, "commands"), kind: "command" },
          { dir: path.join(baseDir, "events"),   kind: "event" }
        ];

    let fileToRead, kind;
    for (const { dir, kind: k } of candidates) {
      const p1 = path.join(dir, cmdName);
      const p2 = path.join(dir, cmdName + ".js");
      if (fs.existsSync(p1)) { fileToRead = p1; kind = k; break; }
      if (fs.existsSync(p2)) { fileToRead = p2; kind = k; break; }
    }

    if (!fileToRead) {
      const searched = forceKind === "event" ? "`events` folder" : "`commands` or `events` folder";
      return api.sendMessage(`❌ File not found in ${searched}.`, threadID);
    }

    try {
      const data = fs.readFileSync(fileToRead, "utf8");
      try { new Function(data); } catch (e) {
        return api.sendMessage(`❌ Syntax Error:\n${e.message}`, threadID);
      }

      const displayName = (data.match(/name\s*:\s*["'`](.*?)["'`]/)?.[1]) || cmdName;

      let progressMsgID;
      try {
        progressMsgID = await animateUpload(api, threadID, displayName);
      } catch (err) {
        console.error("ANIMATE ERROR:", err.message);
      }

      const pasteRes = await axios.post("https://pastebin-api.vercel.app/paste", { text: data });

      if (!pasteRes.data?.id) {
        if (progressMsgID) api.unsendMessage(progressMsgID);
        return api.sendMessage("⚠️ Upload failed. No valid ID received from PasteBin server.", threadID);
      }

      const rawUrl = `https://pastebin-api.vercel.app/raw/${pasteRes.data.id}`;
      const framework = detectFrameworkLocal(data);
      const res = await axios.post(`${API_BASE}/miraistore/upload`, { rawUrl, framework, kind });

      if (res.data?.error) {
        if (progressMsgID) api.unsendMessage(progressMsgID);
        return api.sendMessage(`⚠️ Paste uploaded but Miraistore API error: ${res.data.error}`, threadID);
      }

      const author      = data.match(/credits\s*:\s*["'`](.*?)["'`]/)?.[1]         || "Unknown";
      const version     = data.match(/version\s*:\s*["'`](.*?)["'`]/)?.[1]         || "N/A";
      const uploadDate  = new Date().toDateString();

      const successMsg =
        `✅ Upload Successful!\n` +
        `╭─‣ Name : ${displayName}\n` +
        `├‣ Type : ${res.data.type || `${framework}-${kind}`}\n` +
        `├‣ Version : ${version}\n` +
        `├‣ Author : ${author}\n` +
        `╰────────────◊\n` +
        `⭔ Upload : ${uploadDate}`;

      if (progressMsgID) {
        api.editMessage(successMsg, progressMsgID, (err) => {
          if (err) {
            console.error("EDIT MESSAGE ERROR:", err.message || err);
            api.sendMessage(successMsg, threadID);
          }
        });
      } else {
        api.sendMessage(successMsg, threadID);
      }
    } catch (err) {
      console.error(err);
      return api.sendMessage("❌ Upload failed. Try again later.", threadID);
    }
  }

  if (sub === "delete") {
    if (module.exports.config.hasPermission > 0 && !isBotAdmin(senderID))
      return api.sendMessage("❌ You are not allowed to delete.", threadID);
    const id = args[1];
    const secret = args[2];
    if (!id || !secret)
      return api.sendMessage("❌ Usage: !ms delete <id> <secret>", threadID);
    try {
      const res = await axios.post(`${API_BASE}/miraistore/delete/${id}`, { secret });
      if (res.data?.error) return api.sendMessage(`❌ ${res.data.error}`, threadID);
      return api.sendMessage(`🗑️ Deleted!\n🆔 ID: ${id}`, threadID);
    } catch (err) {
      console.error("DELETE ERROR:", err.message);
      return api.sendMessage("❌ Delete API error.", threadID);
    }
  }

  if (sub === "like") {
    const id = args[1];
    if (!id) return api.sendMessage("❌ Usage: !ms like <id>", threadID);
    try {
      const res = await axios.post(`${API_BASE}/miraistore/like/${id}`, { userID: senderID });
      if (res.data?.message) return api.sendMessage("⚠️ Already liked.", threadID);
      return api.sendMessage(`❤️ Liked!\nTotal Likes: ${res.data.likes}`, threadID);
    } catch (err) {
      console.error("LIKE ERROR:", err.message);
      return api.sendMessage("❌ Like API error.", threadID);
    }
  }

  if (sub === "install") {
    const id = args[1];
    if (!id) return api.sendMessage("❌ Usage: !ms install <id>", threadID);
    return doInstall(api, threadID, id, null);
  }

  if (sub === "trend" || sub === "trending") {
    try {
      const res = await axios.get(`${API_BASE}/miraistore/trending?limit=3`);
      if (!res.data.length) return api.sendMessage("❌ No trending commands.", threadID);
      let msg = "🔥 Top 3 Trending Mirai Commands 🔥\n\n";
      res.data.forEach((cmd, i) =>
        msg += `╭─‣ ${cmd.name}${i === 0 ? " 🏆" : ""}\n├‣ Type : ${cmd.type || "N/A"}\n├‣ Likes : ❤️ ${cmd.likes}\n├‣ ID : ${cmd.id}\n╰────────────◊\n\n`
      );
      return api.sendMessage(msg.trim(), threadID);
    } catch (err) {
      console.error("TRENDING ERROR:", err.message);
      return api.sendMessage("❌ Trending API error.", threadID);
    }
  }

  if (sub === "list" || sub === "ls") {
    let page = Number(args[1]) || 1;
    if (page < 1) page = 1;
    const limit = 20;
    const offset = (page - 1) * limit;
    try {
      const res = await axios.get(`${API_BASE}/miraistore/list?limit=${limit}&offset=${offset}`);
      const data = res.data;
      if (!data || !Array.isArray(data.commands) || data.commands.length === 0)
        return api.sendMessage("❌ No commands found for this page.", threadID);

      let msg = `📂 Miraistore List — Page ${page} / ${Math.ceil(data.total / limit)}\n\n`;
      data.commands.forEach(cmd => {
        msg +=
          `╭─‣ ${cmd.name}\n` +
          `├‣ Type : ${cmd.type || "N/A"}\n` +
          `├‣ Category : ${cmd.category}\n` +
          `├‣ ID : ${cmd.id}\n` +
          `├‣ Upload : ${new Date(cmd.uploadDate || Date.now()).toDateString()}\n` +
          `╰────────────◊\n\n`;
      });
      return api.sendMessage(msg.trim(), threadID);
    } catch (err) {
      console.error(err);
      return api.sendMessage("❌ List API error.", threadID);
    }
  }

  const query = args.join(" ");
  try {
    const res = await axios.get(`${API_BASE}/miraistore/search?q=${encodeURIComponent(query)}`);
    const data = res.data;
    if (!data || data.message) return api.sendMessage("❌ Command not found.", threadID);

    if (!isNaN(query) && !Array.isArray(data) && !data.commands) {
      const message =
        `╭─‣ Name : ${data.name}\n` +
        `├‣ Type : ${data.type || "N/A"}\n` +
        `├‣ Author : ${data.author}\n` +
        `├‣ Version : ${data.version || "N/A"}\n` +
        `├‣ Category : ${data.category}\n` +
        `├‣ Views : ${data.views}\n` +
        `├‣ Likes : ❤️ ${data.likes}\n` +
        `├‣ ID : ${data.id}\n` +
        `╰────────────◊\n` +
        `⭔ Description: ${data.description || "No description"}\n` +
        `⭔ Upload : ${new Date(data.uploadDate || Date.now()).toDateString()}\n` +
        `🌐 URL : ${data.rawUrl}`;
      return api.sendMessage(message, threadID);
    } else {
      await sendSearchPage(api, threadID, query, 1);
    }
  } catch (err) {
    console.error("SEARCH ERROR:", err.message, err.response?.data);
    return api.sendMessage("❌ Search API error.", threadID);
  }
};
