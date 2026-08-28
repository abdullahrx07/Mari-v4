const axios = require("axios");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp"); 

module.exports.config = {
  name: "edit",
  version: "1.1.0",
  hasPermssion: 0,
  credits: "rX",
  description: "Edit image using Qwen API (supports 1 or 2 source images)",
  commandCategory: "AI",
  usages: "<text> (reply to an image) | -a <text> (reply to an image, then reply to the bot's message with a 2nd photo)",
  cooldowns: 30
};

const API_BASE = "https://qwen-xdi.onrender.com/edit";

function getReplyImageUrl(event) {
  if (
    event.messageReply &&
    event.messageReply.attachments &&
    event.messageReply.attachments[0]
  ) {
    return event.messageReply.attachments[0].url;
  }
  return null;
}

function getOwnImageUrl(event) {
  if (event.attachments && event.attachments[0]) {
    return event.attachments[0].url;
  }
  return null;
}

module.exports.run = async function ({ api, event, args }) {
  const addMode = args.length > 0 && (args[0] === "-a" || args[0] === "--add");
  const promptArgs = addMode ? args.slice(1) : args;
  const prompt = promptArgs.join(" ").trim();

  if (!prompt) {
    return api.sendMessage(
      addMode
        ? "⚠️ Usage: edit -a <text> (reply to an image)"
        : "⚠️ Please provide some text for the image.",
      event.threadID,
      event.messageID
    );
  }

  const imgUrl = getReplyImageUrl(event);
  if (!imgUrl) {
    return api.sendMessage(
      "⚠️ Please reply to an image.",
      event.threadID,
      event.messageID
    );
  }

  api.setMessageReaction("🐣", event.messageID, () => {}, true);

  if (!addMode) {
    return runEditRequest({ api, event, prompt, imageUrls: [imgUrl], reactionMsgID: event.messageID });
  }

  api.sendMessage(
    "📷 𝐀𝐝𝐝 𝐚𝐧𝐨𝐭𝐡𝐞𝐫 𝐩𝐡𝐨𝐭𝐨 — reply to this message with the 2nd image.",
    event.threadID,
    (err, info) => {
      if (err || !info) {
        api.setMessageReaction("❌", event.messageID, () => {}, true);
        return;
      }

      const client = (global.client && global.client) || null;
      if (client && Array.isArray(client.handleReply)) {
        client.handleReply.push({
          name: module.exports.config.name,
          messageID: info.messageID,
          author: event.senderID,
          prompt,
          imageUrls: [imgUrl],
          reactionMsgID: event.messageID,
        });
      }
    },
    event.messageID
  );
};

module.exports.handleReply = async function ({ api, event, handleReply }) {
  if (event.senderID !== handleReply.author) {
    return;
  }

  const secondUrl = getOwnImageUrl(event);
  if (!secondUrl) {
    return api.sendMessage(
      "⚠️ Please reply to this message with a photo (image attachment).",
      event.threadID,
      event.messageID
    );
  }

  return runEditRequest({
    api,
    event,
    prompt: handleReply.prompt,
    imageUrls: [...handleReply.imageUrls, secondUrl],
    reactionMsgID: handleReply.reactionMsgID,
  });
};

/** Shared: build the backend request and send back the edited image. */
async function runEditRequest({ api, event, prompt, imageUrls, reactionMsgID }) {
  try {
    const params = new URLSearchParams();
    params.set("image", imageUrls[0]);
    if (imageUrls[1]) params.set("image2", imageUrls[1]);
    params.set("prompt", prompt);

    const requestURL = `${API_BASE}?${params.toString()}`;
    console.log("🔗 Request URL:", requestURL);

    const res = await axios.get(requestURL, { timeout: 120000 });
    console.log("📦 Full API response status:", res.status);
    console.log("📦 Full API response data:", JSON.stringify(res.data, null, 2));

    const data = res.data;
    const finalImageURL = data && data.success ? data.imageUrl : null;

    if (!finalImageURL) {
      const errMsg = (data && (data.error || data.message)) || "Unknown reason";
      console.log("❌ Failed. success:", data && data.success, "| reason:", errMsg);
      api.setMessageReaction("⚠️", reactionMsgID, () => {}, true);
      return api.sendMessage(
        `❌ API Error: ${errMsg}`,
        event.threadID,
        event.messageID
      );
    }

    const cacheDir = path.join(__dirname, "cache");
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir);

    // Download raw bytes into a buffer first (not streamed to disk directly)
    // so we can normalize/convert the format before writing.
    const imageResponse = await axios.get(finalImageURL, {
      responseType: "arraybuffer",
      timeout: 60000
    });

    const rawBuffer = Buffer.from(imageResponse.data);
    const filePath = path.join(cacheDir, `${Date.now()}.jpg`);

    // Convert whatever format the API returned (png/webp/etc.) into a
    // guaranteed valid JPG. This fixes cases where the API silently
    // returns a format/extension mismatch that breaks sending.
    try {
      await sharp(rawBuffer)
        .flatten({ background: "#ffffff" }) // handle transparency -> white bg for JPG
        .jpeg({ quality: 92 })
        .toFile(filePath);
    } catch (convErr) {
      console.log("⚠️ sharp conversion failed, falling back to raw bytes:", convErr.message);
      fs.writeFileSync(filePath, rawBuffer);
    }

    api.setMessageReaction("🧃", reactionMsgID, () => {}, true);
    api.sendMessage(
      {
        body: "> 🎀 𝐃𝐨𝐧𝐞",
        attachment: fs.createReadStream(filePath)
      },
      event.threadID,
      () => fs.unlinkSync(filePath)
    );
  } catch (err) {
    if (err.response) {
      console.log("❌ ERROR status:", err.response.status);
      console.log("❌ ERROR data:", err.response.data ? err.response.data.toString() : err.response.data);
    } else if (err.request) {
      console.log("❌ ERROR: No response received —", err.message);
    } else {
      console.log("❌ ERROR:", err.message);
    }
    api.setMessageReaction("❌", reactionMsgID, () => {}, true);
    api.sendMessage(
      "❌ Error while processing the image.",
      event.threadID,
      event.messageID
    );
  }
}
