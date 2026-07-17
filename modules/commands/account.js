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

function mask(str, hideCount = 6) {
    if (!str) return "❌ not set";
    const show = Math.ceil(str.length / 4) || str.length;
    return str.slice(0, show) + "*".repeat(hideCount);
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

// ─── frame helper ───────────────────────────────────────────────────────────

function frame(title, bodyLines, footerLines = []) {
    const lines = [title, ...bodyLines];
    if (footerLines.length) {
        lines.push("", ...footerLines);
    }
    return lines.join("\n");
}

// ─── command ──────────────────────────────────────────────────────────────────

module.exports.config = {
    name: "account",
    version: "2.1.0",
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
        const body     = [];
        const numEmoji = { "1": "1️⃣", "2": "2️⃣", "3": "3️⃣", "4": "4️⃣", "5": "5️⃣" };

        const slots = ["1", "2"];
        slots.forEach((num, i) => {
            const file  = slotFile(num);
            const uid   = getUIDFromAppstate(file);
            const creds = accounts[num] || {};
            const email = mask(creds.email || "", 6);
            const pass  = mask(creds.password || "", 4);
            const status = active === num ? "ACTIVE" : "inactive";

            body.push(
                `${numEmoji[num] || num} Acc ${num} (${status})`,
                `UID: ${uid}`,
                `Email: ${email}`,
                `Pass: ${pass}`
            );
            if (i < slots.length - 1) body.push("");
        });

        const msg = frame("Account Info", body, [
            "Commands",
            "switch 2 / switch 1 / refresh"
        ]);

        return api.sendMessage(msg, event.threadID, event.messageID);
    }

    // ── !account switch <N> ───────────────────────────────────────────────────
    if (sub === "switch") {
        const num = String(args[1] || "").trim();
        if (!num || isNaN(num)) {
            return api.sendMessage(
                frame("⚠️ Missing Number", [
                    "Account number দাও:",
                    "→ !account switch 2"
                ]),
                event.threadID, event.messageID
            );
        }

        const file     = slotFile(num);
        const filePath = path.join(ROOT, file);

        if (!fs.existsSync(filePath)) {
            return api.sendMessage(
                frame("❌ Appstate Not Found", [
                    `Account ${num} এর appstate (${file}) নেই!`,
                    "",
                    `আগে ওই account এর ${file} রুট`,
                    "folder এ রাখো।"
                ]),
                event.threadID, event.messageID
            );
        }

        // Update APPSTATEPATH in config
        const cfg = getConfig();
        cfg.APPSTATEPATH = file;
        saveConfig(cfg);

        const uid = getUIDFromAppstate(file);

        await api.sendMessage(
            frame("✅ Account Switched", [
                `🆔 UID     : ${uid}`,
                `📁 File    : ${file}`,
                `🔢 Account : ${num}`
            ], [
                "♻️ Bot restart হচ্ছে..."
            ]),
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
            const extChanged   = changed.filter(k => EXT_KEYS.includes(k));
            const extAdded     = added.filter(k => EXT_KEYS.includes(k));
            const otherChanged = changed.filter(k => !EXT_KEYS.includes(k));
            const otherAdded   = added.filter(k => !EXT_KEYS.includes(k));

            const fmt = arr => arr.length ? arr.join(", ") : "—";

            const body = [
                `📁 Account : ${activeSlot} → ${file}`,
                `📦 Total   : ${freshArr.length} cookies`
            ];

            if (extChanged.length || extAdded.length) {
                body.push("", "🔄 Session keys");
                if (extChanged.length) body.push(`  changed : ${fmt(extChanged)}`);
                if (extAdded.length)   body.push(`  added   : ${fmt(extAdded)}`);
            }

            if (otherChanged.length) {
                body.push("", `🔑 Changed (${otherChanged.length})`, `  ${fmt(otherChanged)}`);
            }

            if (otherAdded.length) {
                body.push("", "➕ New keys", `  ${fmt(otherAdded)}`);
            }

            if (removed.length) {
                body.push("", "➖ Removed", `  ${fmt(removed)}`);
            }

            if (!changed.length && !added.length && !removed.length) {
                body.push("", "ℹ️ কোনো পরিবর্তন নেই — cookies already fresh.");
            }

            return api.sendMessage(
                frame("✅ Cookie Refreshed", body),
                event.threadID, event.messageID
            );

        } catch (e) {
            return api.sendMessage(
                frame("❌ Refresh Failed", [`⚠️ ${e.message}`]),
                event.threadID, event.messageID
            );
        }
    }

    // ── unknown ───────────────────────────────────────────────────────────────
    return api.sendMessage(
        frame("❓ Unknown Command", [
            "!account           → info",
            "!account switch 2  → switch account",
            "!account refresh   → update cookies"
        ]),
        event.threadID, event.messageID
    );
};
