const axios = require("axios");
const yts = require("yt-search");
const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");

const CACHE_DIR = path.join(__dirname, "cache");
const FONT_PATH = path.join(__dirname, "wall", "NotoSans-Regular.ttf");
const FONT_FAMILY = "NotoSans";

try {
	if (fs.existsSync(FONT_PATH)) {
		GlobalFonts.registerFromPath(FONT_PATH, FONT_FAMILY);
	} else {
		console.warn(`[sing] Font file paoa jayni: ${FONT_PATH}`);
	}
} catch (err) {
	console.error("[sing] Font register korte error:", err.message);
}

const DL_API_BASE = "https://ytdl-api-xdi.onrender.com/api/dl";

// -------------------------
// 🔎 Info fetchers (small JSON responses only)
// -------------------------
async function fetchSongInfo(videoUrl) {
	const infoRes = await axios.get(DL_API_BASE, {
		params: { link: videoUrl, format: "mp3" },
		timeout: 60000
	});

	const data = infoRes.data;
	if (!data?.downloadUrl) {
		throw new Error(data?.error || "downloadUrl paoa jayni API response e");
	}
	return data; // { downloadUrl, title, author }
}

async function fetchVideoUrl(videoUrl) {
	const infoRes = await axios.get(DL_API_BASE, {
		params: { link: videoUrl, format: "mp4" },
		timeout: 60000
	});

	const data = infoRes.data;
	if (!data?.downloadUrl) {
		throw new Error(data?.error || "Video downloadUrl paoa jayni API response e");
	}

	return {
		downloadUrl: data.downloadUrl,
		title: data.title,
		author: data.author
	};
}

// -------------------------
// ⬇️ Stream download straight to disk — RAM stays flat regardless of file size
// downloadUrl ekhon API-r nijer converter service theke ashe (temporary signed URL),
// tai kono specific upstream (y2mate/etacloud) domain-spoofed Referer/Origin lagbe na —
// generic browser UA e kaj hobe.
// -------------------------
async function streamDownloadToFile(dlUrl, filePath) {
	if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

	const response = await axios.get(dlUrl, {
		responseType: "stream",
		timeout: 300000,
		maxContentLength: Infinity,
		maxBodyLength: Infinity,
		headers: {
			"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1"
		}
	});

	// ✅ Content-Type চেক — video/audio না হলে সাথে সাথে reject করো (broken/garbage response ধরার জন্য)
	const contentType = response.headers["content-type"] || "";
	const isValid = contentType.includes("video") || contentType.includes("audio") || contentType.includes("octet-stream");

	if (!isValid) {
		// ✅ CDN error/text page dile actual body ta pore real reason ber koro (debug er jonno)
		let bodyText = "";
		try {
			const chunks = [];
			for await (const chunk of response.data) {
				chunks.push(chunk);
				if (Buffer.concat(chunks).length > 2000) break; // beshi boro hole read off koro
			}
			bodyText = Buffer.concat(chunks).toString("utf-8").slice(0, 500);
		} catch (_) {}

		throw new Error(
			`Invalid content received from downloadUrl (type: ${contentType})` +
			(bodyText ? ` — upstream said: "${bodyText.trim()}"` : "")
		);
	}

	const writer = fs.createWriteStream(filePath);

	await new Promise((resolve, reject) => {
		response.data.pipe(writer);
		let failed = false;
		const onError = (err) => {
			if (failed) return;
			failed = true;
			writer.close();
			fs.unlink(filePath, () => {});
			reject(err);
		};
		response.data.on("error", onError);
		writer.on("error", onError);
		writer.on("close", () => { if (!failed) resolve(); });
	});

	// ✅ Download শেষে file size খুব ছোট হলে reject করো (corrupt/empty file catch)
	const stats = fs.statSync(filePath);
	if (stats.size < 1024) {
		fs.unlink(filePath, () => {});
		throw new Error(`Downloaded file too small (${stats.size} bytes) — corrupt ba failed download`);
	}
}

// ✅ Fix: axios default e JSON error response already-parsed OBJECT hishebe ashe
// (Buffer na), tai age Buffer.from(object) call hole silently fail kore real
// README-defined error message (e.g. "link must be a valid YouTube URL",
// "Unable to generate a download URL") kokhono dekha jeto na.
function extractApiErrorMessage(err) {
	const raw = err.response?.data;

	if (raw && typeof raw === "object" && !Buffer.isBuffer(raw)) {
		if (raw.error) return raw.error;
		if (raw.message) return raw.message;
	}

	if (raw) {
		try {
			const text = Buffer.isBuffer(raw) ? raw.toString("utf-8") : String(raw);
			const parsed = JSON.parse(text);
			if (parsed?.error) return parsed.error;
			if (parsed?.message) return parsed.message;
		} catch (_) {}
	}

	return err.message;
}

// small buffer-based helper — শুধু tiny results-image PNG এর জন্য
function saveToTempFile(buffer, ext) {
	if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
	const file = path.join(CACHE_DIR, `sing_${Date.now()}.${ext}`);
	fs.writeFileSync(file, buffer);
	return file;
}

// path generator for stream downloads (no buffer involved)
function tempFilePath(ext) {
	if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
	return path.join(CACHE_DIR, `sing_${Date.now()}_${Math.floor(Math.random() * 1e4)}.${ext}`);
}

function sendMessageAsync(api, msg, threadID, messageID) {
	return new Promise((resolve, reject) => {
		api.sendMessage(msg, threadID, (err, info) => {
			if (err) return reject(err);
			resolve(info);
		}, messageID);
	});
}

// ✅ 408/timeout hole ekbar retry kore
async function sendMessageWithRetry(api, msg, threadID, retries = 2) {
	for (let i = 0; i <= retries; i++) {
		try {
			return await sendMessageAsync(api, msg, threadID);
		} catch (err) {
			const is408 = err?.error === 408 || String(err?.message || err).includes("408");
			if (is408 && i < retries) {
				console.warn(`[sing] Upload timeout, retrying (${i + 1}/${retries})...`);
				await new Promise(r => setTimeout(r, 2000));
				continue;
			}
			throw err;
		}
	}
}

async function sendSong(api, threadID, video, captionExtra) {
	const info = await fetchSongInfo(video.url);
	const file = tempFilePath("mp3");

	await streamDownloadToFile(info.downloadUrl, file);

	try {
		await sendMessageWithRetry(api, {
			body: `🎶 ${video.title}\n${captionExtra}🕒 ${video.timestamp}`,
			attachment: fs.createReadStream(file)
		}, threadID);
	} finally {
		try { fs.unlinkSync(file); } catch (err) { console.error("[sing] audio cleanup error:", err.message); }
	}
}

// ✅ signed URL flaky (link expire) hote pare — tai 1 retry soho fresh link niye abar try kore
async function sendVideo(api, threadID, video, captionExtra) {
	const file = tempFilePath("mp4");
	let lastErr;

	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const { downloadUrl } = await fetchVideoUrl(video.url); // fresh link every attempt
			await streamDownloadToFile(downloadUrl, file);
			lastErr = null;
			break;
		} catch (err) {
			lastErr = err;
			if (attempt === 0) {
				console.warn(`[sing] video download attempt 1 failed (${err.message}), retrying with fresh link...`);
				await new Promise(r => setTimeout(r, 1500));
			}
		}
	}

	if (lastErr) throw lastErr;

	const caption = `🎬 ${video.title}\n${captionExtra}🕒 ${video.timestamp}`;
	try {
		await sendMessageWithRetry(api, {
			body: caption,
			attachment: fs.createReadStream(file)
		}, threadID);
	} finally {
		try { fs.unlinkSync(file); } catch (err) { console.error("[sing] video cleanup:", err.message); }
	}
}

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
	const THUMB_H = 112;
	const PADDING = 16;
	const ROW_H = THUMB_H + PADDING * 2;
	const WIDTH = 760;
	const HEIGHT = ROW_H * videos.length;

	const canvas = createCanvas(WIDTH, HEIGHT);
	const ctx = canvas.getContext("2d");

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

module.exports.config = {
	name: "sing",
	aliases: ["song", "video"],
	premium: false,
	version: "4.0.8",
	hasPermssion: 0,
	credits: "rX",
	description: "Search and download music or video from YouTube",
	commandCategory: "music",
	usages: "[-a | -v] [song name]",
	cooldowns: 5,
	prefix: true
};

module.exports.run = async function ({ api, event, args, Users }) {
	const flag = args[0]?.toLowerCase();
	const isAudio = flag === "-a";
	const isVideo = flag === "-v";
	const hasFlag = isAudio || isVideo;

	if (!args.length) {
		return api.sendMessage(
			`🎵 Sing Command Usage:\n\n` +
			`!sing -a <song name>\n` +
			` └ Audio download (mp3)\n\n` +
			`!sing -v <song name>\n` +
			` └ Video results → reply with number to download (mp4)\n\n` +
			`Example:\n` +
			` !sing -a shape of you\n` +
			` !sing -v believer imagine dragons`,
			event.threadID,
			event.messageID
		);
	}

	if (hasFlag && args.length < 2) {
		return api.sendMessage(
			`❌ Please provide a song name after ${flag}\nExample: !sing ${flag} song name`,
			event.threadID,
			event.messageID
		);
	}

	if (!hasFlag) {
		const query = args.join(" ");
		const processing = await sendMessageAsync(api, `⏳ Searching "${query}"...`, event.threadID);
		try {
			const search = await yts(query);
			if (!search.videos.length) {
				api.unsendMessage(processing.messageID);
				return api.sendMessage("❌ No results found", event.threadID, event.messageID);
			}
			const video = search.videos[0];
			api.unsendMessage(processing.messageID);
			const dlMsg = await sendMessageAsync(api, `⬇️ Downloading: ${video.title}`, event.threadID);
			const typing = setInterval(() => { try { api.sendTypingIndicator(event.threadID); } catch (_) {} }, 10000);
			try {
				await sendSong(api, event.threadID, video, `🎧 Audio | `);
			} catch (err) {
				console.error(err);
				return api.sendMessage("❌ Download failed: " + extractApiErrorMessage(err), event.threadID, event.messageID);
			} finally {
				clearInterval(typing);
				api.unsendMessage(dlMsg.messageID);
			}
		} catch (e) {
			console.error(e);
			api.unsendMessage(processing.messageID);
			return api.sendMessage("❌ Error: " + e.message, event.threadID, event.messageID);
		}
		return;
	}

	const query = args.slice(1).join(" ");
	const processing = await sendMessageAsync(api, `⏳ Searching "${query}"...`, event.threadID);

	try {
		const search = await yts(query);
		if (!search.videos.length) {
			api.unsendMessage(processing.messageID);
			return api.sendMessage("❌ No results found", event.threadID, event.messageID);
		}

		if (isAudio) {
			const top = search.videos.slice(0, 6);
			const imageBuffer = await buildResultsImage(top);
			const imageFile = saveToTempFile(imageBuffer, "png");

			api.unsendMessage(processing.messageID);

			try {
				const info = await sendMessageAsync(
					api,
					{
						body: `🔍 Audio results for "${query}"\n\n❮ Reply with a number (1-${top.length}) to download ❯`,
						attachment: fs.createReadStream(imageFile)
					},
					event.threadID
				);

				global.client.handleReply.push({
					name: module.exports.config.name,
					messageID: info.messageID,
					author: event.senderID,
					videos: top,
					mode: "audio"
				});

				return info;
			} finally {
				try { fs.unlinkSync(imageFile); } catch (err) { console.error("[sing] result-image cleanup error:", err.message); }
			}
		}

		if (isVideo) {
			const top = search.videos.slice(0, 6);
			const imageBuffer = await buildResultsImage(top);
			const imageFile = saveToTempFile(imageBuffer, "png");

			api.unsendMessage(processing.messageID);

			try {
				const info = await sendMessageAsync(
					api,
					{
						body: `🔍 Video results for "${query}"\n\n❮ Reply with a number (1-${top.length}) to download ❯`,
						attachment: fs.createReadStream(imageFile)
					},
					event.threadID
				);

				global.client.handleReply.push({
					name: module.exports.config.name,
					messageID: info.messageID,
					author: event.senderID,
					videos: top,
					mode: "video"
				});

				return info;
			} finally {
				try { fs.unlinkSync(imageFile); } catch (err) { console.error("[sing] result-image cleanup error:", err.message); }
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

	const idx = global.client.handleReply.indexOf(stored);
	if (idx !== -1) global.client.handleReply.splice(idx, 1);

	const video = stored.videos[choice - 1];
	const userName = await Users.getNameUser(event.senderID);
	const mode = stored.mode || "audio";

	if (mode === "video") {
		const dlMsg = await sendMessageAsync(api, `⬇️ Downloading video: ${video.title}`, event.threadID);
		const typing = setInterval(() => { try { api.sendTypingIndicator(event.threadID); } catch (_) {} }, 10000);
		try {
			await sendVideo(api, event.threadID, video, `👤 Requested by: ${userName}\n`);
		} catch (err) {
			console.error(err);
			return api.sendMessage("❌ Video download failed: " + extractApiErrorMessage(err), event.threadID, event.messageID);
		} finally {
			clearInterval(typing);
			api.unsendMessage(dlMsg.messageID);
		}
	} else {
		const dlMsg = await sendMessageAsync(api, `⬇️ Downloading: ${video.title}`, event.threadID);
		const typing = setInterval(() => { try { api.sendTypingIndicator(event.threadID); } catch (_) {} }, 10000);
		try {
			await sendSong(api, event.threadID, video, `👤 Requested by: ${userName}\n`);
		} catch (err) {
			console.error(err);
			return api.sendMessage("❌ Download failed: " + extractApiErrorMessage(err), event.threadID, event.messageID);
		} finally {
			clearInterval(typing);
			api.unsendMessage(dlMsg.messageID);
		}
	}
};
