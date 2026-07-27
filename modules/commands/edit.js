const axios = require("axios");

module.exports.config = {
  name: "edit",
  version: "1.0.0",
  hasPermssion: 0,
  credits: "rX",
  description: "Meta AI Image Generation & Editing API command",
  commandCategory: "𝗜𝗠𝗔𝗚𝗘 𝗚𝗘𝗡𝗘𝗥𝗔𝗧𝗢𝗥",
  usages: "Reply to a photo to edit it, or use directly to generate images.",
  cooldowns: 5,
  dependencies: {
    "axios": ""
  }
};

async function getStreamFromURL(url) {
  const res = await axios({
    url,
    responseType: "stream",
    timeout: 180000
  });
  return res.data;
}

module.exports.run = async function ({ api, event, args }) {
  const prompt = args.join(" ");
  if (!prompt) {
    return api.sendMessage("❌ Please provide a prompt.", event.threadID, event.messageID);
  }

  let waitMessage;
  try {
    waitMessage = await api.sendMessage("⌛ Processing request, please wait...", event.threadID, event.messageID);
    if (typeof api.setMessageReaction === "function") {
      api.setMessageReaction("⌛", event.messageID, () => {}, true);
    }

    const replyAttachments = (event.messageReply && event.messageReply.attachments) || [];
    let attachment = replyAttachments[0];

    if (attachment && attachment.isE2EE && !(attachment.url && /^https?:\/\//.test(attachment.url)) && typeof api.resolveE2EEAttachment === 'function') {
      attachment = await api.resolveE2EEAttachment(attachment);
    }

    const imageUrl = attachment ? attachment.url : null;
    let response;

    if (imageUrl) {
      response = await axios.post("https://meta-image.onrender.com/edit", {
        prompt,
        imageUrl
      });
    } else {
      response = await axios.post("https://meta-image.onrender.com/generate", {
        prompt
      });
    }

    if (!response.data || !response.data.images || response.data.images.length === 0) {
      throw new Error("No images returned from API.");
    }

    const imageStreams = [];
    for (const img of response.data.images) {
      try {
        const stream = await getStreamFromURL(img.url);
        imageStreams.push(stream);
      } catch (err) {
        console.error("Failed to download image: " + img.url, err);
      }
    }

    if (imageStreams.length === 0) {
      throw new Error("Failed to download any generated images.");
    }

    if (typeof api.setMessageReaction === "function") {
      api.setMessageReaction("✅", event.messageID, () => {}, true);
    }
    if (waitMessage && waitMessage.messageID) {
      api.unsendMessage(waitMessage.messageID);
    }

    const bodyText = imageUrl
      ? `✅ Edited successfully!`
      : `✅ Generated successfully!`;

    await api.sendMessage({
      body: bodyText,
      attachment: imageStreams
    }, event.threadID, event.messageID);

  } catch (error) {
    console.error(error);
    if (typeof api.setMessageReaction === "function") {
      api.setMessageReaction("❌", event.messageID, () => {}, true);
    }
    if (waitMessage && waitMessage.messageID) {
      api.unsendMessage(waitMessage.messageID);
    }
    api.sendMessage(`❌ Error: ${error.message || error}`, event.threadID, event.messageID);
  }
};
