const fs = require("fs");
const path = require("path");

module.exports.config = {
    name: "vip",
    version: "1.0.0",
    hasPermssion: 3, // ADMINBOT only
    credits: "rX",
    description: "Manage VIP mode & VIP users",
    commandCategory: "Admin",
    usages: "[on|off|add|remove|list] <userID or reply>",
    cooldowns: 5
};

module.exports.run = async function ({ api, event, args }) {
    const subCommand = args[0]?.toLowerCase();

    // Check for reply message if add/remove
    let targetID = args[1];
    if (!targetID && event.messageReply) targetID = event.messageReply.senderID;

    if (!subCommand) return api.sendMessage("Usage: vip [on|off|add|remove|list] <userID or reply>", event.threadID);

    let vipList = await global.systemData.get("vip_list", []);
    let vipMode = await global.systemData.get("vip_mode", false);

    switch(subCommand) {
        case "on":
            await global.systemData.set("vip_mode", true);
            return api.sendMessage("> 🎀\n𝐎𝐊 𝐎𝐧𝐥𝐲 𝐕𝐈𝐏 𝐮𝐬𝐞𝐫 𝐜𝐚𝐧 𝐮𝐬𝐞 𝐜𝐦𝐝𝐬", event.threadID);

        case "off":
            await global.systemData.set("vip_mode", false);
            return api.sendMessage("> 🎀\n𝐃𝐨𝐧𝐞 𝐚𝐥𝐥 𝐮𝐬𝐞𝐫 𝐜𝐚𝐧 𝐮𝐬𝐞 𝐜𝐦𝐝𝐬", event.threadID);

        case "add":
            if (!targetID) return api.sendMessage("> ❌\n𝐏𝐥𝐞𝐚𝐬𝐞 𝐩𝐫𝐨𝐯𝐢𝐝𝐞 𝐚 𝐮𝐬𝐞𝐫𝐈𝐃 𝐨𝐫 𝐫𝐞𝐩𝐥𝐲 𝐭𝐨 𝐚𝐝𝐝.", event.threadID);
            if (vipList.includes(targetID)) return api.sendMessage("> ❌\n𝐔𝐬𝐞𝐫 𝐢𝐬 𝐚𝐥𝐫𝐞𝐚𝐝𝐲 𝐕𝐈𝐏.", event.threadID);
            vipList.push(targetID);
            await global.systemData.set("vip_list", vipList);
            return api.sendMessage(`✅ Added ${targetID} to VIP list.`, event.threadID);

        case "remove":
            if (!targetID) return api.sendMessage("> ❌\n𝐏𝐥𝐞𝐚𝐬𝐞 𝐩𝐫𝐨𝐯𝐢𝐝𝐞 𝐚 𝐮𝐬𝐞𝐫𝐈𝐃 𝐨𝐫 𝐫𝐞𝐩𝐥𝐲 𝐭𝐨 𝐫𝐞𝐦𝐨𝐯𝐞.", event.threadID);
            if (!vipList.includes(targetID)) return api.sendMessage("> ❌\n 𝐔𝐬𝐞𝐫 𝐢𝐬 𝐧𝐨𝐭 𝐢𝐧 𝐕𝐈𝐏 𝐥𝐢𝐬𝐭.", event.threadID);
            vipList = vipList.filter(id => id !== targetID);
            await global.systemData.set("vip_list", vipList);
            return api.sendMessage(`✅ Removed ${targetID} from VIP list.`, event.threadID);

        case "list":
            if (vipList.length === 0) return api.sendMessage("> 🎀\n𝐕𝐢𝐩 𝐥𝐢𝐬𝐭 𝐢𝐬 𝐞𝐦𝐩𝐭𝐲.", event.threadID);
            return api.sendMessage(`📋 VIP Users:\n${vipList.join("\n")}`, event.threadID);

        default:
            return api.sendMessage("Unknown subcommand. Usage: vip [on|off|add|remove|list] <userID or reply>", event.threadID);
    }
};
