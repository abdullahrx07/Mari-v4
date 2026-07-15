const axios = require("axios");
const fs = require("fs");
const path = require("path");

module.exports.config = {
  name: "edit",
  version: "1.0.3",
  hasPermssion: 0,
  credits: "rX",
  description: "Edit image using NanoBanana API",
  commandCategory: "AI",
  usages: "<text> (reply to an image)",
  cooldowns: 30
};

module.exports.run = async function ({ api, event, args }) {
  const prompt = args.join(" ");

  if (!prompt) {
    return api.sendMessage(
      "⚠️ Please provide some text for the image.",
      event.threadID,
      event.messageID
    );
  }

  api.setMessageReaction("🐣", event.messageID, () => {}, true);

  try {
    if (
      !event.messageReply ||
      !event.messageReply.attachments ||
      !event.messageReply.attachments[0]
    ) {
      return api.sendMessage(
        "⚠️ Please reply to an image.",
        event.threadID,
        event.messageID
      );
    }

    const imgUrl = event.messageReply.attachments[0].url;

    const requestURL =
      `https://edit-api.vercel.app/nanobanana` +
      `?prompt=${encodeURIComponent(prompt)}` +
      `&imageUrl=${encodeURIComponent(imgUrl)}`;

    const res = await axios.get(requestURL);

    if (
      !res.data ||
      !res.data.success ||
      !res.data.result ||
      !res.data.result[0]
    ) {
      api.setMessageReaction("⚠️", event.messageID, () => {}, true);
      return api.sendMessage(
        "❌ API Error: Image data not received.",
        event.threadID
      );
    }

    const finalImageURL = res.data.result[0];
    const imageData = await axios.get(finalImageURL, {
      responseType: "arraybuffer"
    });

    const cacheDir = path.join(__dirname, "cache");
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir);

    const filePath = path.join(cacheDir, `${Date.now()}.png`);
    fs.writeFileSync(filePath, Buffer.from(imageData.data));

    api.setMessageReaction("🧃", event.messageID, () => {}, true);

    api.sendMessage(
      {
        body: "> 🎀 𝐃𝐨𝐧𝐞",
        attachment: fs.createReadStream(filePath)
      },
      event.threadID,
      () => fs.unlinkSync(filePath)
    );

  } catch (err) {
    console.log("❌ ERROR:", err);
    api.setMessageReaction("❌", event.messageID, () => {}, true);
    api.sendMessage(
      "❌ Error while processing the image.",
      event.threadID
    );
  }
};
