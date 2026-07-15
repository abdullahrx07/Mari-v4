const { checkForUpdate, downloadAndVerify, applyUpdate, CURRENT_VERSION } = require("../../utils/selfUpdate");

module.exports.config = {
	name: "update",
	version: "1.0.0",
	hasPermssion: 1, // bot admin only (see includes/handle/handleCommand.js) — installs and runs downloaded code
	credits: "Mari-v3",
	description: "Check for and install bot updates from the configured update API",
	commandCategory: "system",
	usages: "update",
	cooldowns: 10
};

module.exports.run = async function ({ api, event }) {
	const { threadID, messageID } = event;
	try {
		api.sendMessage(`🔎 Checking for updates... (current: v${CURRENT_VERSION})`, threadID, messageID);

		const info = await checkForUpdate();
		if (!info) {
			return api.sendMessage(
				"⚠️ No update API configured. Set the UPDATE_API_URL environment variable — see update.md for the protocol.",
				threadID
			);
		}
		if (!info.updateAvailable) {
			return api.sendMessage(`✅ Already up to date (v${CURRENT_VERSION}).`, threadID);
		}

		api.sendMessage(
			`⬇️ Update found: v${CURRENT_VERSION} → v${info.latestVersion}\n${info.changelog ? "\n" + info.changelog : ""}\n\nDownloading and verifying...`,
			threadID
		);

		const buf = await downloadAndVerify(info.downloadUrl, info.checksum);
		await applyUpdate(buf, info);

		api.sendMessage(`✅ Updated to v${info.latestVersion}. Restarting now...`, threadID, () => process.exit(1));
	} catch (e) {
		console.error(e);
		api.sendMessage(`❌ Update failed: ${e.message}`, threadID, messageID);
	}
};
