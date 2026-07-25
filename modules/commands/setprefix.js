const fs = require("fs");
const path = require("path");

module.exports.config = {
	name: "setprefix",
	version: "1.2.0",
	hasPermssion: 0,
	credits: "rX",
	description: "Set group prefix or your own personal prefix",
	commandCategory: "Group",
	usages: "[prefix/reset] | me <prefix/reset>",
	cooldowns: 5
};

module.exports.languages ={
	"vi": {
		"successChange": "Đã chuyển đổi prefix của nhóm thành: %1",
		"missingInput": "Phần prefix cần đặt không được để trống",
		"resetPrefix": "Đã reset prefix về mặc định: %1",
		"confirmChange": "Bạn có chắc bạn muốn đổi prefix của nhóm thành: %1",
		"successChangeOwn": "✅ Prefix riêng của bạn đã được đặt thành: %1",
		"missingInputOwn": "Phần prefix riêng cần đặt không được để trống",
		"resetPrefixOwn": "✅ Đã xóa prefix riêng của bạn",
		"noOwnPrefix": "❌ Bạn chưa đặt prefix riêng nào",
		"viewOwnPrefix": "🔑 Prefix riêng của bạn hiện tại là: %1",
		"prefixTooLong": "❌ Prefix tối đa 5 ký tự"
	},
	"en": {
		"successChange": "> 🎀\n𝐂𝐡𝐚𝐧𝐠𝐞𝐝 𝐩𝐫𝐞𝐟𝐢𝐱 𝐢𝐧𝐭𝐨: %1",
		"missingInput": "> 🎀\n𝐏𝐫𝐞𝐟𝐢𝐱 𝐡𝐚𝐯𝐞 𝐧𝐨𝐭 𝐭𝐨 𝐛𝐞 𝐛𝐥𝐚𝐧𝐤",
		"resetPrefix": "> 🎀\n 𝐏𝐫𝐞𝐟𝐢𝐱 𝐭𝐨: %1",
		"confirmChange": "> 🎀\n𝐀𝐫𝐞 𝐲𝐨𝐮 𝐬𝐮𝐫𝐞 𝐭𝐡𝐚𝐭 𝐲𝐨𝐮 𝐰𝐚𝐧𝐭 𝐭𝐨 𝐜𝐡𝐚𝐧𝐠𝐞 𝐩𝐫𝐞𝐟𝐢𝐱 𝐢𝐧𝐭𝐨: %1",
		"successChangeOwn": "> 🎀\n✅ 𝐘𝐨𝐮𝐫 𝐩𝐞𝐫𝐬𝐨𝐧𝐚𝐥 𝐩𝐫𝐞𝐟𝐢𝐱 𝐢𝐬 𝐧𝐨𝐰: %1\n╰────────────◊",
		"missingInputOwn": "> 🎀\n𝐏e𝐫𝐬𝐨𝐧𝐚𝐥 𝐩𝐫𝐞𝐟𝐢𝐱 𝐜𝐚𝐧𝐧𝐨𝐭 𝐛𝐞 𝐛𝐥𝐚𝐧𝐤",
		"resetPrefixOwn": "> 🎀\n✅ 𝐘𝐨𝐮𝐫 𝐩𝐞𝐫𝐬𝐨𝐧𝐚𝐥 𝐩𝐫𝐞𝐟𝐢𝐱 𝐡𝐚𝐬 𝐛𝐞𝐞𝐧 𝐫𝐞𝐦𝐨𝐯𝐞𝐝",
		"noOwnPrefix": "> 🎀\n❌ 𝐘𝐨𝐮 𝐝𝐨𝐧'𝐭 𝐡𝐚𝐯𝐞 𝐚 𝐩𝐞𝐫𝐬𝐨𝐧𝐚𝐥 𝐩𝐫𝐞𝐟𝐢𝐱 𝐬𝐞𝐭\n\n𝐃𝐡𝐚𝐧𝐬𝐲: 𝐬𝐞𝐭𝐩𝐫𝐞𝐟𝐢𝐱 𝐦𝐞 <𝐩𝐫𝐞𝐟𝐢𝐱>",
		"viewOwnPrefix": "> 🎀\n🔑 𝐘𝐨𝐮𝐫 𝐩𝐞𝐫𝐬𝐨𝐧𝐚𝐥 𝐩𝐫𝐞𝐟𝐢𝐱: %1",
		"prefixTooLong": "> 🎀\n❌ 𝐏𝐫𝐞𝐟𝐢𝐱 𝐦𝐮𝐬𝐭 𝐛𝐞 𝐦𝐚𝐱 5 𝐜𝐡𝐚𝐫𝐚𝐜𝐭𝐞𝐫𝐬"
	}
}

module.exports.handleReaction = async function({ api, event, Threads, handleReaction, getText }) {
	try {
		if (event.userID != handleReaction.author) return;
		const { threadID, messageID } = event;
		var data = (await Threads.getData(String(threadID))).data || {};
		data["PREFIX"] = handleReaction.PREFIX;
		await Threads.setData(threadID, { data });
		await global.data.threadData.set(String(threadID), data);
		api.unsendMessage(handleReaction.messageID);
		return api.sendMessage(getText("successChange", handleReaction.PREFIX), threadID, messageID);
	} catch (e) { return console.log(e) }
}

module.exports.run = async ({ api, event, args, Threads , getText }) => {

	// ===== OWN PREFIX SYSTEM =====
	if (args[0] && ["me", "own", "my"].includes(args[0].toLowerCase())) {
		const senderID = String(event.senderID);
		const data = await global.systemData.get("user_prefixes", {});
		const sub = args[1];

		// 👁 View current personal prefix
		if (typeof sub == "undefined") {
			const current = data[senderID];
			return api.sendMessage(
				current ? getText("viewOwnPrefix", current) : getText("noOwnPrefix"),
				event.threadID,
				event.messageID
			);
		}

		// ♻️ Reset personal prefix
		if (sub.toLowerCase() === "reset") {
			if (!data[senderID]) return api.sendMessage(getText("noOwnPrefix"), event.threadID, event.messageID);
			delete data[senderID];
			await global.systemData.set("user_prefixes", data);
			return api.sendMessage(getText("resetPrefixOwn"), event.threadID, event.messageID);
		}

		// ✅ Set new personal prefix
		const newPrefix = sub.trim();
		if (!newPrefix) return api.sendMessage(getText("missingInputOwn"), event.threadID, event.messageID);
		if (newPrefix.length > 5) return api.sendMessage(getText("prefixTooLong"), event.threadID, event.messageID);

		data[senderID] = newPrefix;
		await global.systemData.set("user_prefixes", data);
		return api.sendMessage(getText("successChangeOwn", newPrefix), event.threadID, event.messageID);
	}

	// ===== GROUP PREFIX =====
	if (typeof args[0] == "undefined") return api.sendMessage(getText("missingInput"), event.threadID, event.messageID);
	let prefix = args[0].trim();
	if (!prefix) return api.sendMessage(getText("missingInput"), event.threadID, event.messageID);
	if (prefix == "reset") {
		var data = (await Threads.getData(event.threadID)).data || {};
		data["PREFIX"] = global.config.PREFIX;
		await Threads.setData(event.threadID, { data });
		await global.data.threadData.set(String(event.threadID), data);
		return api.sendMessage(getText("resetPrefix", global.config.PREFIX), event.threadID, event.messageID);
	} else return api.sendMessage(getText("confirmChange", prefix), event.threadID, (error, info) => {
		global.client.handleReaction.push({
			name: "setprefix",
			messageID: info.messageID,
			author: event.senderID,
			PREFIX: prefix
		})
	})
}
