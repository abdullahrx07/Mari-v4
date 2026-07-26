const axios = require("axios");
const { checkForUpdate, downloadAndVerify, applyUpdate, CURRENT_VERSION, getGithubConfig } = require("../../utils/selfUpdate");

module.exports.config = {
	name: "update",
	version: "1.0.1",
	hasPermssion: 1, // bot admin only (see includes/handle/handleCommand.js) — installs and runs downloaded code
	credits: "Mari-v3",
	description: "Check for and install bot updates from the configured update API or GitHub fork",
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
				"⚠️ No update source configured. Set the GITHUB_FORK_URL or UPDATE_API_URL in config/environment.",
				threadID,
				messageID
			);
		}
		if (!info.updateAvailable) {
			return api.sendMessage(`✅ Already up to date (v${CURRENT_VERSION}).`, threadID, messageID);
		}

		const { githubPollUrl } = getGithubConfig();

		if (githubPollUrl && info.isGithub) {
			api.sendMessage(
				`⬇️ Update found: v${CURRENT_VERSION} → v${info.latestVersion}\nPoll/Pull URL is configured. Sending pull request notification to:\n🔗 ${githubPollUrl}...`,
				threadID,
				messageID
			);

			try {
				await axios.post(githubPollUrl, {
					event: "update_available",
					currentVersion: CURRENT_VERSION,
					latestVersion: info.latestVersion,
					githubForkUrl: info.githubForkUrl,
					downloadUrl: info.downloadUrl
				}, {
					timeout: 10000,
					headers: {
						"Content-Type": "application/json"
					}
				});
				return api.sendMessage(`✅ Update pull request successfully sent to Poll URL: ${githubPollUrl}`, threadID, messageID);
			} catch (err) {
				console.error(`POST failed, retrying with GET...`, err);
				try {
					await axios.get(githubPollUrl, {
						params: {
							event: "update_available",
							currentVersion: CURRENT_VERSION,
							latestVersion: info.latestVersion,
							githubForkUrl: info.githubForkUrl
						},
						timeout: 10000
					});
					return api.sendMessage(`✅ Update pull request successfully sent (GET fallback) to Poll URL: ${githubPollUrl}`, threadID, messageID);
				} catch (getErr) {
					console.error(`GET fallback failed`, getErr);
					return api.sendMessage(`❌ Failed to send update pull request to Poll URL: ${getErr.message}`, threadID, messageID);
				}
			}
		}

		api.sendMessage(
			`⬇️ Update found: v${CURRENT_VERSION} → v${info.latestVersion}\n${info.changelog ? "\n" + info.changelog : ""}\n\nDownloading and verifying...`,
			threadID,
			messageID
		);

		const buf = await downloadAndVerify(info.downloadUrl, info.checksum);
		await applyUpdate(buf, info);

		api.sendMessage(`✅ Updated to v${info.latestVersion}. Restarting now to apply...`, threadID, () => process.exit(1), messageID);
	} catch (e) {
		console.error(e);
		api.sendMessage(`❌ Update failed: ${e.message}`, threadID, messageID);
	}
};
