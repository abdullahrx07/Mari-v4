module.exports.config = {
	name: "setname",
	version: "2.0.2",
	hasPermssion: 0,
	credits: "rX",
	description: "Change the nickname in your group or the person you tag",
	commandCategory: "Box Chat",
	usages: "[name]",
	cooldowns: 3
};

module.exports.run = async function({ api, event, args }) {
	const name = args.join(" ")
	const mention = Object.keys(event.mentions)[0];
	if (!mention) return api.changeNickname(`${name}`, event.threadID, event.senderID);
	if (mention[0]) return api.changeNickname(`${name.replace(event.mentions[mention], "")}`, event.threadID, mention);
}
