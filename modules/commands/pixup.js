const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");
const path = require("path");

module.exports.config = {
  name: "pixup",
  version: "2.0.1",
  hasPermssion: 0,
  credits: "rX", // Combined pixup + pixlist by rX Abdullah
  description: "Upload file to Pixeldrain OR List uploaded file IDs",
  commandCategory: "tool",
  usages: "[reply to file] or [listofpix]",
  cooldowns: 5,
};

module.exports.run = async function ({ api, event, args }) {
  const { messageReply, threadID, messageID } = event;
  const apiKey = "11379c5d-5de2-42b5-b1e2-8a378e3c2812";

  // ==== (1) Handle: !listofpix ====
  if (event.body && event.body.toLowerCase().startsWith("!listofpix")) {
    try {
      const res = await axios.get("https://pixeldrain.com/api/user/files", {
        headers: { Authorization: apiKey }
      });

      const files = res.data.files;
      if (!files || files.length === 0) {
        return api.sendMessage("⚠️ No uploaded files found in your Pixeldrain account.", threadID, messageID);
      }

      const fileList = files.map((file, index) => `${index + 1}. ${file.id}`).join("\n");
      return api.sendMessage(`📄 Total Files: ${files.length}\n\n${fileList}`, threadID, messageID);

    } catch (error) {
      return api.sendMessage(`❌ Failed to fetch file list.\nError: ${error.message}`, threadID, messageID);
    }
  }

  // ==== (2) Handle: !pixup (file upload) ====
  if (!messageReply || !messageReply.attachments || messageReply.attachments.length === 0) {
    return api.sendMessage("⚠️ Please reply to a video, photo, or file to upload to Pixeldrain.", threadID, messageID);
  }

  const reloadMsg = await api.sendMessage("[OK] Uploading to Pixeldrain...", threadID);
  await new Promise(resolve => setTimeout(resolve, 2000));
  await api.unsendMessage(reloadMsg.messageID);

  const attachment = messageReply.attachments[0];
  const url = attachment.url;
  const ext = path.extname(url) || ".mp4";
  const customName = args.join(" ") || `file_${Date.now()}`;
  const tempFile = path.join(__dirname, `/tmp_${Date.now()}${ext}`);

  try {
    const file = (await axios.get(url, { responseType: "stream" })).data;
    const writer = fs.createWriteStream(tempFile);
    file.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    const form = new FormData();
    form.append("file", fs.createReadStream(tempFile));
    form.append("name", customName + ext);

    const uploadRes = await axios.post("https://pixeldrain.com/api/file/", form, {
      headers: {
        ...form.getHeaders(),
        "Authorization": "Basic " + Buffer.from(`:${apiKey}`).toString("base64")
      }
    });

    fs.unlinkSync(tempFile);

    if (!uploadRes.data || !uploadRes.data.id) {
      return api.sendMessage("❌ Upload failed. Try again later.", threadID, messageID);
    }

    const fileId = uploadRes.data.id;
    const infoRes = await axios.get(`https://pixeldrain.com/api/file/${fileId}/info`);
    const info = infoRes.data;

    const link = `https://pixeldrain.com/u/${fileId}`;
    const sizeMB = (info.size / (1024 * 1024)).toFixed(2);

    return api.sendMessage(
      `✅ **File Uploaded Successfully!**\n` +
      `📄 Name: rX Project\n` +
      `📦 Size: ${sizeMB} MB\n` +
      `🆔 ID: ${info.id}\n` +
      `🔗 Link: ${link}`,
      threadID
    );

  } catch (err) {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    return api.sendMessage(`❌ Error: ${err.message}`, threadID, messageID);
  }
};
