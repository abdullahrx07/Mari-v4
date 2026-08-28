const axios = require("axios");

module.exports.config = {
	name: "pin",
	aliases: [],
	premium: false,
	version: "1.1.0",
	hasPermssion: 0,
	credits: "rX",
	description: "Search Pinterest via Pinterest-xdi API and send images or videos (with sound).",
	commandCategory: "media",
	usages: "<query> [video|image] [-N]\nEx: pin sunset video -7\nEx: pin flowers -3",
	cooldowns: 5,
	prefix: true
};

const BASE_URL = process.env.PINXDI_BASE_URL || "https://pinterest-xdi.onrender.com";

async function readErrorBody(err) {
	const stream = err.response?.data;
	if (!stream || typeof stream.on !== "function") return null;
	const chunks = [];
	for await (const chunk of stream) chunks.push(chunk);
	try {
		const parsed = JSON.parse(Buffer.concat(chunks).toString());
		return typeof parsed.detail === "string" ? parsed.detail : JSON.stringify(parsed.detail);
	} catch {
		return null;
	}
}

async function fetchAttachment(url, filename) {
	const res = await axios.get(url, {
		responseType: "stream",
		timeout: 90000,
		validateStatus: (s) => s === 200
	});
	res.data.path = filename;
	return res.data;
}

function sendMessageAsync(api, msg, threadID, messageID) {
	return new Promise((resolve, reject) => {
		api.sendMessage(msg, threadID, (err, info) => {
			if (err) return reject(err);
			resolve(info);
		}, messageID);
	});
}

function unsend(api, messageID) {
	if (!messageID) return;
	try { api.unsendMessage(messageID); } catch (e) {}
}

module.exports.run = async function ({ api, event, args }) {
	const threadID = event.threadID;
	const messageID = event.messageID;

	if (!args.length) {
		return api.sendMessage("⚠️ Usage: !pin <query> [video|image] [-N]", threadID, messageID);
	}

	let mode = "image";
	let num = 10;
	const queryParts = [];

	for (const arg of args) {
		if (arg === "video" || arg === "image") {
			mode = arg;
		} else if (/^-\d+$/.test(arg)) {
			num = Math.min(10, Math.max(1, parseInt(arg.slice(1), 10)));
		} else {
			queryParts.push(arg);
		}
	}

	const query = queryParts.join(" ").trim();
	if (!query) {
		return api.sendMessage("⚠️ Please provide a search query.", threadID, messageID);
	}

	const searchQuery = mode === "video" ? `${query} video` : query;

	const waitMsg = await sendMessageAsync(
		api,
		`🔍 Searching Pinterest for "${query}" (${mode}, ${num})...`,
		threadID,
		messageID
	);

	try {
		const doSearch = () =>
			axios.get(`${BASE_URL}/api/search`, {
				params: { q: searchQuery, mode, num },
				timeout: 60000
			});

		let { data } = await doSearch();
		let results = Array.isArray(data) ? data : data.results;

		if (!results || !results.length) {
			({ data } = await doSearch());
			results = Array.isArray(data) ? data : data.results;
		}

		if (!results || !results.length) {
			return api.sendMessage(`❌ No ${mode} results found for "${query}".`, threadID, messageID);
		}

		if (mode === "image") {
			const attachments = [];
			for (const item of results) {
				try {
					attachments.push(await fetchAttachment(item.download_url, `${item.id}.jpg`));
				} catch {
				}
			}
			if (!attachments.length) {
				return api.sendMessage("❌ Failed to fetch images.", threadID, messageID);
			}
			return sendMessageAsync(
				api,
				{
					body: `✅ Found ${attachments.length} image(s) for "${query}"`,
					attachment: attachments
				},
				threadID,
				messageID
			);
		}

		if (mode === "video" && (num === 1 || results.length === 1)) {
			const item = results[0];
			const dlWaitMsg = await sendMessageAsync(api, `⬇️ Downloading video...`, threadID, messageID);
			try {
				const dlUrl = item.download_url.startsWith("http")
					? item.download_url
					: `${BASE_URL}${item.download_url}`;
				const attachment = await fetchAttachment(dlUrl, `${item.id}.mp4`);
				return sendMessageAsync(api, { attachment }, threadID, messageID);
			} catch (e) {
				const reason = await readErrorBody(e) || e.message;
				return api.sendMessage(`❌ Failed to download video.\nReason: ${reason}`, threadID, messageID);
			} finally {
				unsend(api, dlWaitMsg?.messageID);
			}
		}

		const thumbs = [];
		const list = [];
		results.forEach((item, i) => {
			const dur = item.duration_ms ? ` (${Math.round(item.duration_ms / 1000)}s)` : "";
			list.push(`${i + 1}.${dur} ${item.alt || "No title"}`.slice(0, 80));
		});
		for (const item of results) {
			try {
				thumbs.push(await fetchAttachment(item.thumbnail, `${item.id}.jpg`));
			} catch {
			}
		}
		if (!thumbs.length) {
			return api.sendMessage("❌ Failed to load thumbnails.", threadID, messageID);
		}

		const pickMsg = await sendMessageAsync(
			api,
			{
				body: `🎬 Found ${thumbs.length} video(s) for "${query}"\n\n${list.join("\n")}\n\n👉 Reply with a number (1-${thumbs.length}) to download, or multiple like "1 3 6"`,
				attachment: thumbs
			},
			threadID,
			messageID
		);

		global.client.handleReply.push({
			name: module.exports.config.name,
			messageID: pickMsg.messageID,
			author: event.senderID,
			results
		});
	} catch (err) {
		const reason = await readErrorBody(err) || err.message;
		return api.sendMessage(`❌ Error: ${reason}`, threadID, messageID);
	} finally {
		unsend(api, waitMsg?.messageID);
	}
};

module.exports.handleReply = async function ({ api, event }) {
	const replyID = event.messageReply?.messageID;
	const stored = global.client.handleReply.find(
		r => r.messageID === replyID && r.name === module.exports.config.name
	);
	if (!stored) return;

	const threadID = event.threadID;
	const messageID = event.messageID;

	if (event.senderID !== stored.author) return;

	const rawChoices = (event.body || "")
		.trim()
		.split(/\s+/)
		.map(n => parseInt(n, 10));

	const seen = new Set();
	const choices = [];
	for (const n of rawChoices) {
		if (!isNaN(n) && n >= 1 && n <= stored.results.length && !seen.has(n)) {
			seen.add(n);
			choices.push(n);
		}
	}

	if (!choices.length) {
		return api.sendMessage(
			`⚠️ Please reply with one or more numbers between 1 and ${stored.results.length} (e.g. "1 3 6").`,
			threadID,
			messageID
		);
	}

	const idx = global.client.handleReply.indexOf(stored);
	if (idx !== -1) global.client.handleReply.splice(idx, 1);

	if (choices.length === 1) {
		const choice = choices[0];
		const item = stored.results[choice - 1];

		const waitMsg = await sendMessageAsync(api, `⬇️ Downloading video ${choice}...`, threadID, messageID);
		try {
			const dlUrl = item.download_url.startsWith("http")
				? item.download_url
				: `${BASE_URL}${item.download_url}`;
			const attachment = await fetchAttachment(dlUrl, `${item.id}.mp4`);
			await sendMessageAsync(api, { attachment }, threadID, messageID);
		} catch (e) {
			const reason = await readErrorBody(e) || e.message;
			await api.sendMessage(`❌ Failed to download video ${choice}.\nReason: ${reason}`, threadID, messageID);
		} finally {
			unsend(api, waitMsg?.messageID);
		}
		return;
	}

	const waitMsg = await sendMessageAsync(
		api,
		`⬇️ Downloading ${choices.length} videos: ${choices.join(", ")}...`,
		threadID,
		messageID
	);

	const failed = [];
	try {
		for (const choice of choices) {
			const item = stored.results[choice - 1];
			try {
				const dlUrl = item.download_url.startsWith("http")
					? item.download_url
					: `${BASE_URL}${item.download_url}`;
				const attachment = await fetchAttachment(dlUrl, `${item.id}.mp4`);
				await sendMessageAsync(api, { attachment }, threadID, messageID);
			} catch (e) {
				const reason = await readErrorBody(e) || e.message;
				failed.push(`${choice} (${reason})`);
			}
		}

		if (failed.length) {
			await api.sendMessage(`⚠️ Failed to download: ${failed.join(", ")}`, threadID, messageID);
		}
	} finally {
		unsend(api, waitMsg?.messageID);
	}
};
