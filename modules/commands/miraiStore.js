const fs = require("fs");
const path = require("path");
const axios = require("axios");

const API_BASE = "https://store-xdi.vercel.app";
const userSeenNoti = new Map();
const AUTOSYNC_CACHE_PATH = path.join(process.cwd(), "goatstore_sync_cache.json");
const DIR_CACHE_PATH = path.join(process.cwd(), "goatstore_dircache.json");

let _updateCheckCache = null;
const UPDATE_CHECK_INTERVAL = 1000 * 60 * 30;

const MAX_EDITS_PER_MESSAGE = 5;

// --- Prefix detection ---------------------------------------------------
function getPrefix(event) {
  try {
    if (global.Mirai?.config?.prefix) return global.Mirai.config.prefix;
    if (global.config?.prefix) return global.config.prefix;
  } catch (_) {}
  return "!";
}

function loadSyncCache() {
  try { return JSON.parse(fs.readFileSync(AUTOSYNC_CACHE_PATH, "utf8")); }
  catch { return {}; }
}

function saveSyncCache(cache) {
  try { fs.writeFileSync(AUTOSYNC_CACHE_PATH, JSON.stringify(cache, null, 2)); }
  catch (_) {}
}

let _autoupdateInFlight = false;

function hashContent(content) {
  let h = 0;
  for (let i = 0; i < content.length; i++) h = (h * 31 + content.charCodeAt(i)) | 0;
  return h.toString(16);
}

function parseVer(v) {
  return String(v).split(".").map(n => parseInt(n) || 0);
}

function cmpVer(a, b) {
  const pa = parseVer(a), pb = parseVer(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

function detectFramework(code) {
  const hasAuthorRole = /\bauthor\s*:/.test(code) && /\brole\s*:/.test(code);
  const hasCreditsPermission = /\bcredits\s*:/.test(code) && /\bhasPermission\s*[:(]/.test(code);

  if (hasAuthorRole && !hasCreditsPermission) return "goat";
  if (hasCreditsPermission && !hasAuthorRole) return "mirai";

  const isGoatStructure =
    /module\.exports\s*=\s*\{/.test(code) &&
    /onStart\s*[:(]|onChat\s*[:(]|onLoad\s*[:(]/.test(code);
  const isMiraiStructure =
    /module\.exports\.config\s*=/.test(code) ||
    /module\.exports\.run\s*=/.test(code);

  return (isGoatStructure && !isMiraiStructure) ? "goat" : "mirai";
}

const EVENTS_NAME_PATTERNS = ["events", "event"];
const SCAN_SKIP_DIRS = new Set(["node_modules", ".git", ".cache", ".github", "dist", "build"]);

function loadDirCache() {
  try { return JSON.parse(fs.readFileSync(DIR_CACHE_PATH, "utf8")); }
  catch { return {}; }
}

function saveDirCache(cache) {
  try { fs.writeFileSync(DIR_CACHE_PATH, JSON.stringify(cache, null, 2)); }
  catch (_) {}
}

let _dirCache = loadDirCache();

function scanForDir(startDir, namePatterns, maxDepth = 2) {
  const queue = [{ dir: startDir, depth: 0 }];
  while (queue.length) {
    const { dir, depth } = queue.shift();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { continue; }
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      if (SCAN_SKIP_DIRS.has(ent.name)) continue;
      if (ent.name.startsWith(".")) continue;
      const lower = ent.name.toLowerCase();
      const full = path.join(dir, ent.name);
      if (namePatterns.includes(lower)) return full;
      if (depth < maxDepth) queue.push({ dir: full, depth: depth + 1 });
    }
  }
  return null;
}

function getCmdsDir(forceRescan = false) {
  if (!forceRescan && _dirCache.cmdsDir && fs.existsSync(_dirCache.cmdsDir)) return _dirCache.cmdsDir;
  const dir = __dirname;
  _dirCache.cmdsDir = dir;
  saveDirCache(_dirCache);
  return dir;
}

function getEventsDir(forceRescan = false) {
  if (!forceRescan && _dirCache.eventsDir && fs.existsSync(_dirCache.eventsDir)) return _dirCache.eventsDir;
  const cmdsDir = getCmdsDir(forceRescan);
  const parent = path.dirname(cmdsDir);
  const dir =
    scanForDir(parent, EVENTS_NAME_PATTERNS, 2) ||
    path.join(parent, "events");
  _dirCache.eventsDir = dir;
  saveDirCache(_dirCache);
  return dir;
}

async function checkSelfUpdate() {
  const now = Date.now();
  if (_updateCheckCache && (now - _updateCheckCache.checkedAt) < UPDATE_CHECK_INTERVAL)
    return _updateCheckCache.result;
  try {
    const res = await axios.get(`${API_BASE}/miraistore/search?q=miraistore&limit=10&framework=goat&kind=command`);
    const cmds = Array.isArray(res.data?.commands) ? res.data.commands : [];
    const match =
      cmds.find(c => c.name?.toLowerCase() === "miraistore" && c.author === module.exports.config.credits) ||
      cmds.find(c => c.name?.toLowerCase() === "miraistore");
    if (!match) { _updateCheckCache = { checkedAt: now, result: null }; return null; }
    const current = module.exports.config.version;
    const latest = match.version || "N/A";
    const result = {
      hasUpdate: cmpVer(latest, current) > 0,
      currentVersion: current,
      latestVersion: latest,
      latestId: match.id,
      description: match.description || match.changelog || ""
    };
    _updateCheckCache = { checkedAt: now, result };
    return result;
  } catch (_) { return null; }
}

async function getTodayUpdates() {
  try {
    const res = await axios.get(`${API_BASE}/miraistore/list?limit=50&framework=goat`);
    const today = new Date().toDateString();
    return (res.data.commands || [])
      .filter(cmd => new Date(cmd.uploadDate).toDateString() === today);
  } catch (_) { return []; }
}

async function runAutoSync() {
  const folders = [
    { dir: getCmdsDir(), kind: "command" },
    { dir: getEventsDir(), kind: "event" }
  ].filter(f => fs.existsSync(f.dir));

  if (!folders.length) return;

  const cache = loadSyncCache();

  for (const { dir, kind } of folders) {
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".js"));
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const cacheKey = `${kind}:${file}`;
      let content;
      try { content = fs.readFileSync(fullPath, "utf8"); } catch (_) { continue; }

      const hash = hashContent(content);
      if (cache[cacheKey]?.hash === hash) continue;

      try { new Function(content); } catch (_) { continue; }
      if (detectFramework(content) !== "goat") continue;

      try {
        const author = content.match(/author\s*:\s*["'`](.*?)["'`]/)?.[1]
                    || content.match(/credits\s*:\s*["'`](.*?)["'`]/)?.[1]
                    || "Unknown";
        const category = content.match(/category\s*:\s*["'`](.*?)["'`]/)?.[1] || "Uncategorized";
        const res = await axios.post(`${API_BASE}/miraistore/upload`, { rawCode: content, framework: "goat", kind, author, category });
        if (res.data?.error) {
          console.error(`[goatstore-sync] Upload skipped for ${file}: ${res.data.message || res.data.error}`);
        } else if (res.data?.updated) {
          console.log(`[goatstore-sync] ${file}: updated existing entry (ID: ${res.data.id}) to v${res.data.version}.`);
          cache[cacheKey] = { hash, id: res.data.id, secret: res.data.secret || cache[cacheKey]?.secret || null };
        } else {
          console.log(`[goatstore-sync] ${file}: uploaded as new entry (ID: ${res.data.id}).`);
          cache[cacheKey] = { hash, id: res.data.id, secret: res.data.secret || null };
        }
      } catch (err) {
        console.error(`[goatstore-sync] Upload request fail for ${file}:`, err.response?.data?.error || err.message);
      }

      await new Promise(r => setTimeout(r, 500));
    }
  }

  saveSyncCache(cache);
}

const buildBar = pct => "█".repeat(Math.floor(pct / 10)) + "░".repeat(10 - Math.floor(pct / 10));
const frames = ["◖", "◕", "◔", "◓", "◒", "◑", "◐"];

async function animateInstall(api, threadID, name) {
  const steps = [
    { label: "Downloading source",  pct: 30,  delay: 600 },
    { label: "Verifying integrity", pct: 60,  delay: 900 },
    { label: "Writing to disk",     pct: 85,  delay: 700 },
    { label: "Registering command", pct: 100, delay: 600 }
  ];
  const info = await api.sendMessage(`📦 Installing ${name}...\n\n◖ Fetching package info...\n[░░░░░░░░░░] 0%`, threadID);
  for (let i = 0; i < steps.length; i++) {
    await new Promise(r => setTimeout(r, steps[i].delay));
    await api.editMessage(`📦 Installing ${name}...\n\n${frames[i]} ${steps[i].label}...\n[${buildBar(steps[i].pct)}] ${steps[i].pct}%`, info.messageID);
  }
  return info.messageID;
}

async function animateUpload(api, threadID, name) {
  const steps = [
    { label: "Reading file",            pct: 30,  delay: 500 },
    { label: "Uploading directly",      pct: 70,  delay: 900 },
    { label: "Finalizing registration", pct: 100, delay: 500 }
  ];
  const info = await api.sendMessage(`📤 Uploading ${name}...\n\n◖ Preparing upload...\n[░░░░░░░░░░] 0%`, threadID);
  for (let i = 0; i < steps.length; i++) {
    await new Promise(r => setTimeout(r, steps[i].delay));
    await api.editMessage(`📤 Uploading ${name}...\n\n${frames[i]} ${steps[i].label}...\n[${buildBar(steps[i].pct)}] ${steps[i].pct}%`, info.messageID);
  }
  return info.messageID;
}

// MiraiBot: autoload uses global.client.commands instead of global.GoatBot.commands
function autoloadCommand(filePath) {
  try {
    delete require.cache[require.resolve(filePath)];
    const cmd = require(filePath);
    const name = cmd?.config?.name?.toLowerCase();
    if (name) {
      global.client.commands.set(name, cmd);
      if (Array.isArray(cmd.config.aliases))
        cmd.config.aliases.forEach(a => global.client.commands.set(a.toLowerCase(), cmd));
      if (typeof cmd.onLoad === "function") cmd.onLoad({});
      return { success: true, name };
    }
    return { success: false, reason: "Missing config.name." };
  } catch (err) {
    return { success: false, reason: err.message };
  }
}

function typeBadge(cmd) {
  const fw =
    cmd.framework === "mirai" ? "🌌 Mirai"
    : cmd.framework === "other" ? `📦 ${cmd.otherType || "Other"}`
    : "🐐 Goat";
  const kd = cmd.kind === "event" ? " Event" : cmd.kind === "command" ? " Command" : "";
  return fw + kd;
}

async function doInstall(api, threadID, id, forceKind = null) {
  let cmdData = null;
  try {
    const res = await axios.get(`${API_BASE}/miraistore/search?q=${encodeURIComponent(id)}`);
    const data = res.data;
    if (!isNaN(id) && data?.rawCode && !Array.isArray(data)) cmdData = data;
    else if (Array.isArray(data?.commands)) cmdData = data.commands.find(c => String(c.id) === String(id));
    if (!cmdData?.rawCode) return api.sendMessage("❌ Command not found or rawCode missing.", threadID);
  } catch (_) { return api.sendMessage("❌ Failed to fetch command info.", threadID); }

  if (cmdData.framework !== "goat")
    return api.sendMessage(
      `❌ This is not a GoatBot file!\n` +
      `├‣ Category : ${cmdData.framework || "unknown"}\n` +
      `╰────────────◊\n` +
      `⚠️ Only goat-framework commands/events can be installed here.`,
      threadID
    );

  try { new Function(cmdData.rawCode); }
  catch (err) { return api.sendMessage(`❌ Syntax error in remote code.\n${err.message}`, threadID); }

  const displayName = cmdData.name || `gs_${id}`;
  const isEvent = forceKind === "event" ? true : forceKind === "command" ? false : cmdData.kind === "event";

  let pid;
  try { pid = await animateInstall(api, threadID, displayName); } catch (_) {}

  const fileName = displayName.replace(/\s+/g, "_") + ".js";
  const baseDir = process.cwd();
  const installDir = isEvent ? getEventsDir() : getCmdsDir();
  const filePath = path.join(installDir, fileName);
  const locLabel = path.relative(baseDir, filePath);

  try {
    if (!fs.existsSync(installDir)) fs.mkdirSync(installDir, { recursive: true });
    fs.writeFileSync(filePath, cmdData.rawCode, "utf-8");
  } catch (err) {
    if (pid) api.unsendMessage(pid);
    return api.sendMessage(`❌ Failed to write file:\n${err.message}`, threadID);
  }

  try { await axios.post(`${API_BASE}/miraistore/install/${cmdData.id}`); } catch (_) {}

  const load = isEvent ? { success: false } : autoloadCommand(filePath);

  const msg =
    `✅ Installed Successfully!\n` +
    `╭─‣ Name : ${cmdData.name || "Unknown"}\n` +
    `├‣ Type : ${typeBadge(cmdData)}\n` +
    `├‣ Author : ${cmdData.author || "Unknown"}\n` +
    `├‣ Version : ${cmdData.version || "N/A"}\n` +
    `├‣ Category : ${cmdData.category || "N/A"}\n` +
    `├‣ ID : ${id}\n` +
    `├‣ Location : ${locLabel}\n` +
    `╰────────────◊\n` +
    (load.success ? `🚀 "${load.name}" is now live! No restart needed.`
      : isEvent ? `⚠️ Event saved. Restart bot to apply.`
      : `⚠️ Autoload failed: ${load.reason}`);

  if (pid) {
    try { await api.editMessage(msg, pid); setTimeout(() => api.unsendMessage(pid).catch(() => {}), 5000); }
    catch (_) { api.sendMessage(msg, threadID); }
  } else api.sendMessage(msg, threadID);
}

async function doSelfUpdateSilent(api, threadID, selfUpdate) {
  let cmdData = null;
  try {
    const res = await axios.get(`${API_BASE}/miraistore/search?q=${encodeURIComponent(selfUpdate.latestId)}`);
    const data = res.data;
    if (!isNaN(selfUpdate.latestId) && data?.rawCode && !Array.isArray(data)) cmdData = data;
    else if (Array.isArray(data?.commands)) cmdData = data.commands.find(c => String(c.id) === String(selfUpdate.latestId));
    if (!cmdData?.rawCode) return false;
  } catch (_) { return false; }

  try { new Function(cmdData.rawCode); }
  catch (_) { return false; }

  try {
    fs.writeFileSync(__filename, cmdData.rawCode, "utf-8");
  } catch (_) { return false; }

  try { await axios.post(`${API_BASE}/miraistore/install/${cmdData.id}`); } catch (_) {}

  const changelog = (cmdData.description || cmdData.changelog || "No changelog provided.").trim();
  const load = autoloadCommand(__filename);

  if (api && threadID) {
    const msg =
      `♻️ Auto-Updated GoatStore!\n` +
      `╭─‣ Version : v${cmdData.version || selfUpdate.latestVersion}\n` +
      `├‣ ID : ${cmdData.id}\n` +
      `╰────────────◊\n` +
      `📝 Changelog:\n${changelog}\n\n` +
      (load.success ? `🚀 Live now! No restart needed.` : `⚠️ Reload failed (${load.reason}) — restart bot to apply.`);
    api.sendMessage(msg, threadID).catch(() => {});
  }
  return true;
}

async function maybeAutoUpdate(api, threadID) {
  if (_autoupdateInFlight) return;
  const selfUpdate = await checkSelfUpdate();
  if (!selfUpdate?.hasUpdate) return;
  _autoupdateInFlight = true;
  try {
    await doSelfUpdateSilent(api, threadID, selfUpdate);
  } finally {
    _autoupdateInFlight = false;
  }
}

async function sendListPage(api, threadID, senderID, kind, page, limit = 10, prefix = "!") {
  const offset = (page - 1) * limit;
  try {
    const res = await axios.get(`${API_BASE}/miraistore/list?limit=${limit}&offset=${offset}&framework=goat&kind=${kind}`);
    const data = res.data;
    if (!Array.isArray(data.commands) || !data.commands.length)
      return api.sendMessage("❌ No results found for this page.", threadID);

    const totalPages = Math.ceil(data.total / limit);
    const label = kind === "event" ? "GoatBot Events" : "GoatBot Commands";
    let msg = `📂 ${label} — Page ${page}/${totalPages} (${data.total} total)\n\n`;
    data.commands.forEach(cmd => {
      msg += `╭─‣ ${cmd.name} 〄\n`;
      msg += `├‣ ID : ${cmd.id}\n`;
      msg += `├‣ Author : ${cmd.author}\n`;
      msg += `├‣ Category : ${cmd.category}\n`;
      msg += `╰────────────◊\n`;
      msg += ` ✰ Upload : ${new Date(cmd.uploadDate || Date.now()).toDateString()}\n\n`;
    });
    if (totalPages > 1) msg += `Reply "page <number>" to go to a specific page.`;

    const finalMsg = msg.trim();
    const sent = await api.sendMessage(finalMsg, threadID);
    if (totalPages > 1) {
      // MiraiBot: use global.client.handleReply
      global.client.handleReply.push({
        name: "miraistore",
        messageID: sent.messageID,
        listType: kind,
        page,
        totalPages,
        limit,
        mode: "list",
        senderID,
        editCount: 0
      });
    }
  } catch (_) { api.sendMessage("❌ List API error.", threadID); }
}

async function sendSearchPage(api, threadID, senderID, query, page, limit = 5, prefix = "!", filterOpts = {}) {
  const offset = (page - 1) * limit;
  try {
    let url = `${API_BASE}/miraistore/search?limit=${limit}&offset=${offset}`;
    if (filterOpts.author) url += `&author=${encodeURIComponent(filterOpts.author)}`;
    else url += `&q=${encodeURIComponent(query || "")}`;
    if (filterOpts.framework) url += `&framework=${filterOpts.framework}`;

    const res = await axios.get(url);
    const data = res.data;
    if (!Array.isArray(data.commands) || !data.commands.length)
      return api.sendMessage(`❌ No results found${query ? ` for "${query}"` : ""}.`, threadID);

    const total = data.total || data.commands.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const title = filterOpts.author
      ? `👤 Author: ${filterOpts.author}`
      : (filterOpts.framework && !query ? `📂 Category: ${filterOpts.framework}` : `🔍 Search: "${query}"`);

    let msg = `${title} (${total} found)\n\n`;
    data.commands.forEach(cmd => {
      msg += `╭─‣ ${cmd.name} 〄\n`;
      msg += `├‣ ID : ${cmd.id}\n`;
      msg += `├‣ Type : ${typeBadge(cmd)}\n`;
      msg += `├‣ Author : ${cmd.author}\n`;
      msg += `├‣ Category : ${cmd.category}\n`;
      msg += `╰────────────◊\n`;
      msg += ` ✰ Upload : ${new Date(cmd.uploadDate || Date.now()).toDateString()}\n\n`;
    });
    if (totalPages > 1) msg += `Page ${page}/${totalPages}\nReply "page <number>" to navigate.\n`;
    msg += `💬 Reply "delete <id> <secret>" to remove one of your uploads.`;

    const finalMsg = msg.trim();
    const sent = await api.sendMessage(finalMsg, threadID);

    // MiraiBot: push to global.client.handleReply
    global.client.handleReply.push({
      name: "miraistore",
      messageID: sent.messageID,
      query,
      authorQuery: filterOpts.author || null,
      framework: filterOpts.framework || null,
      page,
      totalPages,
      limit,
      mode: "search",
      senderID,
      editCount: 0
    });
  } catch (_) { api.sendMessage("❌ Search API error.", threadID); }
}

async function renderListPageInto(messageID, kind, page, limit) {
  const offset = (page - 1) * limit;
  const res = await axios.get(`${API_BASE}/miraistore/list?limit=${limit}&offset=${offset}&framework=goat&kind=${kind}`);
  const data = res.data;
  if (!Array.isArray(data.commands) || !data.commands.length) return null;

  const totalPages = Math.ceil(data.total / limit);
  const label = kind === "event" ? "GoatBot Events" : "GoatBot Commands";
  let msg = `📂 ${label} — Page ${page}/${totalPages} (${data.total} total)\n\n`;
  data.commands.forEach(cmd => {
    msg += `╭─‣ ${cmd.name} 〄\n`;
    msg += `├‣ ID : ${cmd.id}\n`;
    msg += `├‣ Author : ${cmd.author}\n`;
    msg += `├‣ Category : ${cmd.category}\n`;
    msg += `╰────────────◊\n`;
    msg += ` ✰ Upload : ${new Date(cmd.uploadDate || Date.now()).toDateString()}\n\n`;
  });
  if (totalPages > 1) msg += `Reply "page <number>" to navigate.`;
  return { text: msg.trim(), totalPages };
}

async function renderSearchPageInto(query, page, limit, filterOpts = {}) {
  const offset = (page - 1) * limit;
  let url = `${API_BASE}/miraistore/search?limit=${limit}&offset=${offset}`;
  if (filterOpts.author) url += `&author=${encodeURIComponent(filterOpts.author)}`;
  else url += `&q=${encodeURIComponent(query || "")}`;
  if (filterOpts.framework) url += `&framework=${filterOpts.framework}`;

  const res = await axios.get(url);
  const data = res.data;
  if (!Array.isArray(data.commands) || !data.commands.length) return null;

  const total = data.total || data.commands.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const title = filterOpts.author
    ? `👤 Author: ${filterOpts.author}`
    : (filterOpts.framework && !query ? `📂 Category: ${filterOpts.framework}` : `🔍 Search: "${query}"`);

  let msg = `${title} (${total} found)\n\n`;
  data.commands.forEach(cmd => {
    msg += `╭─‣ ${cmd.name} 〄\n`;
    msg += `├‣ ID : ${cmd.id}\n`;
    msg += `├‣ Type : ${typeBadge(cmd)}\n`;
    msg += `├‣ Author : ${cmd.author}\n`;
    msg += `├‣ Category : ${cmd.category}\n`;
    msg += `╰────────────◊\n`;
    msg += ` ✰ Upload : ${new Date(cmd.uploadDate || Date.now()).toDateString()}\n\n`;
  });
  if (totalPages > 1) msg += `Page ${page}/${totalPages}\nReply "page <number>" to navigate.`;
  return { text: msg.trim(), totalPages };
}

async function uploadFile(api, threadID, filePath, kind) {
  let data;
  try { data = fs.readFileSync(filePath, "utf8"); }
  catch (err) { return api.sendMessage(`❌ Read failed:\n${err.message}`, threadID); }

  try { new Function(data); }
  catch (err) { return api.sendMessage(`❌ Syntax Error:\n${err.message}`, threadID); }

  const displayName = data.match(/name\s*:\s*["'`](.*?)["'`]/)?.[1] || path.basename(filePath);

  let pid;
  try { pid = await animateUpload(api, threadID, displayName); } catch (_) {}

  try {
    const res = await axios.post(`${API_BASE}/miraistore/upload`, { rawCode: data, kind });

    if (res.data?.error === "Already exists" || res.data?.error === "Not allowed") {
      if (pid) api.unsendMessage(pid);
      return api.sendMessage(
        `⚠️ ${res.data.error === "Not allowed" ? "Upload Blocked!" : "Already Exists in Store!"}\n` +
        `╭─‣ Name : ${displayName}\n` +
        (res.data.id ? `├‣ ID : ${res.data.id}\n` : "") +
        `╰────────────◊\n` +
        `💡 ${res.data.message}`,
        threadID
      );
    }

    if (res.data?.error) {
      if (pid) api.unsendMessage(pid);
      return api.sendMessage(
        `⚠️ Upload Failed!\n` +
        `╭─‣ Name : ${displayName}\n` +
        `├‣ Error : ${res.data.error}\n` +
        `╰────────────◊\n` +
        `💡 ${res.data.message || "Backend/API check koro."}`,
        threadID
      );
    }

    const author  = data.match(/author\s*:\s*["'`](.*?)["'`]/)?.[1]
                 || data.match(/credits\s*:\s*["'`](.*?)["'`]/)?.[1]
                 || "Unknown";
    const version = data.match(/version\s*:\s*["'`](.*?)["'`]/)?.[1] || "N/A";
    const category = data.match(/category\s*:\s*["'`](.*?)["'`]/)?.[1] || "Uncategorized";

    let header = "✅ Upload Successful!";
    let note = "";
    if (res.data.olderVersion) {
      header = "⚠️ Older Version — Stored As New Entry!";
      note = `💡 ${res.data.message}\n`;
    } else if (res.data.updated) {
      header = "🔄 Updated Existing Entry (Overwritten)!";
      note = `💡 ${res.data.message}\n`;
    }

    const pfx = getPrefix();
    const msg =
      `${header}\n` +
      `╭─‣ Name : ${displayName}\n` +
      `├‣ Type : ${res.data.type || "unknown"}\n` +
      (res.data.otherType ? `├‣ Sub-type : ${res.data.otherType}\n` : "") +
      `├‣ Version : ${version}\n` +
      `├‣ Author : ${author}\n` +
      `├‣ Category : ${category}\n` +
      `├‣ ID : ${res.data.id}\n` +
      (res.data.secret ? `├‣ Secret : ${res.data.secret}\n` : "") +
      `╰────────────◊\n` +
      note +
      (res.data.secret ? `🔐 Save that secret — use "${pfx}gs delete ${res.data.id} <secret>" to remove later.\n` : "") +
      `⭔ Upload : ${new Date().toDateString()}`;

    if (pid) { try { await api.editMessage(msg, pid); } catch (_) { api.sendMessage(msg, threadID); } }
    else api.sendMessage(msg, threadID);
  } catch (err) {
    if (pid) api.unsendMessage(pid);
    api.sendMessage(
      `⚠️ Store API Call Failed!\n` +
      `├‣ Error : ${err.response?.data?.error || err.message}\n` +
      `╰────────────◊\n` +
      `💡 Network / backend check koro.`,
      threadID
    );
  }
}

// ============================================================
// MiraiBot Module Structure
// ============================================================

module.exports.config = {
  name: "miraistore",
  aliases: ["ms"],
  version: "15.9.0",
  credits: "rX",
  hasPermission: 2,
  description: "MiraiBot Store — Search, AutoUpdate, Install, Upload, AutoSync",
  commandCategory: "system",
  usages: "[list|install|upload|search|author|cat|trending|like|sync|delete|n]",
  cooldowns: 3
};

module.exports.handleReply = async function ({ api, event, handleReply: Reply }) {
  const { threadID, body, senderID } = event;

  // Reply-based delete
  const delMatch = body.match(/^delete\s+(\S+)\s+(\S+)/i);
  if (delMatch) {
    const [, delId, delSecret] = delMatch;
    try {
      const res = await axios.post(`${API_BASE}/miraistore/delete/${delId}`, { secret: delSecret, userID: senderID });
      if (res.data?.error) return api.sendMessage(`❌ ${res.data.error}`, threadID);
      return api.sendMessage(`🗑️ Deleted! ID: ${delId}`, threadID);
    } catch (_) { return api.sendMessage("❌ Delete API error.", threadID); }
  }

  const { mode, query, listType, authorQuery, framework, page, totalPages, limit, senderID: origSender } = Reply;
  if (senderID !== origSender) return;

  const match = body.match(/^page (\d+)$/i);
  if (!match) return;
  const newPage = parseInt(match[1]);
  if (newPage < 1 || newPage > totalPages)
    return api.sendMessage(`❌ Page must be between 1 and ${totalPages}.`, threadID);

  api.unsendMessage(Reply.messageID).catch(() => {});
  const prefix = getPrefix(event);
  if (mode === "list") await sendListPage(api, threadID, senderID, listType, newPage, limit, prefix);
  else await sendSearchPage(api, threadID, senderID, query, newPage, limit, prefix, { author: authorQuery, framework });
};

module.exports.run = async function ({ api, event, args }) {
  const { threadID, senderID } = event;
  const sub = args[0]?.toLowerCase() || null;
  const prefix = getPrefix(event);

  // Silent background self-update on every invocation
  maybeAutoUpdate(api, threadID).catch(() => {});

  if (!sub) {
    const updates = await getTodayUpdates();

    if (updates.length && !userSeenNoti.get(senderID)) {
      let n = `🔔 [ NOTIFICATION ]\nToday ${updates.length} GoatBot update(s)!\n━━━━━━━━━━━━━━━━━━\n`;
      updates.forEach(f => n += ` ‣ ${f.name} (ID: ${f.id})\n`);
      n += `\n(Type "${prefix}ms n" for details or "${prefix}ms" again for menu)`;
      userSeenNoti.set(senderID, true);
      return api.sendMessage(n, threadID);
    }

    const menuMsg =
      `📦 Store (Goat + Mirai + Other)\n\nUsage:\n` +
      `• ${prefix}ms <id | file name>\n` +
      `• ${prefix}ms author <name>\n` +
      `• ${prefix}ms cat <goat|mirai|other>\n` +
      `• ${prefix}ms n\n` +
      `• ${prefix}ms list [page]\n` +
      `• ${prefix}ms list event [page]\n` +
      `• ${prefix}ms install <id>\n` +
      `• ${prefix}ms event install <id>\n` +
      `• ${prefix}ms like <id>\n` +
      `• ${prefix}ms trending\n` +
      `• ${prefix}ms upload <fileName>\n` +
      `• ${prefix}ms upload event <fileName>\n` +
      `• ${prefix}ms othertype list\n` +
      `• ${prefix}ms othertype rename <fingerprint> <newName>\n` +
      `• ${prefix}ms sync\n` +
      `• ${prefix}ms delete <id> <secret>\n` +
      `• Reply "delete <id> <secret>" to a listing`;
    return api.sendMessage(menuMsg, threadID);
  }

  if (sub === "n" || sub === "notification") {
    const updates = await getTodayUpdates();
    if (!updates.length)
      return api.sendMessage("📅 No GoatBot updates today.", threadID);
    let msg = `📂 Today's GoatBot Updates\n━━━━━━━━━━━━━━━━━━\n`;
    updates.forEach(cmd =>
      msg += `╭─‣ ${cmd.name}\n├‣ ID: ${cmd.id}\n├‣ Type: ${typeBadge(cmd)}\n├‣ Author: ${cmd.author}\n╰────────────◊\n\n`
    );
    return api.sendMessage(msg.trim(), threadID);
  }

  if (sub === "sync") {
    api.sendMessage("🔄 Starting manual sync...", threadID);
    try {
      await runAutoSync();
      return api.sendMessage("✅ Sync complete.", threadID);
    } catch (err) {
      return api.sendMessage(`❌ Sync failed: ${err.message}`, threadID);
    }
  }

  if (sub === "list" || sub === "ls") {
    const isEvent = args[1]?.toLowerCase() === "event";
    const page = Math.max(1, Number(isEvent ? args[2] : args[1]) || 1);
    return sendListPage(api, threadID, senderID, isEvent ? "event" : "command", page, 10, prefix);
  }

  if (sub === "event") {
    const action = args[1]?.toLowerCase();

    if (action === "install") {
      const id = args[2];
      if (!id) return api.sendMessage(`❌ Usage: ${prefix}ms event install <id>`, threadID);
      return doInstall(api, threadID, id, "event");
    }

    if (!action) {
      try {
        const res = await axios.get(`${API_BASE}/miraistore/list?limit=20&framework=goat&kind=event`);
        const events = res.data.commands || [];
        if (!events.length) return api.sendMessage("❌ No GoatBot events found in store.", threadID);
        let msg = `📂 GoatBot Store Events (${res.data.total})\n\n`;
        events.forEach(cmd => {
          msg += `╭─‣ ${cmd.name}\n├‣ ID : ${cmd.id}\n├‣ Author : ${cmd.author}\n╰────────────◊\n\n`;
        });
        msg += `💡 Use: ${prefix}ms event install <id>`;
        return api.sendMessage(msg.trim(), threadID);
      } catch (_) { return api.sendMessage("❌ Event list API error.", threadID); }
    }

    try {
      const res = await axios.get(`${API_BASE}/miraistore/search?q=${encodeURIComponent(action)}&limit=5&framework=goat&kind=event`);
      const events = res.data.commands || [];
      if (!events.length) return api.sendMessage(`❌ No GoatBot event found: "${action}"`, threadID);
      let msg = `📂 GoatBot Events matching "${action}"\n\n`;
      events.forEach(cmd => {
        msg += `╭─‣ ${cmd.name}\n├‣ ID : ${cmd.id}\n├‣ Author : ${cmd.author}\n├‣ Version : ${cmd.version || "N/A"}\n╰────────────◊\n\n`;
      });
      msg += `💡 Use: ${prefix}ms event install <id>`;
      return api.sendMessage(msg.trim(), threadID);
    } catch (_) { return api.sendMessage("❌ Event search API error.", threadID); }
  }

  if (sub === "install") {
    const id = args[1];
    if (!id) return api.sendMessage(`❌ Usage: ${prefix}ms install <id>`, threadID);
    return doInstall(api, threadID, id, null);
  }

  if (sub === "like") {
    const id = args[1];
    if (!id) return api.sendMessage(`❌ Usage: ${prefix}ms like <id>`, threadID);
    try {
      const res = await axios.post(`${API_BASE}/miraistore/like/${id}`, { userID: senderID });
      if (res.data?.message) return api.sendMessage("⚠️ Already liked.", threadID);
      return api.sendMessage(`❤️ Liked! Total Likes: ${res.data.likes}`, threadID);
    } catch (_) { return api.sendMessage("❌ Like API error.", threadID); }
  }

  if (sub === "trend" || sub === "trending") {
    try {
      const res = await axios.get(`${API_BASE}/miraistore/trending?limit=5`);
      const list = res.data || [];
      if (!list.length) return api.sendMessage("❌ No trending files.", threadID);
      let msg = `🔥 Top Trending 🔥\n\n`;
      list.forEach((cmd, i) => {
        msg +=
          `╭─‣ ${cmd.name}${i === 0 ? " 🏆" : ""}\n` +
          `├‣ Type : ${typeBadge(cmd)}\n` +
          `├‣ Likes : ❤️ ${cmd.likes}\n` +
          `├‣ Views : 👁️ ${cmd.views}\n` +
          `├‣ ID : ${cmd.id}\n` +
          `╰────────────◊\n\n`;
      });
      return api.sendMessage(msg.trim(), threadID);
    } catch (_) { return api.sendMessage("❌ Trending API error.", threadID); }
  }

  if (sub === "upload") {
    const isEvent = args[1]?.toLowerCase() === "event";
    const fileName = isEvent ? args[2] : args[1];
    const kind = isEvent ? "event" : "command";
    if (!fileName)
      return api.sendMessage(`📁 Usage:\n• ${prefix}ms upload <fileName>\n• ${prefix}ms upload event <fileName>`, threadID);
    const dirs = kind === "event"
      ? [getEventsDir()]
      : [getCmdsDir(), getEventsDir()];
    let filePath = null;
    for (const dir of dirs) {
      if (fs.existsSync(path.join(dir, fileName))) { filePath = path.join(dir, fileName); break; }
      if (fs.existsSync(path.join(dir, fileName + ".js"))) { filePath = path.join(dir, fileName + ".js"); break; }
    }
    if (!filePath) return api.sendMessage(`❌ File not found: "${fileName}"`, threadID);
    return uploadFile(api, threadID, filePath, kind);
  }

  if (sub === "othertype") {
    const action = args[1]?.toLowerCase();

    if (action === "list") {
      try {
        const res = await axios.get(`${API_BASE}/miraistore/othertype/list`);
        const types = res.data?.types || [];
        if (!types.length) return api.sendMessage("❌ No 'other' sub-types discovered yet.", threadID);
        let msg = `📦 Other Sub-Types\n\n`;
        types.forEach(t => {
          msg += `╭─‣ ${t.name}\n├‣ Fingerprint : ${t.fingerprint}\n╰────────────◊\n\n`;
        });
        msg += `💡 Rename: ${prefix}ms othertype rename <fingerprint> <newName>`;
        return api.sendMessage(msg.trim(), threadID);
      } catch (_) { return api.sendMessage("❌ Othertype list API error.", threadID); }
    }

    if (action === "rename") {
      const fingerprint = args[2];
      const newName = args.slice(3).join(" ");
      if (!fingerprint || !newName)
        return api.sendMessage(`❌ Usage: ${prefix}ms othertype rename <fingerprint> <newName>`, threadID);
      try {
        const res = await axios.post(`${API_BASE}/miraistore/othertype/rename`, { fingerprint, newName });
        if (res.data?.error) return api.sendMessage(`❌ ${res.data.error}`, threadID);
        return api.sendMessage(`✏️ Renamed to "${res.data.name}" — applies to every entry with this fingerprint.`, threadID);
      } catch (_) { return api.sendMessage("❌ Othertype rename API error.", threadID); }
    }

    return api.sendMessage(
      `❌ Usage:\n• ${prefix}ms othertype list\n• ${prefix}ms othertype rename <fingerprint> <newName>`,
      threadID
    );
  }

  if (sub === "delete") {
    const id = args[1], secret = args[2];
    if (!id || !secret) return api.sendMessage(`❌ Usage: ${prefix}ms delete <id> <secret>`, threadID);
    try {
      const res = await axios.post(`${API_BASE}/miraistore/delete/${id}`, { secret, userID: senderID });
      if (res.data?.error) return api.sendMessage(`❌ ${res.data.error}`, threadID);
      return api.sendMessage(`🗑️ Deleted! ID: ${id}`, threadID);
    } catch (_) { return api.sendMessage("❌ Delete API error.", threadID); }
  }

  if (sub === "author") {
    const authorName = args.slice(1).join(" ");
    if (!authorName) return api.sendMessage(`❌ Usage: ${prefix}ms author <name>`, threadID);
    return sendSearchPage(api, threadID, senderID, "", 1, 5, prefix, { author: authorName });
  }

  if (sub === "cat" || sub === "category") {
    const catName = args[1]?.toLowerCase();
    if (!["goat", "mirai", "other"].includes(catName))
      return api.sendMessage(`❌ Usage: ${prefix}ms cat <goat|mirai|other>`, threadID);
    const rest = args.slice(2).join(" ");
    return sendSearchPage(api, threadID, senderID, rest, 1, 5, prefix, { framework: catName });
  }

  // Universal search
  const query = args.join(" ");
  try {
    const res = await axios.get(`${API_BASE}/miraistore/search?q=${encodeURIComponent(query)}`);
    const data = res.data;
    if (!data || data.message) return api.sendMessage("❌ Not found.", threadID);

    if (!isNaN(query) && !Array.isArray(data) && !data.commands) {
      const finalMsg =
        `${typeBadge(data)}\n` +
        `╭─‣ Name : ${data.name}\n` +
        `├‣ Author : ${data.author}\n` +
        `├‣ Version : ${data.version || "N/A"}\n` +
        `├‣ Category : ${data.category}\n` +
        `├‣ Views : 👁️ ${data.views}\n` +
        `├‣ Likes : ❤️ ${data.likes}\n` +
        `├‣ Installs : ⬇️ ${data.installs}\n` +
        `├‣ ID : ${data.id}\n` +
        `╰────────────◊\n` +
        `⭔ Description: ${data.description || "No description"}\n` +
        `⭔ Upload : ${new Date(data.uploadDate || Date.now()).toDateString()}\n` +
        `🌐 URL : ${data.rawUrl}`;
      return api.sendMessage(finalMsg, threadID);
    }

    return sendSearchPage(api, threadID, senderID, query, 1, 5, prefix);
  } catch (_) { return api.sendMessage("❌ Search API error.", threadID); }
};
