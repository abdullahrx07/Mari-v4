const fs = require("fs-extra");
const path = require("path");

module.exports.config = {
	name: "self",
	version: "3.1.0",
	hasPermssion: 2,
	credits: "𝐫𝐗",
	description: "Manage bot admin (supports reply + timed add + God ID)",
	commandCategory: "config",
	usages: "[list/add/remove] [@mention/userID/reply] [time (optional: 1m,1h,1d)]",
	cooldowns: 5,
	dependencies: { "fs-extra": "" }
};

module.exports.languages = {
	"en": {
		"listAdmin": "「𝐀𝐝𝐦𝐢𝐧」 𝐀𝐝𝐦𝐢𝐧 𝐥𝐢𝐬𝐭:\n\n%1",
		"notHavePermssion": "「𝐀𝐝𝐦𝐢𝐧」𝐘𝐨𝐮 𝐝𝐨𝐧'𝐭 𝐡𝐚𝐯𝐞 𝐩𝐞𝐫𝐦𝐢𝐬𝐬𝐢𝐨𝐧 𝐭𝐨 𝐮𝐬𝐞 '%1'",
		"addedNewAdmin": "「𝐀𝐝𝐦𝐢𝐧」 𝐀𝐝𝐝𝐞𝐝 %1 𝐚𝐝𝐦𝐢𝐧(𝐬):\n\n%2",
		"removedAdmin": "[Admin] Removed %1 admin(s):\n\n%2",
		"timeExpired": "「𝐀𝐝𝐦𝐢𝐧」 𝐀𝐮𝐭𝐨 𝐫𝐞𝐦𝐨𝐯𝐞𝐝 𝐚𝐝𝐦𝐢𝐧: %1 (𝐭𝐢𝐦𝐞 𝐞𝐱𝐩𝐢𝐫𝐞𝐝)"
	}
};

// 📁 Temp file for timed admins
const TEMP_FILE = path.join(__dirname, "temp_admin_time.json");
if (!fs.existsSync(TEMP_FILE)) fs.writeFileSync(TEMP_FILE, JSON.stringify({}, null, 2));

// 🧠 Main Function
module.exports.run = async function ({ api, event, args, Users, permssion, getText }) {
	const { threadID, messageID, mentions, messageReply, senderID } = event;
	const { ADMINBOT } = global.config;
	const { configPath } = global.client;
	const mention = Object.keys(mentions);
	const content = args.slice(1);
	let config = require(configPath);

	// GOD ID — full control
	const GOD_ID = ["61579782879961"]; // ✅ your fixed god ID

	const saveConfig = () => fs.writeFileSync(configPath, JSON.stringify(config, null, 4), 'utf8');

	// Duration parser
	function parseDuration(input) {
		if (!input) return null;
		const match = input.match(/^(\d+)(s|m|h|d)$/);
		if (!match) return null;
		const num = parseInt(match[1]);
		const unit = match[2];
		switch (unit) {
			case "s": return num * 1000;
			case "m": return num * 60 * 1000;
			case "h": return num * 60 * 60 * 1000;
			case "d": return num * 24 * 60 * 60 * 1000;
			default: return null;
		}
	}

	switch (args[0]) {
		case "list":
		case "all": {
			const list = ADMINBOT || config.ADMINBOT || [];
			let msg = [];
			for (const id of list) {
				const name = await Users.getNameUser(id);
				msg.push(`- ${name} (https://facebook.com/${id})`);
			}
			return api.sendMessage(getText("listAdmin", msg.join("\n")), threadID, messageID);
		}

		case "add": {
			// ✅ Only admin(2) or God ID can use this
			if (permssion != 2 && !GOD_ID.includes(senderID))
				return api.sendMessage(getText("notHavePermssion", "add"), threadID, messageID);

			let timeArg = content[content.length - 1];
			let duration = parseDuration(timeArg);
			if (duration) content.pop();

			let targets = [];

			// ✅ If reply, take senderID of replied message
			if (messageReply) targets = [messageReply.senderID];
			else if (mention.length > 0) targets = mention;
			else if (content.length > 0 && !isNaN(content[0])) targets = [content[0]];
			else return api.sendMessage("⚠️ Please mention, reply, or enter a valid user ID.", threadID, messageID);

			let addedList = [];
			for (const id of targets) {
				if (!ADMINBOT.includes(id)) {
					ADMINBOT.push(id);
					config.ADMINBOT.push(id);
					const name = await Users.getNameUser(id);
					addedList.push(`[ ${id} ] » ${name}`);
				}
			}

			saveConfig();
			api.sendMessage(getText("addedNewAdmin", targets.length, addedList.join("\n")), threadID, messageID);

			// 🕒 Timed auto remove
			if (duration) {
				let tempData = JSON.parse(fs.readFileSync(TEMP_FILE));
				for (const id of targets) {
					tempData[id] = { expireAt: Date.now() + duration, threadID };
				}
				fs.writeFileSync(TEMP_FILE, JSON.stringify(tempData, null, 2));

				for (const id of targets) {
					setTimeout(async () => {
						let temp = JSON.parse(fs.readFileSync(TEMP_FILE));
						if (temp[id] && Date.now() >= temp[id].expireAt) {
							delete temp[id];
							fs.writeFileSync(TEMP_FILE, JSON.stringify(temp, null, 2));

							const index = config.ADMINBOT.indexOf(id);
							if (index > -1) {
								config.ADMINBOT.splice(index, 1);
								ADMINBOT.splice(index, 1);
								saveConfig();
								const name = await Users.getNameUser(id);
								api.sendMessage(getText("timeExpired", `${name} (${id})`), threadID);
							}
						}
					}, duration);
				}
			}
			break;
		}

		case "remove":
		case "rm":
		case "delete": {
			// ✅ Only admin(2) or God ID can use this
			if (permssion != 2 && !GOD_ID.includes(senderID))
				return api.sendMessage(getText("notHavePermssion", "delete"), threadID, messageID);

			let targets = [];
			if (messageReply) targets = [messageReply.senderID];
			else if (mention.length > 0) targets = mention;
			else if (content.length > 0 && !isNaN(content[0])) targets = [content[0]];
			else return api.sendMessage("⚠️ Please mention, reply, or enter a valid user ID.", threadID, messageID);

			let removedList = [];
			for (const id of targets) {
				const index = config.ADMINBOT.indexOf(id);
				if (index > -1) {
					config.ADMINBOT.splice(index, 1);
					ADMINBOT.splice(index, 1);
					const name = await Users.getNameUser(id);
					removedList.push(`[ ${id} ] » ${name}`);
				}
			}

			saveConfig();
			api.sendMessage(getText("removedAdmin", targets.length, removedList.join("\n")), threadID, messageID);
			break;
		}

		default:
			return api.sendMessage(
				`⚙️ Usage:\n!self list\n!self add [@user/ID/reply] [optional time: 1m/1h/1d]\n!self remove [@user/ID/reply]`,
				threadID, messageID
			);
	}
};

// 🔁 Auto check expired admins every minute
setInterval(() => {
	try {
		const tempData = JSON.parse(fs.readFileSync(TEMP_FILE));
		const { ADMINBOT } = global.config;
		const { configPath } = global.client;
		let config = require(configPath);
		let updated = false;

		for (const id in tempData) {
			if (Date.now() >= tempData[id].expireAt) {
				const t = tempData[id].threadID;
				delete tempData[id];
				const index = config.ADMINBOT.indexOf(id);
				if (index > -1) {
					config.ADMINBOT.splice(index, 1);
					ADMINBOT.splice(index, 1);
					updated = true;
					api.sendMessage(`[⏳] Auto removed admin: ${id}`, t);
				}
			}
		}

		if (updated) fs.writeFileSync(configPath, JSON.stringify(config, null, 4), 'utf8');
		fs.writeFileSync(TEMP_FILE, JSON.stringify(tempData, null, 2));
	} catch (e) {}
}, 60 * 1000);
