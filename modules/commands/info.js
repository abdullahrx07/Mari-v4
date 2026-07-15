const fs = require("fs");
const path = require("path");
const moment = require("moment-timezone");

module.exports.config = {
	name: "info",
	version: "1.0.3",
	hasPermssion: 0,
	credits: "rX Abdullah",
	description: "Admin and Bot info with gif (local cache).",
	commandCategory: "...",
	cooldowns: 1
};

module.exports.run = async function({ api, event }) {
	const time = process.uptime(),
		hours = Math.floor(time / (60 * 60)),
		minutes = Math.floor((time % (60 * 60)) / 60),
		seconds = Math.floor(time % 60);

	const currentTime = moment.tz("Asia/Dhaka").format("『D/MM/YYYY』 【HH:mm:ss】");

	const message = 
`𝗢𝗪𝗡𝗘𝗥 𝗜𝗡𝗙𝗢𝗥𝗠𝗔𝗧𝗜𝗢𝗡
━━━━━━━━━━━━━━━━━━━━━━━
▶ 𝗡𝗮𝗺𝗲: 𝗿𝗫 𝗔𝗯𝗱𝘂𝗹𝗹𝗮𝗵
▶ 𝗔𝗴𝗲: 𝟭𝟴
▶ 𝗣𝗼𝘀𝗶𝘁𝗶𝗼𝗻: 𝗢𝘄𝗻𝗲𝗿
▶ 𝗙𝗮𝗰𝗲𝗯𝗼𝗼𝗸: https://m.me/rxabdullah007
▶ 𝗜𝗻𝘀𝘁𝗮𝗴𝗿𝗮𝗺: @rxabdullah007
▶ 𝗪𝗵𝗮𝘁𝘀𝗮𝗽𝗽: 01317604783
▶ 𝗧𝗶𝗸𝘁𝗼𝗸: @rxteach10
▶ 𝗧𝗲𝗹𝗲𝗴𝗿𝗮𝗺: @rxabdullah10
▶ 𝗧𝗶𝗺𝗲: ${currentTime}
▶ 𝗨𝗽𝘁𝗶𝗺𝗲: ${hours}h ${minutes}m ${seconds}s
━━━━━━━━━━━━━━━━━━━━━━━`;

	// লোকাল cache gif
	const cacheDir = path.join(__dirname, "cache");
	const cacheFile = path.join(cacheDir, "info.gif");

	try {
		// cache ফোল্ডার চেক
		if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir);

		// gif ফাইল নাই হলে error দিবে
		if (!fs.existsSync(cacheFile)) {
			return api.sendMessage("❌ info.gif ফাইল cache ফোল্ডারে পাওয়া যায়নি!", event.threadID);
		}

		// send gif + 10 sec unsend
		await api.sendMessage(
			{
				body: message,
				attachment: fs.createReadStream(cacheFile)
			},
			event.threadID,
			(err, info) => {
				if (!err) {
					setTimeout(() => {
						api.unsendMessage(info.messageID);
					}, 10000); // 10 sec পরে auto unsend
				}
			}
		);

	} catch (error) {
		console.error(error);
		api.sendMessage("❌ GIF পাঠানো ব্যর্থ হয়েছে।", event.threadID);
	}
};
