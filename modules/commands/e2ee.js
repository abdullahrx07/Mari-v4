const fs = require("fs-extra");
const path = require("path");

module.exports.config = {
    name: "e2ee",
    version: "1.0.0",
    hasPermssion: 0,
    credits: "ST & rX",
    description: "Test end-to-end encrypted (E2EE) messaging and manage configurations",
    commandCategory: "system",
    usages: "[on | off | allowinbox on/off | info] or reply to interactive test",
    cooldowns: 5
};

module.exports.languages = {
    "vi": {
        notE2EE: "⚠️ Lệnh này chỉ hoạt động trong các cuộc trò chuyện mã hóa đầu cuối (E2EE).",
        testMsg: "🔒 Thử nghiệm E2EE\n━━━━━━━━━━━━━━━━\nTin nhắn của bạn đã được mã hóa đầu cuối.\n\nPhản hồi bằng số:\n1️⃣  1 — Thử nghiệm Ping\n2️⃣  2 — Thông tin nhóm",
        reply1: "✅ Pong! Cầu nối E2EE đang hoạt động hoàn hảo.",
        reply2: "📋 Thông tin nhóm E2EE\n━━━━━━━━━━━━━━━━\n• Nhóm: {threadID}\n• Mã hóa: ✅ Có\n• Giao thức: Labyrinth\n• Cầu nối: Hoạt động",
        replyOther: "❓ Tùy chọn không xác định. Vui lòng phản hồi bằng 1 hoặc 2.",
        e2eeDisabled: "⚠️ Tính năng E2EE hiện đang bị vô hiệu hóa bởi nhà phát triển.",
        adminOnlyToggle: "⚠️ Chỉ có quản trị viên bot mới có thể thay đổi cấu hình E2EE.",
        invalidToggle: "⚠️ Lựa chọn không hợp lệ. Vui lòng dùng: e2ee [on | off | allowinbox on | allowinbox off]",
        groupExplainer: "💡 Cách Bot kiểm tra nhóm E2EE:\n1. Kiểm tra ID cuộc trò chuyện ở định dạng JID (chứa '@').\n2. Kiểm tra nếu cuộc trò chuyện là nhóm E2EE hoạt động khi event.isGroup là true."
    },
    "en": {
        notE2EE: "⚠️ This command only works in E2EE (end-to-end encrypted) chats.",
        testMsg: "🔒 E2EE Test\n━━━━━━━━━━━━━━━━\nYour message is end-to-end encrypted.\n\nReply with a number:\n1️⃣  1 — Ping test\n2️⃣  2 — Thread info",
        reply1: "✅ Pong! E2EE bridge is working perfectly.",
        reply2: "📋 E2EE Thread Info\n━━━━━━━━━━━━━━━━\n• Thread: {threadID}\n• Encrypted: ✅ Yes\n• Protocol: Labyrinth\n• Bridge: Active",
        replyOther: "❓ Unknown option. Reply with 1 or 2.",
        e2eeDisabled: "⚠️ E2EE feature is currently disabled by the developer.",
        adminOnlyToggle: "⚠️ Only bot admins can toggle E2EE configurations.",
        invalidToggle: "⚠️ Invalid option. Use: e2ee [on | off | allowinbox on | allowinbox off]",
        groupExplainer: "💡 How the Bot Checks E2EE Chats:\n1. It checks if the Thread ID is in JID format (contains '@').\n2. It checks if the chat is marked as E2EE in the system DB/FCA environment.\n3. Group chats: Thread ID JID represents E2EE groups when event.isGroup is true."
    }
};

module.exports.run = async function ({ api, event, args, getText }) {
    const { threadID, messageID, senderID } = event;
    const subCommand = args[0]?.toLowerCase();

    const isAdmin = global.config.ADMINBOT.includes(String(senderID));

    // Admin Toggle/Management Commands
    if (subCommand) {
        if (!isAdmin) {
            return api.sendMessage(getText("adminOnlyToggle"), threadID, messageID);
        }

        const configPath = global.client.configPath || path.join(process.cwd(), "config.json");
        const currentConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));

        if (subCommand === "on") {
            currentConfig.e2ee = currentConfig.e2ee || {};
            currentConfig.e2ee.enable = true;
            global.config.e2ee = global.config.e2ee || {};
            global.config.e2ee.enable = true;
            fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 4), "utf8");
            return api.sendMessage("✅ E2EE Mode is now turned ON.", threadID, messageID);
        } else if (subCommand === "off") {
            currentConfig.e2ee = currentConfig.e2ee || {};
            currentConfig.e2ee.enable = false;
            global.config.e2ee = global.config.e2ee || {};
            global.config.e2ee.enable = false;
            fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 4), "utf8");
            return api.sendMessage("❌ E2EE Mode is now turned OFF.", threadID, messageID);
        } else if (subCommand === "allowinbox") {
            const mode = args[1]?.toLowerCase();
            if (!["on", "off"].includes(mode)) {
                return api.sendMessage(getText("invalidToggle"), threadID, messageID);
            }
            const status = mode === "on";
            currentConfig.allowInbox = status;
            global.config.allowInbox = status;
            fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 4), "utf8");
            return api.sendMessage(`✅ AllowInbox option is now set to ${mode.toUpperCase()}.`, threadID, messageID);
        } else if (subCommand === "info") {
            return api.sendMessage(getText("groupExplainer"), threadID, messageID);
        } else {
            return api.sendMessage(getText("invalidToggle"), threadID, messageID);
        }
    }

    // Interactive Test Run
    // Check if overall E2EE mode is enabled
    const e2eeEnabled = global.config.e2ee?.enable;
    if (!e2eeEnabled) {
        return api.sendMessage(getText("e2eeDisabled"), threadID, messageID);
    }

    // Verify if it is an E2EE chat (Thread ID must have '@')
    const isE2EEThread = typeof threadID === "string" && threadID.includes("@");
    if (!isE2EEThread) {
        return api.sendMessage(getText("notE2EE"), threadID, messageID);
    }

    const isE2EEDM = isE2EEThread && !event.isGroup;
    if (isE2EEDM && global.config.allowInbox === false) {
        return; // Silent return if allowInbox is disabled for inboxes
    }

    // 1. React to the user's triggering message
    await api.setMessageReaction("🔒", messageID, () => {}, true).catch(() => {});

    // 2. Show typing indicator for 5 seconds
    try {
        await api.sendTypingIndicator(true, threadID, () => {}).catch(() => {});
        await new Promise(resolve => setTimeout(resolve, 5000));
        await api.sendTypingIndicator(false, threadID, () => {}).catch(() => {});
    } catch (_) {
        await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // 3. Send the interactive test message
    return api.sendMessage(getText("testMsg"), threadID, (err, info) => {
        if (info && info.messageID) {
            global.client.handleReply.push({
                name: module.exports.config.name,
                messageID: info.messageID,
                author: senderID,
                threadID: threadID
            });
        }
    }, messageID);
};

module.exports.handleReply = async function ({ api, event, handleReply, getText }) {
    const choice = (event.body || "").trim();
    const { threadID, messageID, senderID } = event;

    if (String(senderID) !== String(handleReply.author)) return;

    if (choice === "1") {
        return api.sendMessage(getText("reply1"), threadID, messageID);
    } else if (choice === "2") {
        return api.sendMessage(getText("reply2").replace("{threadID}", threadID), threadID, messageID);
    } else {
        return api.sendMessage(getText("replyOther"), threadID, messageID);
    }
};
