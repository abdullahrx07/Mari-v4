module.exports.config = {
	name: "restart",
	version: "1.0.0",
	hasPermssion: 2,
	credits: "𝐫𝐗",
	description: "Restart Bot",
	commandCategory: "system",
	usages: "",
	cooldowns: 5
};

module.exports.run = async ({ api, event, args }) => {
	const { threadID, messageID } = event;
	return api.sendMessage(` ⥤↻⥢ ${global.config.BOTNAME} 𝐢𝐬 𝐧𝐨𝐰 𝐑𝐞𝐬𝐭𝐚𝐫𝐭𝐢𝐧𝐠...`, threadID, () => process.exit(1));
}
