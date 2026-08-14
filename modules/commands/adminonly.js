module.exports.config = {
    name: "adminonly",
    aliases: ["adminmode"],
    version: "1.0.0",
    hasPermssion: 1, // ADMINBOT only
    credits: "rX",
    description: "Toggle global admin-only mode — when ON, ONLY bot admins can trigger ANY command (prefix, no-prefix, and event-trigger commands like baby/prefix)",
    commandCategory: "Admin",
    usages: "[on|off]",
    cooldowns: 5
};

module.exports.run = async function ({ api, event, args }) {
    const subCommand = args[0]?.toLowerCase();

    if (!subCommand) {
        const current = await global.systemData.get("admin_only_mode", false);
        return api.sendMessage(
            `> 🔒\n𝐀𝐝𝐦𝐢𝐧-𝐨𝐧𝐥𝐲 𝐦𝐨𝐝𝐞 𝐢𝐬 𝐜𝐮𝐫𝐫𝐞𝐧𝐭𝐥𝐲: ${current ? "ON 🟢" : "OFF 🔴"}\n\nUsage: adminonly [on|off]`,
            event.threadID
        );
    }

    switch (subCommand) {
        case "on":
            await global.systemData.set("admin_only_mode", true);
            return api.sendMessage(
                "> 🔒\n𝐀𝐝𝐦𝐢𝐧-𝐨𝐧𝐥𝐲 𝐦𝐨𝐝𝐞 𝐢𝐬 𝐧𝐨𝐰 𝐎𝐍 — 𝐨𝐧𝐥𝐲 𝐛𝐨𝐭 𝐚𝐝𝐦𝐢𝐧𝐬 𝐜𝐚𝐧 𝐮𝐬𝐞 𝐚𝐧𝐲 𝐜𝐨𝐦𝐦𝐚𝐧𝐝 (𝐢𝐧𝐜𝐥𝐮𝐝𝐢𝐧𝐠 𝐭𝐫𝐢𝐠𝐠𝐞𝐫 𝐜𝐨𝐦𝐦𝐚𝐧𝐝𝐬 𝐥𝐢𝐤𝐞 𝐛𝐚𝐛𝐲/𝐩𝐫𝐞𝐟𝐢𝐱)",
                event.threadID
            );

        case "off":
            await global.systemData.set("admin_only_mode", false);
            return api.sendMessage(
                "> 🔓\n𝐀𝐝𝐦𝐢𝐧-𝐨𝐧𝐥𝐲 𝐦𝐨𝐝𝐞 𝐢𝐬 𝐧𝐨𝐰 𝐎𝐅𝐅 — 𝐚𝐥𝐥 𝐮𝐬𝐞𝐫𝐬 𝐜𝐚𝐧 𝐮𝐬𝐞 𝐜𝐨𝐦𝐦𝐚𝐧𝐝𝐬 𝐚𝐠𝐚𝐢𝐧",
                event.threadID
            );

        default:
            return api.sendMessage("Unknown subcommand. Usage: adminonly [on|off]", event.threadID);
    }
};
