const fs = require("fs");
const path = require("path");
const axios = require("axios");

module.exports.config = {
  name: "theme",
  version: "3.9.0",
  hasPermssion: 2,
  credits: "rX",
  description: "Search AI/custom themes, apply by fbid, or check current theme info",
  commandCategory: "system",
  usages: "!theme <prompt> | !theme set <fbid> | !theme info",
  cooldowns: 5
};

const CACHE_DIR = path.join(__dirname, "..", "cache");
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

async function downloadImage(url, filename) {
  const filePath = path.join(CACHE_DIR, filename);
  try {
    const res = await axios.get(url, { responseType: "arraybuffer", timeout: 15000 });
    fs.writeFileSync(filePath, Buffer.from(res.data));
    return filePath;
  } catch {
    return null;
  }
}

module.exports.run = async function({ api, event, args }) {
  const { threadID, senderID } = event;
  if (!args.length) return api.sendMessage("❌ Usage: !theme <prompt>\n❌ Or: !theme set <fbid>\n❌ Or: !theme info", threadID);

  if (args[0].toLowerCase() === "set") {
    const themeID = args[1];
    if (!themeID) return api.sendMessage("❌ Usage: !theme set <fbid>", threadID);
    if (typeof api.setThreadThemeMqtt !== "function") {
      return api.sendMessage("⚠️ Bot does not support setThreadThemeMqtt.", threadID);
    }
    try {
      await api.setThreadThemeMqtt(threadID, themeID);
      return api.sendMessage(`✅ Theme applied successfully!\nTheme ID: ${themeID}`, threadID);
    } catch (err) {
      return api.sendMessage(`⚠️ Failed to apply theme: ${err.message || err}`, threadID);
    }
  }

  if (args[0].toLowerCase() === "info") {
    try {
      api.sendMessage("⏳ Fetching current theme...", threadID);

      const threadInfo = await api.getThreadInfo(threadID);
      const theme = threadInfo.threadTheme;
      if (!theme) return api.sendMessage("ℹ️ Using default theme (no custom theme set)", threadID);

      const themeId = theme.id || theme.theme_fbid || "Unknown";
      let colorInfo = threadInfo.color || theme.accessibility_label || "Unknown";
      const attachments = [];
      const extractUrl = (obj) => obj?.uri || obj?.url || (typeof obj === "string" ? obj : null);

      try {
        const currentThemeData = await api.getThemeInfo(themeId);
        if (currentThemeData) {
          if (currentThemeData.name) colorInfo = currentThemeData.name;
          const bgUrl = extractUrl(currentThemeData.backgroundImage);
          if (bgUrl) {
            const file = await downloadImage(bgUrl, `theme_info_${Date.now()}.jpg`);
            if (file) attachments.push(fs.createReadStream(file));
          }
        }
      } catch {}

      const body = attachments.length > 0
        ? `🎨 Theme ID: ${themeId}\nColor: ${colorInfo}\n\nPreview:`
        : `🎨 Theme ID: ${themeId}\nColor: ${colorInfo}`;

      return api.sendMessage({
        body,
        attachment: attachments.length > 0 ? attachments : undefined
      }, threadID);
    } catch (error) {
      return api.sendMessage(`⚠️ Error: ${error.message || error}`, threadID);
    }
  }

  const prompt = args.join(" ");
  let themes = [];

  const customThemes = [
    { name: "Sunset Vibes", id: "custom_001", preview_image_urls: { light_mode: "https://link.com/light1.jpg" } },
    { name: "Ocean Blue", id: "custom_002", preview_image_urls: { light_mode: "https://link.com/light2.jpg" } }
  ];
  themes.push(...customThemes.filter(t => t.name.toLowerCase().includes(prompt.toLowerCase())));

  if (typeof api.createAITheme === "function") {
    try {
      const aiThemes = await api.createAITheme(prompt, 5);
      themes.push(...aiThemes);
    } catch {}
  }

  if (!themes.length) return api.sendMessage("⚠️ No themes found.", threadID);

  const bodyText = `🎨 Themes for "${prompt}"\nReply with option number to apply.`;
  const attachments = [];

  for (let i = 0; i < themes.length; i++) {
    const t = themes[i];
    const lightURL = t.preview_image_urls?.light_mode || t.image_url;
    if (lightURL) {
      const file = await downloadImage(lightURL, `theme_${i+1}_${Date.now()}.jpg`);
      if (file) attachments.push(fs.createReadStream(file));
    }
  }

  api.sendMessage({ body: bodyText, attachment: attachments }, threadID, (err, info) => {
    if (err) return;
    if (!global.client.handleReply) global.client.handleReply = [];
    global.client.handleReply.push({
      type: "theme_selection",
      name: module.exports.config.name,
      author: senderID,
      messageID: info.messageID,
      threadID,
      themes
    });
  });
};

module.exports.handleReply = async function({ api, event, handleReply }) {
  const { threadID, senderID, body } = event;

  if (senderID !== handleReply.author) return;
  const num = parseInt(body);
  if (isNaN(num) || num < 1 || num > handleReply.themes.length)
    return api.sendMessage("⚠️ Invalid reply. Reply with a number from the list.", threadID);

  const selected = handleReply.themes[num-1];
  const themeID = selected.fbid || selected.id || selected.theme_fbid;
  if (!themeID) return api.sendMessage("⚠️ Cannot find theme ID.", threadID);

  const index = global.client.handleReply.findIndex(r => r.messageID === handleReply.messageID);
  if (index > -1) global.client.handleReply.splice(index, 1);

  try {
    if (typeof api.unsendMessage === "function") {
      await api.unsendMessage(handleReply.messageID);
    }

    if (typeof api.setThreadThemeMqtt === "function") {
      await api.setThreadThemeMqtt(threadID, themeID);
      api.sendMessage(`✅ Theme applied successfully!`, threadID);
    } else {
      api.sendMessage("⚠️ Bot does not support setThreadThemeMqtt.", threadID);
    }
  } catch (err) {
    api.sendMessage(`⚠️ Failed to apply theme: ${err.message || err}`, threadID);
  }
};
