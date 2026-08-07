const axios = require("axios");
const yts = require("yt-search");
const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");

const API_URL = "https://raw.githubusercontent.com/bruxa6t9/BRUXA-BOT-UTILITIES/refs/heads/main/apiUrls.json";
const CACHE_DIR = path.join(__dirname, "cache");
const apiKey = "bruxa-76acde6852d69cf0-2fbba28d5ea6f4a6";

// Server e kono system font na thakleo text jate render hoy, tai font file-ta
// project-e bundle kore direct register kora hocche — system fontconfig-er upor
// depend kore na, tai hosting panel/minimal container e-o guaranteed kaj korbe.
// "fonts/NotoSans-Regular.ttf" — ei exact path e file-ta rakhte hobe.
const FONT_PATH = path.join(__dirname, "wall", "NotoSans-Regular.ttf");
const FONT_FAMILY = "NotoSans";

try {
	if (fs.existsSync(FONT_PATH)) {
		GlobalFonts.registerFromPath(FONT_PATH, FONT_FAMILY);
	} else {
		console.warn(`[sing] Font file paoa jayni: ${FONT_PATH} — result-list e text ashbe na. fonts/NotoSans-Regular.ttf file-ta project-e bundle koro.`);
	}
} catch (err) {
	console.error("[sing] Font register korte error:", err.message);
}

let cachedApiBase = null;

async function getApiBase() {
	if (cachedApiBase) return cachedApiBase;
	const res = await axios.get(API_URL, { timeout: 10000 });
	if (!res.data?.api) throw new Error("apiUrls.json is missing the 'api' field");
	cachedApiBase = res.data.api;
	return cachedApiBase;
}

async function fetchSongAudio(videoUrl) {
	const apiBase = await getApiBase();
	const res = await axios.get(`${apiBase}/sing`, {
		params: { url: videoUrl },
		responseType: "arraybuffer",
		timeout: 120000,
		headers: {
			"x-api-key": apiKey,
			"Content-Type": "application/json"
		}
	});
	return Buffer.from(res.data);
}

function extractApiErrorMessage(err) {
	const raw = err.response?.data;
	if (raw) {
		try {
			const text = Buffer.isBuffer(raw) ? raw.toString("utf-8") : Buffer.from(raw).toString("utf-8");
			const parsed = JSON.parse(text);
			if (parsed?.message) return parsed.message;
		} catch (_) {
			// response wasn't JSON — fall through to err.message
		}
	}
	return err.message;
}

function saveAudioToTempFile(buffer) {
	if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
	const file = path.join(CACHE_DIR, `sing_${Date.now()}.mp3`);
	fs.writeFileSync(file, buffer);
	return file;
}

function saveImageToTempFile(buffer) {
	if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
	const file = path.join(CACHE_DIR, `sing_results_${Date.now()}.png`);
	fs.writeFileSync(file, buffer);
	return file;
}

// Promise wrapper — api.sendMessage callback style k await kora jai
function sendMessageAsync(api, msg, threadID, messageID) {
	return new Promise((resolve, reject) => {
		api.sendMessage(msg, threadID, (err, info) => {
			if (err) return reject(err);
			resolve(info);
		}, messageID);
	});
}

async function sendSong(api, threadID, video, captionExtra) {
	const audioBuffer = await fetchSongAudio(video.url);
	const file = saveAudioToTempFile(audioBuffer);

	try {
		await sendMessageAsync(api, {
			body: `🎶 ${video.title}\n${captionExtra}🕒 ${video.timestamp}`,
			attachment: fs.createReadStream(file)
		}, threadID);
	} finally {
		try {
			fs.unlinkSync(file);
		} catch (err) {
			console.error("[sing] cleanup error:", err.message);
		}
	}
}

// ---------- Result-list image builder (YouTube desktop style rows) ----------

function roundRect(ctx, x, y, w, h, r) {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
	const words = String(text || "").split(" ");
	let line = "";
	let lines = [];

	for (const word of words) {
		const test = line ? `${line} ${word}` : word;
		if (ctx.measureText(test).width > maxWidth && line) {
			lines.push(line);
			line = word;
			if (lines.length === maxLines) break;
		} else {
			line = test;
		}
	}
	if (line && lines.length < maxLines) lines.push(line);

	const usedAllWords = lines.join(" ").length >= String(text || "").length;
	if (!usedAllWords && lines.length === maxLines) {
		let last = lines[maxLines - 1];
		while (ctx.measureText(`${last}…`).width > maxWidth && last.length > 0) {
			last = last.slice(0, -1);
		}
		lines[maxLines - 1] = `${last}…`;
	}

	lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
	return lines.length;
}

function formatViews(n) {
	if (!n && n !== 0) return null;
	if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
	if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
	return String(n);
}

async function loadThumbnail(url) {
	const { data } = await axios.get(url, { responseType: "arraybuffer", timeout: 10000 });
	return loadImage(Buffer.from(data));
}

async function buildResultsImage(videos) {
	const THUMB_W = 200;
	const THUMB_H = 112; // 16:9
	const PADDING = 16;
	const ROW_H = THUMB_H + PADDING * 2;
	const WIDTH = 760;
	const HEIGHT = ROW_H * videos.length;

	const canvas = createCanvas(WIDTH, HEIGHT);
	const ctx = canvas.getContext("2d");

	// YouTube-dark background
	ctx.fillStyle = "#0f0f0f";
	ctx.fillRect(0, 0, WIDTH, HEIGHT);

	for (let i = 0; i < videos.length; i++) {
		const v = videos[i];
		const y = i * ROW_H;

		if (i > 0) {
			ctx.strokeStyle = "#272727";
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.moveTo(PADDING, y);
			ctx.lineTo(WIDTH - PADDING, y);
			ctx.stroke();
		}

		// thumbnail (rounded, cropped to box)
		try {
			const img = await loadThumbnail(v.thumbnail);
			ctx.save();
			roundRect(ctx, PADDING, y + PADDING, THUMB_W, THUMB_H, 8);
			ctx.clip();
			ctx.drawImage(img, PADDING, y + PADDING, THUMB_W, THUMB_H);
			ctx.restore();
		} catch (e) {
			ctx.fillStyle = "#272727";
			roundRect(ctx, PADDING, y + PADDING, THUMB_W, THUMB_H, 8);
			ctx.fill();
		}

		// duration badge (bottom-right of thumbnail, like YouTube)
		const durationText = v.timestamp || "";
		if (durationText) {
			ctx.font = `bold 13px ${FONT_FAMILY}`;
			const tw = ctx.measureText(durationText).width;
			const bx = PADDING + THUMB_W - tw - 12;
			const by = y + PADDING + THUMB_H - 22;
			ctx.fillStyle = "rgba(0,0,0,0.8)";
			roundRect(ctx, bx - 4, by, tw + 8, 18, 3);
			ctx.fill();
			ctx.fillStyle = "#ffffff";
			ctx.fillText(durationText, bx, by + 13);
		}

		// serial number badge (top-left of thumbnail) — this is what the user replies with
		ctx.fillStyle = "#ff0033";
		ctx.beginPath();
		ctx.arc(PADDING + 15, y + PADDING + 15, 15, 0, Math.PI * 2);
		ctx.fill();
		ctx.fillStyle = "#ffffff";
		ctx.font = `bold 15px ${FONT_FAMILY}`;
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText(String(i + 1), PADDING + 15, y + PADDING + 16);
		ctx.textAlign = "left";
		ctx.textBaseline = "alphabetic";

		// title + meta (right side, like YouTube search rows)
		const textX = PADDING + THUMB_W + 16;
		const textMaxW = WIDTH - textX - PADDING;

		ctx.fillStyle = "#ffffff";
		ctx.font = `600 17px ${FONT_FAMILY}`;
		const titleLines = wrapText(ctx, v.title, textX, y + PADDING + 20, textMaxW, 22, 2);

		ctx.fillStyle = "#aaaaaa";
		ctx.font = `13px ${FONT_FAMILY}`;
		const meta = [v.author?.name, formatViews(v.views) ? `${formatViews(v.views)} views` : null, v.ago]
			.filter(Boolean)
			.join(" • ");
		ctx.fillText(meta, textX, y + PADDING + 20 + titleLines * 22 + 16);
	}

	return canvas.toBuffer("image/png");
}

// -----------------------------------------------------------------------------

module.exports.config = {
	name: "sing",
	aliases: ["song"],
	premium: false,
	version: "3.3.0",
	hasPermssion: 0,
	credits: "rX | api from Bruxa",
	description: "search music by name..",
	commandCategory: "music",
	usages: "[song name]",
	cooldowns: 5,
	prefix: true
};

module.exports.run = async function ({ api, event, args, Users }) {
	const query = args.join(" ");
	if (!query) return api.sendMessage("❌ Enter song name", event.threadID, event.messageID);

	const processing = await sendMessageAsync(api, `⏳ Searching "${query}"...`, event.threadID);

	try {
		const search = await yts(query);
		if (!search.videos.length) {
			api.unsendMessage(processing.messageID);
			return api.sendMessage("❌ No results found", event.threadID, event.messageID);
		}

		const top = search.videos.slice(0, 6);
		const imageBuffer = await buildResultsImage(top);
		const imageFile = saveImageToTempFile(imageBuffer);

		api.unsendMessage(processing.messageID);

		try {
			const info = await sendMessageAsync(
				api,
				{
					body: `🔍 Results for "${query}"\n\n❮    Reply with a number (1-${top.length})\n❯`,
					attachment: fs.createReadStream(imageFile)
				},
				event.threadID
			);

			global.client.handleReply.push({
				name: module.exports.config.name,
				messageID: info.messageID,
				author: event.senderID,
				videos: top
			});

			return info;
		} finally {
			try {
				fs.unlinkSync(imageFile);
			} catch (err) {
				console.error("[sing] result-image cleanup error:", err.message);
			}
		}
	} catch (e) {
		console.error(e);
		api.unsendMessage(processing.messageID);
		return api.sendMessage("❌ Error: " + e.message, event.threadID, event.messageID);
	}
};

module.exports.handleReply = async function ({ api, event, Users }) {
	const replyID = event.messageReply?.messageID;
	const stored = global.client.handleReply.find(
		r => r.messageID === replyID && r.name === module.exports.config.name
	);
	if (!stored) return;

	if (event.senderID !== stored.author) {
		return api.sendMessage("⚠️ Not your request", event.threadID, event.messageID);
	}

	const choice = parseInt(event.body);
	if (isNaN(choice) || choice < 1 || choice > stored.videos.length) {
		return api.sendMessage("❌ Invalid choice", event.threadID, event.messageID);
	}

	// clear it out so the same reply can't be reused
	const idx = global.client.handleReply.indexOf(stored);
	if (idx !== -1) global.client.handleReply.splice(idx, 1);

	const video = stored.videos[choice - 1];
	const userName = await Users.getNameUser(event.senderID);
	const dlMsg = await sendMessageAsync(api, `⬇️ Downloading: ${video.title}`, event.threadID);

	try {
		await sendSong(api, event.threadID, video, `👤 Requested by: ${userName}\n`);
	} catch (err) {
		console.error(err);
		return api.sendMessage("❌ Download failed: " + extractApiErrorMessage(err), event.threadID, event.messageID);
	} finally {
		api.unsendMessage(dlMsg.messageID);
	}
};
