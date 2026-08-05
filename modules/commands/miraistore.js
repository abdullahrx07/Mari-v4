const fs = require("fs");
const path = require("path");
const axios = require("axios");

const API_BASE = "https://mirai-store.vercel.app";
const userSeenNoti = new Map();

const BASE_DIR = path.join(__dirname, "..");
const COMMANDS_DIR = path.join(BASE_DIR, "commands");
const EVENTS_DIR = path.join(BASE_DIR, "events");
const SYNC_CACHE_PATH = path.join(BASE_DIR, "miraistore_sync_cache.json");
const AUTOUPDATE_STATE_PATH = path.join(BASE_DIR, "miraistore_autoupdate.json");

const TRACKED_AUTHOR = ""; // matched case-insensitively against "rX"
const UPDATE_CHECK_INTERVAL = 1000 * 60 * 30;

let _updateCheckCache = null;
let _autoupdateState = loadAutoupdateState();
let _autoupdateInFlight = false;
let _cmdAutoupdateInFlight = false;

function getPrefix() {
  try { if (global.config?.prefix) return global.config.prefix; } catch (_) {}
  return "!";
}

function loadAutoupdateState() {
  try {
    const raw = JSON.parse(fs.readFileSync(AUTOUPDATE_STATE_PATH, "utf8"));
    return { enabled: !!raw.enabled };
  } catch { return { enabled: true }; }
}

function saveAutoupdateState(state) {
  try { fs.writeFileSync(AUTOUPDATE_STATE_PATH, JSON.stringify(state, null, 2)); } catch (_) {}
}

function loadSyncCache() {
  try { return JSON.parse(fs.readFileSync(SYNC_CACHE_PATH, "utf8")); } catch { return {}; }
}

function saveSyncCache(cache) {
  try { fs.writeFileSync(SYNC_CACHE_PATH, JSON.stringify(cache, null, 2)); } catch (_) {}
}

function hashContent(content) {
  let h = 0;
  for (let i = 0; i < content.length; i++) h = (h * 31 + content.charCodeAt(i)) | 0;
  return h.toString(16);
}

// --- Shared version comparison -------------------------------------------
function parseVer(v) { return String(v).split(".").map(n => parseInt(n) || 0); }
function cmpVer(a, b) {
  const pa = parseVer(a), pb = parseVer(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

// --- Framework detection (restored dual heuristic from GoatStore) ---------
// First checks author/role vs credits/hasPermission field signatures (fast,
// no false positives between the two conventions), then falls back to
// structural detection (module.exports shape) if neither signature matches.
function detectFrameworkLocal(code) {
  const hasAuthorRole = /\bauthor\s*:/.test(code) && /\brole\s*:/.test(code);
  const hasCreditsPermission = /\bcredits\s*:/.test(code) && /\bhasPermission\s*[:(]/.test(code);

  if (hasAuthorRole && !hasCreditsPermission) return "goat";
  if (hasCreditsPermission && !hasAuthorRole) return "mirai";

  const isGoatStyle =
    /module\.exports\s*=\s*\{/.test(code) &&
    /onStart\s*[:(]|onChat\s*[:(]|onLoad\s*[:(]/.test(code);
  const isMiraiStyle =
    /module\.exports\.config\s*=/.test(code) ||
    /module\.exports\.run\s*=/.test(code);

  return (isGoatStyle && !isMiraiStyle) ? "goat" : "mirai";
}

function extractMeta(content) {
  const name = content.match(/name\s*:\s*["'`](.*?)["'`]/)?.[1] || null;
  const author = content.match(/credits\s*:\s*["'`](.*?)["'`]/)?.[1]
              || content.match(/author\s*:\s*["'`](.*?)["'`]/)?.[1]
              || null;
  const version = content.match(/version\s*:\s*["'`](.*?)["'`]/)?.[1] || "0.0.0";
  const category = content.match(/commandCategory\s*:\s*["'`](.*?)["'`]/)?.[1]
                || content.match(/category\s*:\s*["'`](.*?)["'`]/)?.[1]
                || "Uncategorized";
  return { name, author, version, category };
}

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
    const res = await axios.get(`${API_BASE}/miraistore/list?limit=50`);
    const allCmds = res.data.commands || [];
    const today = new Date().toDateString();
    return allCmds.filter(cmd => new Date(cmd.uploadDate).toDateString() === today);
  } catch (_) { return []; }
}

// --- Per-command update detection (name/author/version) -------------------
// Scans commands/*.js, keeps only files whose author matches TRACKED_AUTHOR,
// and returns those where the store has a strictly newer version.
async function checkCommandUpdates() {
  if (!fs.existsSync(COMMANDS_DIR)) return [];
  const files = fs.readdirSync(COMMANDS_DIR).filter(f => f.endsWith(".js"));
  const results = [];

  for (const file of files) {
    const filePath = path.join(COMMANDS_DIR, file);
    let content;
    try { content = fs.readFileSync(filePath, "utf8"); } catch (_) { continue; }

    const meta = extractMeta(content);
    if (!meta.name || !meta.author) continue;
    if (!meta.author.toLowerCase().includes(TRACKED_AUTHOR)) continue;

    try {
      const res = await axios.get(`${API_BASE}/miraistore/search?q=${encodeURIComponent(meta.name)}`);
      const data = res.data;
      const cmds = Array.isArray(data?.commands) ? data.commands : (data?.rawCode ? [data] : []);
      const match = cmds.find(c =>
        c.name?.toLowerCase() === meta.name.toLowerCase() &&
        c.author?.toLowerCase().includes(TRACKED_AUTHOR)
      );
      if (!match) continue;

      if (cmpVer(match.version, meta.version) > 0) {
        results.push({
          file, name: meta.name, localVersion: meta.version,
          storeVersion: match.version, storeId: match.id
        });
      }
    } catch (_) { /* skip this file on API error */ }

    await new Promise(r => setTimeout(r, 300));
  }

  return results;
}

// --- Progress animation (single shared helper — was 3 near-identical copies) ---
const PROGRESS_FRAMES = ["◖", "◕", "◔", "◓", "◒", "◑", "◐"];
const buildBar = pct => "█".repeat(Math.floor(pct / 10)) + "░".repeat(10 - Math.floor(pct / 10));

async function animateProgress(api, threadID, title, steps) {
  const info = await api.sendMessage(`${title}\n\n◖ Preparing...\n[░░░░░░░░░░] 0%`, threadID);
  for (let i = 0; i < steps.length; i++) {
    await new Promise(r => setTimeout(r, steps[i].delay));
    await api.editMessage(
      `${title}\n\n${PROGRESS_FRAMES[i % PROGRESS_FRAMES.length]} ${steps[i].label}...\n[${buildBar(steps[i].pct)}] ${steps[i].pct}%`,
      info.messageID
    );
  }
  return info.messageID;
}

const installSteps = () => [
  { label: "Downloading source",  pct: 30,  delay: 600 },
  { label: "Verifying integrity", pct: 60,  delay: 900 },
  { label: "Writing to disk",     pct: 85,  delay: 700 },
  { label: "Registering command", pct: 100, delay: 600 }
];
const uploadSteps = () => [
  { label: "Reading file",            pct: 30,  delay: 500 },
  { label: "Uploading directly",      pct: 70,  delay: 900 },
  { label: "Finalizing registration", pct: 100, delay: 500 }
];
const selfUpdateSteps = () => [
  { label: "Fetching update source",     pct: 30,  delay: 600 },
  { label: "Verifying integrity",        pct: 60,  delay: 900 },
  { label: "Overwriting miraistore.js",  pct: 85,  delay: 700 },
  { label: "Reloading module",           pct: 100, delay: 600 }
];

function autoloadCommand(filePath) {
  try {
    delete require.cache[require.resolve(filePath)];
    const cmd = require(filePath);
    if (cmd?.config?.name) {
      const name = cmd.config.name.toLowerCase();
      global.client.commands.set(name, cmd);
      if (Array.isArray(cmd.config.aliases))
        cmd.config.aliases.forEach(a => global.client.commands.set(a.toLowerCase(), cmd));
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
    if (!isNaN(id) && data && !Array.isArray(data) && data.rawCode) cmdData = data;
    else if (Array.isArray(data?.commands)) cmdData = data.commands.find(c => String(c.id) === String(id));
    else if (Array.isArray(data)) cmdData = data.find(c => String(c.id) === String(id));
    if (!cmdData?.rawCode) return api.sendMessage("❌ Command not found or rawCode missing.", threadID);
  } catch (_) { return api.sendMessage("❌ Failed to fetch command info.", threadID); }

  try { new Function(cmdData.rawCode); }
  catch (err) { return api.sendMessage(`❌ Refused to install: remote code has a syntax error.\n${err.message}`, threadID); }

  const displayName = cmdData.name || `ms_${id}`;
  const isEvent = forceKind === "event" ? true : forceKind === "command" ? false : String(cmdData.type || "").endsWith("-event");

  let pid;
  try { pid = await animateProgress(api, threadID, `📦 Installing ${displayName}...`, installSteps()); } catch (_) {}

  const fileName = displayName.replace(/\s+/g, "_") + ".js";
  const installDir = isEvent ? EVENTS_DIR : COMMANDS_DIR;
  const filePath = path.join(installDir, fileName);
  const locationLabel = isEvent ? `events/${fileName}` : `commands/${fileName}`;

  try {
    if (!fs.existsSync(installDir)) fs.mkdirSync(installDir, { recursive: true });
    fs.writeFileSync(filePath, cmdData.rawCode, "utf-8");
  } catch (err) {
    if (pid) api.unsendMessage(pid);
    return api.sendMessage(`❌ Failed to write file:\n${err.message}`, threadID);
  }

  try { await axios.post(`${API_BASE}/miraistore/install/${cmdData.id}`); } catch (_) {}

  const loadResult = isEvent
    ? { success: false, reason: "Events are picked up on the next bot restart." }
    : autoloadCommand(filePath);

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
    (loadResult.success ? `🚀 Command "${loadResult.name}" is now live! No restart needed.`
      : isEvent ? `⚠️ Event saved to events/ folder. Restart bot to apply.`
      : `⚠️ File saved but autoload failed:\n${loadResult.reason}\nRestart the bot to apply.`);

  if (pid) {
    try { await api.editMessage(successMsg, pid); setTimeout(() => api.unsendMessage(pid).catch(() => {}), 5000); }
    catch (_) { api.sendMessage(successMsg, threadID); }
  } else api.sendMessage(successMsg, threadID);
}

// --- Silent install (no chat feedback) — used by autoupdate paths ---------
async function doInstallSilent(id, forceKind = null) {
  let cmdData = null;
  try {
    const res = await axios.get(`${API_BASE}/miraistore/search?q=${encodeURIComponent(id)}`);
    const data = res.data;
    if (!isNaN(id) && data?.rawCode && !Array.isArray(data)) cmdData = data;
    else if (Array.isArray(data?.commands)) cmdData = data.commands.find(c => String(c.id) === String(id));
    if (!cmdData?.rawCode) return false;
  } catch (_) { return false; }

  try { new Function(cmdData.rawCode); } catch (_) { return false; }

  const displayName = cmdData.name || `ms_${id}`;
  const isEvent = forceKind === "event" ? true : forceKind === "command" ? false : String(cmdData.type || "").endsWith("-event");
  const fileName = displayName.replace(/\s+/g, "_") + ".js";
  const installDir = isEvent ? EVENTS_DIR : COMMANDS_DIR;
  const filePath = path.join(installDir, fileName);

  try {
    if (!fs.existsSync(installDir)) fs.mkdirSync(installDir, { recursive: true });
    fs.writeFileSync(filePath, cmdData.rawCode, "utf-8");
  } catch (_) { return false; }

  try { await axios.post(`${API_BASE}/miraistore/install/${cmdData.id}`); } catch (_) {}

  if (!isEvent) autoloadCommand(filePath);
  return true;
}

async function doSelfUpdate(api, threadID, id) {
  let cmdData = null;
  try {
    const res = await axios.get(`${API_BASE}/miraistore/search?q=${encodeURIComponent(id)}`);
    const data = res.data;
    if (!isNaN(id) && data?.rawCode && !Array.isArray(data)) cmdData = data;
    else if (Array.isArray(data?.commands)) cmdData = data.commands.find(c => String(c.id) === String(id));
    if (!cmdData?.rawCode) return api.sendMessage("❌ Update source not found or rawCode missing.", threadID);
  } catch (_) { return api.sendMessage("❌ Failed to fetch update info.", threadID); }

  try { new Function(cmdData.rawCode); }
  catch (err) { return api.sendMessage(`❌ Syntax error in remote self-update code.\n${err.message}`, threadID); }

  const newVersion = cmdData.version || "N/A";
  let pid;
  try { pid = await animateProgress(api, threadID, `♻️ Self-Updating to v${newVersion}...`, selfUpdateSteps()); } catch (_) {}

  try {
    fs.writeFileSync(__filename, cmdData.rawCode, "utf-8");
  } catch (err) {
    if (pid) api.unsendMessage(pid);
    return api.sendMessage(`❌ Self-update file write failed:\n${err.message}`, threadID);
  }

  try { await axios.post(`${API_BASE}/miraistore/install/${cmdData.id}`); } catch (_) {}

  const changelog = (cmdData.description || cmdData.changelog || "No changelog provided.").trim();
  const loadResult = autoloadCommand(__filename);

  const msg =
    `✅ MiraiStore Self-Updated!\n` +
    `╭─‣ Version : v${newVersion}\n` +
    `├‣ ID : ${cmdData.id}\n` +
    `╰────────────◊\n` +
    `📝 Changelog:\n${changelog}\n\n` +
    (loadResult.success ? `🚀 Live now! No restart needed.` : `⚠️ Reload failed (${loadResult.reason}) — restart bot to apply.`);

  if (pid) { try { await api.editMessage(msg, pid); } catch (_) { api.sendMessage(msg, threadID); } }
  else api.sendMessage(msg, threadID);
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

  try { new Function(cmdData.rawCode); } catch (_) { return false; }

  try { fs.writeFileSync(__filename, cmdData.rawCode, "utf-8"); } catch (_) { return false; }

  try { await axios.post(`${API_BASE}/miraistore/install/${cmdData.id}`); } catch (_) {}

  const changelog = (cmdData.description || cmdData.changelog || "No changelog provided.").trim();
  const loadResult = autoloadCommand(__filename);

  if (api && threadID) {
    const msg =
      `♻️ Auto-Updated MiraiStore!\n` +
      `╭─‣ Version : v${cmdData.version || selfUpdate.latestVersion}\n` +
      `├‣ ID : ${cmdData.id}\n` +
      `╰────────────◊\n` +
      `📝 Changelog:\n${changelog}\n\n` +
      (loadResult.success ? `🚀 Live now! No restart needed.` : `⚠️ Reload failed (${loadResult.reason}) — restart bot to apply.`);
    api.sendMessage(msg, threadID).catch(() => {});
  }
  return true;
}

async function maybeAutoUpdate(api, threadID) {
  if (!_autoupdateState.enabled || _autoupdateInFlight) return;
  const selfUpdate = await checkSelfUpdate();
  if (!selfUpdate?.hasUpdate) return;
  _autoupdateInFlight = true;
  try { await doSelfUpdateSilent(api, threadID, selfUpdate); }
  finally { _autoupdateInFlight = false; }
}

// Silently installs every detected command update, no chat feedback.
async function maybeAutoUpdateCommands(api, threadID) {
  if (!_autoupdateState.enabled || _cmdAutoupdateInFlight) return;
  _cmdAutoupdateInFlight = true;
  try {
    const updates = await checkCommandUpdates();
    for (const u of updates) await doInstallSilent(u.storeId, "command");
  } finally {
    _cmdAutoupdateInFlight = false;
  }
}

// --- Upload (direct rawCode — no pastebin proxy) ---------------------------
// Restored GoatStore's special-case handling for "Already exists" / "Not
// allowed" so those get a distinct, clearer message instead of falling into
// the generic error branch.
async function uploadFile(api, threadID, filePath, kind) {
  let data;
  try { data = fs.readFileSync(filePath, "utf8"); }
  catch (err) { return api.sendMessage(`❌ Read failed:\n${err.message}`, threadID); }

  try { new Function(data); }
  catch (err) { return api.sendMessage(`❌ Syntax Error:\n${err.message}`, threadID); }

  const meta = extractMeta(data);
  const displayName = meta.name || path.basename(filePath);

  if (detectFrameworkLocal(data) !== "mirai")
    return api.sendMessage(`❌ Only Mirai files can be uploaded here.`, threadID);

  const framework = "mirai";

  let pid;
  try { pid = await animateProgress(api, threadID, `📤 Uploading ${displayName}...`, uploadSteps()); } catch (_) {}

  try {
    const res = await axios.post(`${API_BASE}/miraistore/upload`, {
      rawCode: data, framework, kind, author: meta.author || "Unknown", category: meta.category
    });

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
        `💡 ${res.data.message || "MiraiStore API register korte parenai."}`,
        threadID
      );
    }

    let header = "✅ Upload Successful!";
    let note = "";
    if (res.data.olderVersion) { header = "⚠️ Older Version — Stored As New Entry!"; note = `💡 ${res.data.message}\n`; }
    else if (res.data.updated) { header = "🔄 Updated Existing Entry (Overwritten)!"; note = `💡 ${res.data.message}\n`; }

    const msg =
      `${header}\n` +
      `╭─‣ Name : ${displayName}\n` +
      `├‣ Type : ${res.data.type || `${framework}-${kind}`}\n` +
      `├‣ Version : ${meta.version}\n` +
      `├‣ Author : ${meta.author || "Unknown"}\n` +
      `├‣ Category : ${meta.category}\n` +
      `├‣ ID : ${res.data.id}\n` +
      `╰────────────◊\n` +
      note +
      `⭔ Upload : ${new Date().toDateString()}`;

    if (pid) { try { await api.editMessage(msg, pid); } catch (_) { api.sendMessage(msg, threadID); } }
    else api.sendMessage(msg, threadID);
  } catch (err) {
    if (pid) api.unsendMessage(pid);
    api.sendMessage(
      `⚠️ Store API Call Fail Korlo!\n` +
      `├‣ Error : ${err.response?.data?.error || err.message}\n` +
      `╰────────────◊\n` +
      `💡 Request fail hoyeche, MiraiStore backend / network check koro.`,
      threadID
    );
  }
}

async function runAutoSync({ silent = true, notifyApi = null, notifyThreadID = null } = {}) {
  const folders = [
    { dir: COMMANDS_DIR, kind: "command" },
    { dir: EVENTS_DIR, kind: "event" }
  ].filter(f => fs.existsSync(f.dir));

  if (!folders.length) return { uploaded: [], skipped: [], failed: [], error: "no commands/events folder found" };

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

      try { new Function(content); }
      catch (err) { result.failed.push({ file: cacheKey, reason: `Syntax error: ${err.message}` }); continue; }

      if (detectFrameworkLocal(content) !== "mirai") {
        result.skipped.push(cacheKey);
        continue;
      }
      const framework = "mirai";
      const meta = extractMeta(content);

      try {
        const res = await axios.post(`${API_BASE}/miraistore/upload`, {
          rawCode: content, framework, kind, author: meta.author || "Unknown", category: meta.category
        });
        if (res.data?.error) result.failed.push({ file: cacheKey, reason: res.data.error });
        else { cache[cacheKey] = hash; result.uploaded.push({ file: cacheKey, id: res.data.id, name: res.data.name, type: res.data.type }); }
      } catch (err) {
        result.failed.push({ file: cacheKey, reason: err.response?.data?.error || err.message });
      }

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

// --- Unified paginated list / search ---------------------------------------
async function renderListPageInto(isEvent, page, limit) {
  const offset = (page - 1) * limit;
  const type = isEvent ? "mirai-event" : "mirai-command";
  const res = await axios.get(`${API_BASE}/miraistore/list?limit=${limit}&offset=${offset}&type=${type}`);
  const data = res.data;
  if (!Array.isArray(data.commands) || !data.commands.length) return null;

  const totalPages = Math.ceil(data.total / limit);
  const label = isEvent ? "Mirai Events" : "Mirai Commands";
  let msg = `📂 ${label} — Page ${page}/${totalPages} (${data.total} total)\n\n`;
  data.commands.forEach(cmd => {
    msg += `╭─‣ ${cmd.name} 〄\n`;
    msg += `├‣ ID : ${cmd.id}\n`;
    msg += `├‣ Author : ${cmd.author}\n`;
    msg += `├‣ Category : ${cmd.category}\n`;
    msg += `╰────────────◊\n`;
    msg += ` ✰ Upload : ${new Date(cmd.uploadDate || Date.now()).toDateString()}\n\n`;
  });
  if (totalPages > 1) msg += `Reply "page <number>" or react ➡️ to go next page.`;
  return { text: msg.trim(), totalPages };
}

async function sendListPage(api, threadID, senderID, isEvent, page, limit = 20) {
  let rendered;
  try { rendered = await renderListPageInto(isEvent, page, limit); }
  catch (_) { return api.sendMessage("❌ List API error.", threadID); }
  if (!rendered) return api.sendMessage("❌ No results found for this page.", threadID);

  const sent = await api.sendMessage(rendered.text, threadID);
  if (rendered.totalPages > 1) {
    const h = { messageID: sent.messageID, mode: "list", isEvent, page, totalPages: rendered.totalPages, limit, senderID };
    global.client.handleReply.push(h);
    global.client.handleReaction.push(h);
  }
}

async function renderSearchPageInto(query, page, limit) {
  const offset = (page - 1) * limit;
  const res = await axios.get(`${API_BASE}/miraistore/search?q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}`);
  const data = res.data;
  if (!data || !Array.isArray(data.commands) || !data.commands.length) return null;

  const total = data.total;
  const totalPages = Math.ceil(total / limit);
  let msg = `📂 Search Results (${total})\n\n`;
  data.commands.forEach(cmd => {
    msg += `╭─‣ ${cmd.name} 〄\n`;
    msg += `├‣ ID : ${cmd.id}\n`;
    msg += `├‣ Type : ${cmd.type || "N/A"}\n`;
    msg += `├‣ Author : ${cmd.author}\n`;
    msg += `├‣ Category : ${cmd.category}\n`;
    msg += `╰────────────◊\n`;
    msg += ` ✰ Upload : ${new Date(cmd.uploadDate || Date.now()).toDateString()}\n\n`;
  });
  if (totalPages > 1) msg += `Page ${page}/${totalPages}\nReply "page <number>" or react ➡️ to go next page.`;
  return { text: msg.trim(), totalPages };
}

async function sendSearchPage(api, threadID, senderID, query, page, limit = 5) {
  let rendered;
  try { rendered = await renderSearchPageInto(query, page, limit); }
  catch (_) { return api.sendMessage("❌ Search API error.", threadID); }
  if (!rendered) return api.sendMessage(`❌ No results found for "${query}".`, threadID);

  const sent = await api.sendMessage(rendered.text, threadID);
  if (rendered.totalPages > 1) {
    const h = { messageID: sent.messageID, mode: "search", query, page, totalPages: rendered.totalPages, limit, senderID };
    global.client.handleReply.push(h);
    global.client.handleReaction.push(h);
  }
}

module.exports.config = {
  name: "miraistore",
  aliases: ["ms", "shop"],
  premium: true,
  version: "4.0.0",
  hasPermssion: 0,
  credits: "rX",
  description: "Mirai Command Store — Search, AutoUpdate, Install, Upload, AutoSync, Command-Update Check",
  commandCategory: "system",
  usages:
    "!ms <id | name | category | author>\n" +
    "!ms n\n" +
    "!ms list [page]\n" +
    "!ms list event [page]\n" +
    "!ms install <id>\n" +
    "!ms event install <id>\n" +
    "!ms event <filename>\n" +
    "!ms like <id>\n" +
    "!ms trending\n" +
    "!ms upload <commandName>\n" +
    "!ms upload event <eventName>\n" +
    "!ms sync\n" +
    "!ms cmdupdate\n" +
    "!ms autoupdate on/off\n" +
    "!ms delete <id> <secret>",
  cooldowns: 3,
  autoSync: true
};

module.exports.onLoad = function () {
  const ONE_DAY = 1000 * 60 * 60 * 24;
  const SIX_HOURS = 1000 * 60 * 60 * 6;

  if (module.exports.config.autoSync) {
    setTimeout(() => {
      runAutoSync({ silent: true }).catch(() => {});
      setInterval(() => { runAutoSync({ silent: true }).catch(() => {}); }, ONE_DAY);
    }, 5000);
  }

  // Periodic silent self-update + command-update check (only acts while autoupdate is ON)
  setTimeout(() => {
    maybeAutoUpdate(null, null).catch(() => {});
    maybeAutoUpdateCommands(null, null).catch(() => {});
    setInterval(() => {
      maybeAutoUpdate(null, null).catch(() => {});
      maybeAutoUpdateCommands(null, null).catch(() => {});
    }, SIX_HOURS);
  }, 8000);
};

module.exports.handleReaction = async function ({ api, event, handleReaction }) {
  const { threadID, userID } = event;
  if (userID === api.getCurrentUserID()) return;

  if (handleReaction.mode === "selfupdate") {
    if (userID !== handleReaction.senderID) return;
    return doSelfUpdate(api, threadID, handleReaction.latestId);
  }

  if (event.reaction !== "➡️") return;
  const { mode, query, isEvent, page, totalPages, limit, senderID, messageID } = handleReaction;
  if (userID !== senderID) return;
  if (page >= totalPages) return api.sendMessage("✅ Already on the last page.", threadID);

  const nextPage = page + 1;
  try {
    const rendered = mode === "list"
      ? await renderListPageInto(isEvent, nextPage, limit)
      : await renderSearchPageInto(query, nextPage, limit);
    if (!rendered) return api.sendMessage("❌ No results found for this page.", threadID);

    api.unsendMessage(messageID);
    const sent = await api.sendMessage(rendered.text, threadID);
    if (rendered.totalPages > nextPage) {
      const h = { messageID: sent.messageID, mode, query, isEvent, page: nextPage, totalPages: rendered.totalPages, limit, senderID };
      global.client.handleReply.push(h);
      global.client.handleReaction.push(h);
    }
  } catch (_) {
    api.sendMessage("❌ Failed to load next page.", threadID);
  }
};

module.exports.handleReply = async function ({ api, event, handleReply }) {
  const { threadID, body, senderID } = event;

  if (handleReply.mode === "cmdupdate") {
    if (senderID !== handleReply.senderID) return;
    const num = parseInt(body.trim(), 10);
    if (isNaN(num) || num < 1 || num > handleReply.updates.length) return;
    const chosen = handleReply.updates[num - 1];
    return doInstall(api, threadID, chosen.storeId, "command");
  }

  const { mode, query, isEvent, totalPages, limit, senderID: origSender } = handleReply;
  if (senderID !== origSender) return;
  const match = body.match(/^page (\d+)$/i);
  if (!match) return;
  const newPage = parseInt(match[1]);
  if (newPage < 1 || newPage > totalPages) return api.sendMessage(`❌ Page must be between 1 and ${totalPages}.`, threadID);
  api.unsendMessage(handleReply.messageID);
  if (mode === "list") await sendListPage(api, threadID, senderID, isEvent, newPage, limit);
  else await sendSearchPage(api, threadID, senderID, query, newPage, limit);
};

module.exports.run = async function ({ api, event, args }) {
  const { threadID, senderID } = event;
  const sub = args[0] ? args[0].toLowerCase() : null;
  const prefix = getPrefix();

  await Promise.all([
    maybeAutoUpdate(api, threadID),
    maybeAutoUpdateCommands(api, threadID)
  ]);

  if (sub === "autoupdate") {
    const mode = args[1]?.toLowerCase();
    if (mode !== "on" && mode !== "off")
      return api.sendMessage(
        `⚙️ Autoupdate Status: ${_autoupdateState.enabled ? "✅ ON" : "❌ OFF"}\n\n` +
        `Usage:\n• ${prefix}ms autoupdate on\n• ${prefix}ms autoupdate off\n\n` +
        `💡 ON thakle notun version paile (self + rX commands) confirm chara e silently update hoye jabe.`,
        threadID
      );
    _autoupdateState = { enabled: mode === "on" };
    saveAutoupdateState(_autoupdateState);
    return api.sendMessage(
      mode === "on"
        ? `✅ Autoupdate ON kora holo.\n💡 Ekhon theke notun version paile (miraistore self-update shoho tomar rX command gulao) confirm chara e silently update hoye jabe.`
        : `❌ Autoupdate OFF kora holo.\n💡 Notun version paile manual install lagbe (react/reply-confirm shoho).`,
      threadID
    );
  }

  if (sub === "cmdupdate" || sub === "cu") {
    await api.sendMessage("🔍 Checking your rX commands against the store...", threadID);
    const updates = await checkCommandUpdates();
    if (!updates.length) return api.sendMessage("✅ All your rX commands are up to date.", threadID);

    let msg = `🆕 [ COMMAND UPDATES AVAILABLE ]\n━━━━━━━━━━━━━━━━━━\n`;
    updates.forEach((u, i) => {
      msg +=
        `${i + 1}/${updates.length} ) ${u.name}\n` +
        `├‣ Current : v${u.localVersion}\n` +
        `├‣ New     : v${u.storeVersion}\n` +
        `├‣ ID      : ${u.storeId}\n` +
        `╰────────────◊\n`;
    });
    msg += `\n💬 Reply with the number (e.g. "2") to install that update.`;

    const sent = await api.sendMessage(msg.trim(), threadID);
    global.client.handleReply.push({ messageID: sent.messageID, mode: "cmdupdate", updates, senderID });
    return;
  }

  if (sub === "n" || sub === "notification") {
    const [updates, selfUpdate] = await Promise.all([getTodayUpdates(), checkSelfUpdate()]);
    let msg = "";
    if (selfUpdate?.hasUpdate && !_autoupdateState.enabled) {
      msg +=
        `🆙 [ MIRAISTORE SELF UPDATE ]\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `Current : v${selfUpdate.currentVersion}\n` +
        `Latest  : v${selfUpdate.latestVersion}\n` +
        `ID      : ${selfUpdate.latestId}\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `👍 React to self-update instantly!\n\n`;
    }
    if (!updates.length && !(selfUpdate?.hasUpdate && !_autoupdateState.enabled))
      return api.sendMessage("📅 No updates today.", threadID);
    if (updates.length) {
      msg += `📂 Today's Store Updates\n━━━━━━━━━━━━━━━━━━\n`;
      updates.forEach(cmd =>
        msg += `╭─‣ ${cmd.name}\n├‣ ID: ${cmd.id}\n├‣ Type: ${cmd.type || "N/A"}\n├‣ Author: ${cmd.author}\n╰────────────◊\n\n`
      );
    }
    const sent = await api.sendMessage(msg.trim(), threadID);
    if (selfUpdate?.hasUpdate && !_autoupdateState.enabled) {
      global.client.handleReaction.push({ messageID: sent.messageID, mode: "selfupdate", latestId: selfUpdate.latestId, senderID });
    }
    return;
  }

  if (!sub) {
    const [updates, selfUpdate] = await Promise.all([getTodayUpdates(), checkSelfUpdate()]);

    if (selfUpdate?.hasUpdate && !_autoupdateState.enabled && !userSeenNoti.get(`update_${selfUpdate.latestVersion}_${senderID}`)) {
      userSeenNoti.set(`update_${selfUpdate.latestVersion}_${senderID}`, true);
      const sent = await api.sendMessage(
        `🆙 [ MIRAISTORE UPDATE AVAILABLE ]\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `Current version : v${selfUpdate.currentVersion}\n` +
        `New version     : v${selfUpdate.latestVersion}\n` +
        `Store ID        : ${selfUpdate.latestId}\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `👍 React to this message to self-update instantly!\n` +
        `(Or type "${prefix}ms" again to see the menu)\n\n` +
        `💡 Tip: "${prefix}ms autoupdate on" korle eibar theke ei prompt lagbe na.`,
        threadID
      );
      global.client.handleReaction.push({ messageID: sent.messageID, mode: "selfupdate", latestId: selfUpdate.latestId, senderID });
      return;
    }

    if (updates.length > 0 && !userSeenNoti.get(senderID)) {
      let n = `🔔 [ NOTIFICATION ]\nToday ${updates.length} update(s)!\n━━━━━━━━━━━━━━━━━━\n`;
      updates.forEach(f => n += ` ‣ ${f.name} (ID: ${f.id})\n`);
      n += `\n(Type "${prefix}ms n" for details or "${prefix}ms" again for menu)`;
      userSeenNoti.set(senderID, true);
      return api.sendMessage(n, threadID);
    }

    return api.sendMessage(
      `📦 Mirai Store\n\nUsage:\n` +
      `• ${prefix}ms <id | name | category | author>\n` +
      `• ${prefix}ms n\n` +
      `• ${prefix}ms list [page]\n` +
      `• ${prefix}ms list event [page]\n` +
      `• ${prefix}ms install <id>\n` +
      `• ${prefix}ms event install <id>\n` +
      `• ${prefix}ms event <filename>\n` +
      `• ${prefix}ms like <id>\n` +
      `• ${prefix}ms trending\n` +
      `• ${prefix}ms upload <commandName>\n` +
      `• ${prefix}ms upload event <eventName>\n` +
      `• ${prefix}ms sync\n` +
      `• ${prefix}ms cmdupdate\n` +
      `• ${prefix}ms autoupdate on/off\n` +
      `• ${prefix}ms delete <id> <secret>`,
      threadID
    );
  }

  if (sub === "event") {
    const action = args[1] ? args[1].toLowerCase() : null;

    if (action === "install") {
      const id = args[2];
      if (!id) return api.sendMessage(`❌ Usage: ${prefix}ms event install <id>`, threadID);
      return doInstall(api, threadID, id, "event");
    }

    if (action) {
      const tryNames = [action, action + ".js"];
      let found = null;
      for (const n of tryNames) {
        const p = path.join(EVENTS_DIR, n);
        if (fs.existsSync(p)) { found = p; break; }
      }

      if (found) {
        let code = "";
        try { code = fs.readFileSync(found, "utf8"); } catch (_) {}
        const meta = extractMeta(code);
        const desc = code.match(/description\s*:\s*["'`](.*?)["'`]/)?.[1] || "No description";
        return api.sendMessage(
          `📁 Local Event File Info\n` +
          `╭─‣ Name : ${meta.name || action}\n` +
          `├‣ Type : mirai-event\n` +
          `├‣ Author : ${meta.author || "Unknown"}\n` +
          `├‣ Version : ${meta.version}\n` +
          `├‣ Category : ${meta.category}\n` +
          `├‣ Location : events/${path.basename(found)}\n` +
          `╰────────────◊\n` +
          `⭔ Description: ${desc}`,
          threadID
        );
      }

      try {
        const res = await axios.get(`${API_BASE}/miraistore/search?q=${encodeURIComponent(action)}&limit=5`);
        const data = res.data;
        const allCmds = Array.isArray(data.commands) ? data.commands : (data && !data.message ? [data] : []);
        const events = allCmds.filter(c => String(c.type || "").endsWith("-event"));
        if (!events.length) return api.sendMessage(`❌ No event found locally or in store: "${action}"`, threadID);
        let msg = `📂 Store Events matching "${action}"\n\n`;
        events.forEach(cmd => {
          msg += `╭─‣ Name : ${cmd.name}\n├‣ Type : ${cmd.type}\n├‣ Author : ${cmd.author}\n├‣ Version : ${cmd.version || "N/A"}\n├‣ Category : ${cmd.category}\n├‣ ID : ${cmd.id}\n╰────────────◊\n\n`;
        });
        msg += `💡 Use: ${prefix}ms event install <id>  to install`;
        return api.sendMessage(msg.trim(), threadID);
      } catch (_) { return api.sendMessage("❌ Event search API error.", threadID); }
    }

    return sendListPage(api, threadID, senderID, true, 1, 20);
  }

  if (sub === "sync") {
    await api.sendMessage("🔄 Syncing all commands to MiraiStore... background e cholbe.", threadID);
    runAutoSync({ silent: false, notifyApi: api, notifyThreadID: threadID }).catch(err => {
      api.sendMessage(`❌ Sync crashed: ${err.message}`, threadID);
    });
    return;
  }

  if (sub === "upload") {
    let cmdName, forceKind;
    if (args[1]?.toLowerCase() === "event") { cmdName = args[2]; forceKind = "event"; }
    else { cmdName = args[1]; forceKind = null; }

    if (!cmdName)
      return api.sendMessage(`📁 Usage:\n• ${prefix}ms upload <commandName>\n• ${prefix}ms upload event <eventName>`, threadID);

    const candidates = forceKind === "event"
      ? [{ dir: EVENTS_DIR, kind: "event" }]
      : [{ dir: COMMANDS_DIR, kind: "command" }, { dir: EVENTS_DIR, kind: "event" }];

    let filePath = null, kind = null;
    for (const { dir, kind: k } of candidates) {
      if (fs.existsSync(path.join(dir, cmdName))) { filePath = path.join(dir, cmdName); kind = k; break; }
      if (fs.existsSync(path.join(dir, cmdName + ".js"))) { filePath = path.join(dir, cmdName + ".js"); kind = k; break; }
    }

    if (!filePath) {
      const searched = forceKind === "event" ? "`events` folder" : "`commands` or `events` folder";
      return api.sendMessage(`❌ File not found in ${searched}.`, threadID);
    }

    return uploadFile(api, threadID, filePath, kind);
  }

  if (sub === "delete") {
    const id = args[1], secret = args[2];
    if (!id || !secret) return api.sendMessage(`❌ Usage: ${prefix}ms delete <id> <secret>`, threadID);
    try {
      const res = await axios.post(`${API_BASE}/miraistore/delete/${id}`, { secret });
      if (res.data?.error) return api.sendMessage(`❌ ${res.data.error}`, threadID);
      return api.sendMessage(`🗑️ Deleted!\n🆔 ID: ${id}`, threadID);
    } catch (_) { return api.sendMessage("❌ Delete API error.", threadID); }
  }

  if (sub === "like") {
    const id = args[1];
    if (!id) return api.sendMessage(`❌ Usage: ${prefix}ms like <id>`, threadID);
    try {
      const res = await axios.post(`${API_BASE}/miraistore/like/${id}`, { userID: senderID });
      if (res.data?.message) return api.sendMessage("⚠️ Already liked.", threadID);
      return api.sendMessage(`❤️ Liked!\nTotal Likes: ${res.data.likes}`, threadID);
    } catch (_) { return api.sendMessage("❌ Like API error.", threadID); }
  }

  if (sub === "install") {
    const id = args[1];
    if (!id) return api.sendMessage(`❌ Usage: ${prefix}ms install <id>`, threadID);
    return doInstall(api, threadID, id, null);
  }

  if (sub === "trend" || sub === "trending") {
    try {
      const res = await axios.get(`${API_BASE}/miraistore/trending?limit=5`);
      if (!res.data.length) return api.sendMessage("❌ No trending commands.", threadID);
      let msg = "🔥 Top Trending Mirai Commands 🔥\n\n";
      res.data.forEach((cmd, i) =>
        msg += `╭─‣ ${cmd.name}${i === 0 ? " 🏆" : ""}\n├‣ Type : ${cmd.type || "N/A"}\n├‣ Likes : ❤️ ${cmd.likes}\n├‣ Views : 👁️ ${cmd.views}\n├‣ ID : ${cmd.id}\n╰────────────◊\n\n`
      );
      return api.sendMessage(msg.trim(), threadID);
    } catch (_) { return api.sendMessage("❌ Trending API error.", threadID); }
  }

  if (sub === "list" || sub === "ls") {
    const isEvent = args[1]?.toLowerCase() === "event";
    const page = Math.max(1, Number(isEvent ? args[2] : args[1]) || 1);
    return sendListPage(api, threadID, senderID, isEvent, page, 20);
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
    }

    await sendSearchPage(api, threadID, senderID, query, 1, 5);
  } catch (_) { return api.sendMessage("❌ Search API error.", threadID); }
};
