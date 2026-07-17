/**
 * !account              — show account 1 & 2 info (UID + masked creds)
 * !account switch <N>   — switch to account N (restarts bot)
 * !account refresh      — save fresh cookies + show which extensions changed
 */

const fs   = require("fs-extra");
const path = require("path");

const ROOT         = path.resolve(__dirname, "../../");
const CONFIG_FILE  = path.join(ROOT, "config.json");
// accounts.json stores credentials for each slot:
// { "1": { "email": "...", "password": "..." }, "2": { ... } }
const ACCOUNTS_FILE = path.join(ROOT, "accounts.json");

// Cookie keys considered "extensions" / session tokens (show these prominently)
const EXT_KEYS = ["xs", "ls", "c_user", "datr", "fr", "sb", "i_user", "x-referer"];

// ─── helpers ──────────────────────────────────────────────────────────────────

function getConfig() {
    try { return fs.readJsonSync(CONFIG_FILE); } catch { return {}; }
}

function saveConfig(cfg) {
    fs.writeJsonSync(CONFIG_FILE, cfg, { spaces: 4 });
}

function getActiveSlot() {
    const cfg = getConfig();
    const ap  = cfg.APPSTATEPATH || "appstate.json";
    if (ap === "appstate.json") return "1";
    const m = ap.match(/appstate(\d+)\.json/);
    return m ? m[1] : "1";
}

function slotFile(num) {
    return num === "1" ? "appstate.json" : `appstate${num}.json`;
}

function getAccounts() {
    // Merge accounts.json (primary) with legacy acc.json for slot 1
    let data = {};
    if (fs.existsSync(ACCOUNTS_FILE)) {
        try { data = fs.readJsonSync(ACCOUNTS_FILE); } catch {}
    }
    // Fallback: read legacy acc.json into slot 1 if not already set
    if (!data["1"]) {
        try {
            const legacy = fs.readJsonSync(path.join(ROOT, "acc.json"));
            data["1"] = { email: legacy.EMAIL || "", password: legacy.PASSWORD || "" };
        } catch {}
    }
    return data;
}

function mask(str) {
    if (!str) return "❌ not set";
    if (str.length <= 4) return "★".repeat(str.length);
    const show = Math.ceil(str.length / 4);
    return str.slice(0, show) + "★".repeat(str.length - show);
}

function getUIDFromAppstate(file) {
    try {
        const arr = fs.readJsonSync(path.join(ROOT, file));
        const entry = (Array.isArray(arr) ? arr : []).find(
            c => c.key === "c_user" || c.key === "i_user"
        );
        return entry ? entry.value : "❌ unknown";
    } catch { return "❌ file missing"; }
}

// ─── command ──────────────────────────────────────────────────────────────────

module.exports.config = {
    name: "account",
    version: "2.0.0",
    hasPermssion: 2,
    credits: "rX",
    description: "Multi-account manager — info, switch, refresh",
    commandCategory: "Admin",
    usages: "account / account switch 2 / account refresh",
    cooldowns: 5
};

module.exports.run = async function ({ api, event, args }) {
    const sub = (args[0] || "").toLowerCase();

    // ── !account ──────────────────────────────────────────────────────────────
    if (!sub) {
        const accounts = getAccounts();
        const active   = getActiveSlot();
        const lines    = [
            "╔════════════════════════════╗",
            "       📋  Account Info",
            "╚════════════════════════════╝"
        ];

        // Show slots 1 & 2 (and any others that exist)
        const slots = ["1", "2"];
        for (const num of slots) {
            const file  = slotFile(num);
            const uid   = getUIDFromAppstate(file);
            const creds = accounts[num] || {};
            const email = mask(creds.email || "");
            const pass  = mask(creds.password || "");
            const tag   = active === num ? " ◀ active" : "";

            lines.push(
                `\n🔷 Account ${num}${tag}`,
                `   🆔 UID      : ${uid}`,
                `   📧 Email    : ${email}`,
                `   🔑 Password : ${pass}`
            );
        }

        lines.push(
            "\n──────────────────────────────",
            "💡 Commands:",
            "  !account switch 2  → switch to acc 2",
            "  !account switch 1  → switch back to acc 1",
            "  !account refresh   → update cookies"
        );

        return api.sendMessage(lines.join("\n"), event.threadID, event.messageID);
    }

    // ── !account switch <N> ───────────────────────────────────────────────────
    if (sub === "switch") {
        const num = String(args[1] || "").trim();
        if (!num || isNaN(num)) {
            return api.sendMessage(
                "⚠️ Account number dao:\n  !account switch 2",
                event.threadID, event.messageID
            );
        }

        const file     = slotFile(num);
        const filePath = path.join(ROOT, file);

        if (!fs.existsSync(filePath)) {
            return api.sendMessage(
                `❌ Account ${num} এর appstate (${file}) নেই!\n` +
                `আগে ওই account এর appstate${num}.json রুট folder এ রাখো।`,
                event.threadID, event.messageID
            );
        }

        // Update APPSTATEPATH in config
        const cfg = getConfig();
        cfg.APPSTATEPATH = file;
        saveConfig(cfg);

        const uid = getUIDFromAppstate(file);

        await api.sendMessage(
            `✅ Account ${num} select করা হয়েছে!\n` +
            `🆔 UID: ${uid}\n` +
            `📁 File: ${file}\n\n` +
            `♻️ Bot restart হচ্ছে...`,
            event.threadID,
            event.messageID
        );

        setTimeout(() => process.exit(1), 2000);
        return;
    }

    // ── !account refresh ──────────────────────────────────────────────────────
    if (sub === "refresh") {
        try {
            const activeSlot = getActiveSlot();
            const file       = slotFile(activeSlot);
            const filePath   = path.join(ROOT, file);

            // Snapshot old state
            let oldArr = [];
            try { oldArr = fs.readJsonSync(filePath); } catch {}
            if (!Array.isArray(oldArr)) oldArr = [];

            const oldMap = {};
            for (const c of oldArr) oldMap[c.key] = c.value;

            // Get fresh state
            const freshArr = Array.isArray(api.getAppState()) ? api.getAppState() : [];
            fs.writeJsonSync(filePath, freshArr, { spaces: "\t" });

            const newMap = {};
            for (const c of freshArr) newMap[c.key] = c.value;

            // Diff
            const oldKeys  = new Set(Object.keys(oldMap));
            const newKeys  = new Set(Object.keys(newMap));
            const added    = [...newKeys].filter(k => !oldKeys.has(k));
            const removed  = [...oldKeys].filter(k => !newKeys.has(k));
            const changed  = [...newKeys].filter(k => oldKeys.has(k) && oldMap[k] !== newMap[k]);

            // Separate extension keys from others
            const extChanged = changed.filter(k => EXT_KEYS.includes(k));
            const extAdded   = added.filter(k => EXT_KEYS.includes(k));
            const otherChanged = changed.filter(k => !EXT_KEYS.includes(k));

            const fmt = arr => arr.length ? arr.join(", ") : "—";

            const lines = [
                `✅ Cookie refresh সম্পন্ন!`,
                `📁 Account ${activeSlot} → ${file}`,
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

            if (added.filter(k => !EXT_KEYS.includes(k)).length) {
                lines.push(`➕ New keys: ${fmt(added.filter(k => !EXT_KEYS.includes(k)))}`);
            }

            if (removed.length) {
                lines.push(`➖ Removed: ${fmt(removed)}`);
            }

            if (!changed.length && !added.length && !removed.length) {
                lines.push(`ℹ️ কোনো পরিবর্তন নেই — cookies already fresh.`);
            }

            return api.sendMessage(lines.join("\n"), event.threadID, event.messageID);

        } catch (e) {
            return api.sendMessage(`❌ Refresh fail: ${e.message}`, event.threadID, event.messageID);
        }
    }

    // ── unknown ───────────────────────────────────────────────────────────────
    return api.sendMessage(
        `❓ Unknown subcommand. Use:\n` +
        `  !account           → info\n` +
        `  !account switch 2  → switch account\n` +
        `  !account refresh   → update cookies`,
        event.threadID, event.messageID
    );
};
