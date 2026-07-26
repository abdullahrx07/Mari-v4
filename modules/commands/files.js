module.exports.config = {
    name: "file",
    version: "1.1.0",
    hasPermssion: 2,
    credits: "rahat | rX",
    description: "Browse, view (with image preview), and delete files/folders in the commands folder",
    commandCategory: "Admin",
    usages: "\nfile\nfile start <text>\nfile ext <text>\nfile <text>\nfile help",
    cooldowns: 5
};

const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");

const PASTEBIN_API = "https://pastebin-raw.vercel.app";
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp"];
function isImageFile(name) {
    return IMAGE_EXTENSIONS.includes(path.extname(name).toLowerCase());
}

function listDir(dirAbs) {
    const names = fs.readdirSync(dirAbs);
    return names.map(name => {
        const full = path.join(dirAbs, name);
        const stat = fs.statSync(full);
        return {
            name,
            isDir: stat.isDirectory(),
            isImage: !stat.isDirectory() && isImageFile(name)
        };
    }).sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
    });
}

function renderList(relDir, entries) {
    const title = relDir ? relDir.split("/").pop() : "commands";
    let msg = `🗂️ 『 ${title} 』\n`;
    entries.forEach((e, idx) => {
        const branch = idx === entries.length - 1 ? "└" : "├";
        const icon = e.isDir ? "📂" : (e.isImage ? "🖼️" : "📄");
        msg += `${branch}${idx + 1}. ${icon} ${e.name}\n`;
    });
    if (entries.length === 0) msg += "『 empty 』\n";
    msg += `\n▭▭▭▭▭▭▭▭▭▭▭▭▭▭\n`;
    msg += `✦Reply a number to open\n`;
    if (relDir) {
        msg += `✦Reply "back" ↩️ to go up a level\n`;
    }
    msg += `✦Reply "delete 1,2,3" 🗑️ to delete\n`;
    msg += `✦Reply "raw 1,2,3" 🔗 to get paste links\n`;
    msg += `▭▭▭▭▭▭▭▭▭▭▭▭▭▭`;
    return msg;
}

module.exports.handleReply = async ({ api, event, handleReply }) => {
    if (event.senderID != handleReply.author) return;
    const body = (event.body || "").trim();

    // ===== "raw" reply on a file-view prompt -> upload to pastebin =====
    if (handleReply.stage === "viewFile") {
        if (body.toLowerCase() !== "raw") {
            return api.sendMessage('❌ Reply "raw" to get a paste link, or ignore this message.', event.threadID, event.messageID);
        }
        const abs = path.join(__dirname, handleReply.filePath);
        let code;
        try {
            code = fs.readFileSync(abs, "utf8");
        } catch (e) {
            return api.sendMessage("❌ Couldn't read that file (it may have been deleted).", event.threadID, event.messageID);
        }
        try {
            const res = await axios.post(`${PASTEBIN_API}/api/paste`, { code });
            if (res.data && res.data.url) {
                return api.sendMessage(`📄 File: ${path.basename(handleReply.filePath)}\n🔗 ${res.data.url}`, event.threadID, event.messageID);
            }
            return api.sendMessage("⚠️ Upload failed - no valid link received.", event.threadID, event.messageID);
        } catch (e) {
            return api.sendMessage("❌ Upload failed: " + e.message, event.threadID, event.messageID);
        }
    }

    const relDir = handleReply.relDir || "";
    const dirAbs = path.join(__dirname, relDir);
    const entries = handleReply.entries;

    // go up a level
    if (body.toLowerCase() === "back") {
        if (!relDir) return api.sendMessage("⚡️Already at the root of commands folder.", event.threadID, event.messageID);
        const parent = relDir.includes("/") ? relDir.slice(0, relDir.lastIndexOf("/")) : "";
        const parentAbs = path.join(__dirname, parent);
        const parentEntries = listDir(parentAbs);
        return api.sendMessage(renderList(parent, parentEntries), event.threadID, (e, info) => {
            global.client.handleReply.push({
                name: this.config.name, messageID: info.messageID, author: event.senderID,
                relDir: parent, entries: parentEntries
            });
        });
    }

    // delete one or more
    const deleteMatch = body.match(/^delete\s+(.+)$/i);
    if (deleteMatch) {
        const nums = deleteMatch[1].trim().split(/\s+/).map(n => parseInt(n));
        let msg = "";
        for (const num of nums) {
            const target = entries[num - 1];
            if (!target) { msg += `❌ ${num} invalid\n`; continue; }
            const full = path.join(dirAbs, target.name);
            try {
                if (target.isDir) fs.rmdirSync(full, { recursive: true });
                else fs.unlinkSync(full);
                msg += `${target.isDir ? "📂" : "📄"} ${target.name} deleted\n`;
            } catch (err) {
                msg += `❌ Failed: ${target.name} (${err.message})\n`;
            }
        }
        return api.sendMessage(`⚡️Done:\n\n${msg}`, event.threadID, event.messageID);
    }

    // raw 1,2,3 -> upload one or more numbered files (folders skipped) to pastebin, straight from the listing
    const rawMatch = body.match(/^raw\s+(.+)$/i);
    if (rawMatch) {
        const nums = rawMatch[1].trim().split(/\s+/).map(n => parseInt(n));
        let msg = "";
        for (const num of nums) {
            const target = entries[num - 1];
            if (!target) { msg += `❌ ${num} invalid\n`; continue; }
            if (target.isDir) { msg += `❌ ${num}. ${target.name} is a folder, skipped\n`; continue; }
            if (target.isImage) { msg += `❌ ${num}. ${target.name} is an image, skipped\n`; continue; }
            const full = path.join(dirAbs, target.name);
            let code;
            try {
                code = fs.readFileSync(full, "utf8");
            } catch (e) {
                msg += `❌ ${num}. ${target.name} couldn't be read\n`;
                continue;
            }
            try {
                const res = await axios.post(`${PASTEBIN_API}/api/paste`, { code });
                if (res.data && res.data.url) {
                    msg += `📄 ${target.name}\n🔗 ${res.data.url}\n`;
                } else {
                    msg += `⚠️ ${target.name} - upload failed, no link received\n`;
                }
            } catch (err) {
                msg += `❌ ${target.name} - upload failed: ${err.message}\n`;
            }
        }
        return api.sendMessage(`⚡️Raw links:\n\n${msg}`, event.threadID, event.messageID);
    }

    // open by number: folder -> navigate in, image -> preview, other file -> just show name (no raw code dump)
    const num = parseInt(body, 10);
    if (!Number.isInteger(num) || !entries[num - 1]) {
        return api.sendMessage("❌ Invalid reply. Send a number, \"back\", or \"delete 1,2,3\".", event.threadID, event.messageID);
    }
    const entry = entries[num - 1];
    const entryAbs = path.join(dirAbs, entry.name);
    const newRelDir = relDir ? `${relDir}/${entry.name}` : entry.name;

    if (entry.isDir) {
        const subEntries = listDir(entryAbs);
        return api.sendMessage(renderList(newRelDir, subEntries), event.threadID, (e, info) => {
            global.client.handleReply.push({
                name: this.config.name, messageID: info.messageID, author: event.senderID,
                relDir: newRelDir, entries: subEntries
            });
        });
    }

    if (entry.isImage) {
        return api.sendMessage(
            { body: `🖼️ ${entry.name}`, attachment: fs.createReadStream(entryAbs) },
            event.threadID, event.messageID
        );
    }

    return api.sendMessage(
        `📄 ${entry.name}\n✦Reply "raw" to get a paste link for this file\n✦Or use the delete command to remove it`,
        event.threadID,
        (e, info) => {
            if (e || !info) return;
            global.client.handleReply.push({
                name: this.config.name,
                messageID: info.messageID,
                author: event.senderID,
                stage: "viewFile",
                filePath: newRelDir
            });
        },
        event.messageID
    );
};

module.exports.run = async function ({ api, event, args }) {
    if (args[0] === "help") {
        return api.sendMessage(
`How to use:
•start <text> — filter files starting with text
•ext <text> — filter files by extension
•<text> — filter files containing text
•(blank) — show all files/folders
•Reply a number to open a folder or preview an image
•Reply "back" to go up a level
•Reply "delete 1,2,3" to delete
•Reply "raw 1,2,3" to get paste links for those files`,
            event.threadID, event.messageID);
    }

    let entries = listDir(__dirname);
    let key = "⚡️All files/folders in commands:";

    if (args[0] === "start" && args[1]) {
        const word = args.slice(1).join(" ");
        entries = entries.filter(e => e.name.startsWith(word));
        key = `⚡️Files starting with: ${word}`;
    } else if (args[0] === "ext" && args[1]) {
        const ext = args[1];
        entries = entries.filter(e => e.name.endsWith(ext));
        key = `⚡️Files ending with: ${ext}`;
    } else if (args[0]) {
        const word = args.join(" ");
        entries = entries.filter(e => e.name.includes(word));
        key = `⚡️Files containing: ${word}`;
    }

    if (entries.length === 0) return api.sendMessage("⚡️No matching files/folders found.", event.threadID, event.messageID);

    return api.sendMessage(`${key}\n\n${renderList("", entries)}`, event.threadID, (e, info) => {
        global.client.handleReply.push({
            name: this.config.name, messageID: info.messageID, author: event.senderID,
            relDir: "", entries
        });
    });
};
