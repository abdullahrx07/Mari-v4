const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

const TIKTOK_SEARCH_API = "https://lyric-search-neon.vercel.app/kshitiz?keyword=";
const CACHE_DIR = path.join(__dirname, "cache_tiktok");

async function getStreamFromURL(url) {
  const res = await axios({
    url,
    responseType: "stream",
    timeout: 180000
  });
  return res.data;
}

module.exports.config = {
  name: "tiktok",
  version: "1.0.0",
  credits: "rX", //api by Neoaz ゐ
  hasPermssion: 0,
  description: "Search & download TikTok video",
  commandCategory: "media",
  usages: "tiktok <keyword>",
  cooldowns: 5
};

module.exports.run = async function ({ api, event, args }) {
  const query = args.join(" ");
  if (!query)
    return api.sendMessage(
      "❌ Please provide a search keyword.",
      event.threadID,
      event.messageID
    );

  try {
    api.sendMessage(
      "🔍 Searching TikTok for: " + query,
      event.threadID,
      event.messageID
    );

    const res = await axios.get(
      TIKTOK_SEARCH_API + encodeURIComponent(query),
      { timeout: 20000 }
    );

    const results = res.data.slice(0, 6);
    if (!results.length)
      return api.sendMessage(
        "❌ No videos found.",
        event.threadID,
        event.messageID
      );

    let body = "";
    const thumbs = [];

    results.forEach((v, i) => {
      body += `${i + 1}. ${v.title.substring(0, 60)}...\n`;
      body += `👤 @${v.author.unique_id}\n`;
      body += `⏱ ${v.duration}s\n\n`;
      if (v.cover) thumbs.push(getStreamFromURL(v.cover));
    });

    const attachments = (await Promise.all(thumbs)).filter(Boolean);

    api.sendMessage(
      {
        body:
          `📹 Found ${results.length} videos\n\n` +
          body +
          `Reply with number (1-${results.length}) to download.`,
        attachment: attachments
      },
      event.threadID,
      (err, info) => {
        if (err) return;

        global.client.handleReply.push({
          name: module.exports.config.name,
          messageID: info.messageID,
          author: event.senderID,
          results
        });
      },
      event.messageID
    );
  } catch (e) {
    console.error(e);
    api.sendMessage(
      "❌ TikTok search failed.",
      event.threadID,
      event.messageID
    );
  }
};

module.exports.handleReply = async function ({ api, event, handleReply }) {
  if (event.senderID !== handleReply.author) return;

  const choice = parseInt(event.body);
  if (isNaN(choice) || choice < 1 || choice > handleReply.results.length)
    return api.sendMessage(
      "❌ Invalid number.",
      event.threadID,
      event.messageID
    );

  const video = handleReply.results[choice - 1];
  api.unsendMessage(handleReply.messageID);

  try {
    await fs.ensureDir(CACHE_DIR);

    const safeName = video.title
      .replace(/[^a-z0-9]/gi, "_")
      .substring(0, 25);

    const filePath = path.join(
      CACHE_DIR,
      `${Date.now()}_${safeName}.mp4`
    );

    api.sendMessage("> 🎀 𝐩𝐥𝐞𝐚𝐬𝐞 𝐰𝐚𝐢𝐭 ...", event.threadID);

    const res = await axios({
      url: video.videoUrl,
      responseType: "stream",
      timeout: 300000
    });

    const writer = fs.createWriteStream(filePath);
    res.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    api.sendMessage(
      {
        body:
          `✅ Downloaded\n\n` +
          `🎬 ${video.title}\n` +
          `👤 @${video.author.unique_id}\n` +
          `⏱ ${video.duration}s`,
        attachment: fs.createReadStream(filePath)
      },
      event.threadID,
      () => fs.unlinkSync(filePath),
      event.messageID
    );
  } catch (e) {
    console.error(e);
    api.sendMessage(
      "❌ Failed to download video.",
      event.threadID,
      event.messageID
    );
  }
};
