/**
 * !appstate             — refresh current active slot's cookies
 *                         (same system as !account refresh)
 * Auto-refreshes every 6 hours for active slot.
 */

const fs      = require("fs-extra");
const path    = require("path");
const moment  = require("moment-timezone");

const ROOT        = path.resolve(__dirname, "../../");
const CONFIG_FILE = path.join(ROOT, "config.json");

// Cookie keys considered session/extension tokens — shown prominently
const EXT_KEYS = ["xs", "ls", "c_user", "datr", "fr", "sb", "i_user", "x-referer"];

// ─── helpers ──────────────────────────────────────────────────────────────────

function getActiveSlot() {
    try {
        const cfg = fs.readJsonSync(CONFIG_FILE);
        const ap  = cfg.APPSTATEPATH || "appstate.json";
        if (ap === "appstate.json") return "1";
        const m = ap.match(/appstate(\d+)\.json/);
        return m ? m[1] : "1";
    } catch { return "1"; }
}

function slotFile(num) {
    return num === "1" ? "appstate.json" : `appstate${num}.json`;
}

function fmt(arr) {
    return arr.length ? arr.join(", ") : "—";
}

// ─── core refresh (shared by manual command + auto interval) ──────────────────

async function refreshCookies(api, notifyThreadID = null, notifyMsgID = null) {
    const slot     = getActiveSlot();
    const file     = slotFile(slot);
    const filePath = path.join(ROOT, file);

    // Snapshot old cookies
    let oldArr = [];
    try { oldArr = fs.readJsonSync(filePath); } catch {}
    if (!Array.isArray(oldArr)) oldArr = [];

    const oldMap = {};
    for (const c of oldArr) oldMap[c.key] = c.value;

    // Get & save fresh cookies
    const freshArr = Array.isArray(api.getAppState()) ? api.getAppState() : [];
    await fs.writeJson(filePath, freshArr, { spaces: "\t" });

    const newMap = {};
    for (const c of freshArr) newMap[c.key] = c.value;

    // Diff
    const oldKeys    = new Set(Object.keys(oldMap));
    const newKeys    = new Set(Object.keys(newMap));
    const added      = [...newKeys].filter(k => !oldKeys.has(k));
    const removed    = [...oldKeys].filter(k => !newKeys.has(k));
    const changed    = [...newKeys].filter(k => oldKeys.has(k) && oldMap[k] !== newMap[k]);

    const extChanged   = changed.filter(k => EXT_KEYS.includes(k));
    const extAdded     = added.filter(k => EXT_KEYS.includes(k));
    const otherChanged = changed.filter(k => !EXT_KEYS.includes(k));
    const otherAdded   = added.filter(k => !EXT_KEYS.includes(k));

    const time = moment().tz("Asia/Dhaka").format("HH:mm:ss DD/MM/YYYY");

    const lines = [
        `✅ Cookie refresh সম্পন্ন!`,
        `📁 Account ${slot} → ${file}`,
        `⏰ Time: ${time}`,
        `📦 Total cookies: ${freshArr.length}`,
        `──────────────────────────`,
    ];

    if (extChanged.length || extAdded.length) {
        lines.push(`🔄 Extension/Session keys updated:`);
        if (extChanged.length) lines.push(`   changed : ${fmt(extChanged)}`);
        if (extAdded.length)   lines.push(`   added   : ${fmt(extAdded)}`);
    }

    if (otherChanged.length) {
        lines.push(`🔑 Other keys changed (${otherChanged.length}):`);
        lines.push(`   ${fmt(otherChanged)}`);
    }

    if (otherAdded.length) {
        lines.push(`➕ New keys: ${fmt(otherAdded)}`);
    }

    if (removed.length) {
        lines.push(`➖ Removed: ${fmt(removed)}`);
    }

    if (!changed.length && !added.length && !removed.length) {
        lines.push(`ℹ️ কোনো পরিবর্তন নেই — cookies already fresh.`);
    }

    const msg = lines.join("\n");

    if (notifyThreadID) {
        api.sendMessage(msg, notifyThreadID, notifyMsgID || undefined);
    }

    console.log(`[APPSTATE] Slot ${slot} refreshed (${time})`);
    return msg;
}

// ─── auto-refresh every 6 hours ───────────────────────────────────────────────

setInterval(async () => {
    if (!global.client || !global.client.api) return;
    try {
        await refreshCookies(global.client.api);
    } catch (e) {
        console.error("[APPSTATE AUTO] Error:", e.message);
    }
}, 6 * 60 * 60 * 1000);

// ─── command ──────────────────────────────────────────────────────────────────

module.exports.config = {
    name: "appstate",
    version: "2.0.0",
    hasPermssion: 2,
    credits: "rX",
    description: "Refresh active slot's appstate/cookies (same as !account refresh)",
    commandCategory: "Admin",
    usages: "appstate",
    cooldowns: 5,
    dependencies: {
        "fs-extra": "",
        "moment-timezone": ""
    }
};

module.exports.run = async function ({ api, event }) {
    try {
        await refreshCookies(api, event.threadID, event.messageID);
    } catch (e) {
        api.sendMessage(`❌ Refresh fail: ${e.message}`, event.threadID, event.messageID);
    }
};
