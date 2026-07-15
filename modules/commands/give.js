const fs = require("fs");
const path = require("path");
const axios = require("axios");

const VIP_FILE = path.join(__dirname, "vip.json");

// Create vip.json if not exists
if (!fs.existsSync(VIP_FILE)) {
  fs.writeFileSync(VIP_FILE, JSON.stringify(["61579782879961"], null, 2));
}

module.exports.config = {
  name: "give",
  version: "1.3",
  hasPermssion: 2,
  credits: "rX Abdullah",
  description: "Upload local command files to a pastebin service with VIP system.",
  commandCategory: "utility",
  usages: "[filename] [raw] | vip add | vip list",
  cooldowns: 5
};

module.exports.run = async function({ api, event, args }) {
  const { threadID, messageID, senderID, mentions, type, messageReply } = event;
  const vipList = JSON.parse(fs.readFileSync(VIP_FILE));

  // --- VIP SYSTEM ---
  if (args[0] && args[0].toLowerCase() === "vip") {
    const subCmd = args[1] ? args[1].toLowerCase() : "";

    // ➕ Add new VIP
    if (subCmd === "add") {
      if (senderID !== "100068565380737") {
        return api.sendMessage("❌ You don't have permission to add VIP users.", threadID, messageID);
      }

      let targetID;

      if (Object.keys(mentions).length > 0) {
        targetID = Object.keys(mentions)[0];
      } else if (type === "message_reply") {
        targetID = messageReply.senderID;
      } else {
        return api.sendMessage("⚠️ Mention or reply to the user you want to add as VIP.", threadID, messageID);
      }

      if (vipList.includes(targetID)) {
        return api.sendMessage("ℹ️ This user is already a VIP.", threadID, messageID);
      }

      vipList.push(targetID);
      fs.writeFileSync(VIP_FILE, JSON.stringify(vipList, null, 2));

      return api.sendMessage(`✅ Successfully added <@${targetID}> as VIP!`, threadID, messageID);
    }

    // 📋 Show VIP list
    if (subCmd === "list") {
      if (vipList.length === 0) {
        return api.sendMessage("📭 No VIPs found.", threadID, messageID);
      }

      let msg = "👑 VIP User List 👑\n\n";
      let mentionsList = [];

      for (let uid of vipList) {
        msg += `• @${uid}\n`;
        mentionsList.push({ tag: `@${uid}`, id: uid });
      }

      return api.sendMessage({ body: msg, mentions: mentionsList }, threadID, messageID);
    }

    // Unknown vip subcommand
    return api.sendMessage("⚠️ Invalid VIP command.\nUse: !give vip add | !give vip list", threadID, messageID);
  }

  // --- VIP CHECK ---
  if (!vipList.includes(senderID)) {
    return api.sendMessage("🚫 You are not a VIP user. You can't use this command.", threadID, messageID);
  }

  // --- FILE UPLOAD ---
  if (args.length === 0)
    return api.sendMessage("📁 Please provide a file name.\nUsage: !give <filename> [raw]", threadID, messageID);

  const fileName = args[0];
  const isRaw = args[1] && args[1].toLowerCase() === "raw";

  const commandsPath = path.join(__dirname, "..", "commands");
  const filePath1 = path.join(commandsPath, fileName);
  const filePath2 = path.join(commandsPath, fileName + ".js");

  let fileToRead;
  if (fs.existsSync(filePath1)) fileToRead = filePath1;
  else if (fs.existsSync(filePath2)) fileToRead = filePath2;
  else return api.sendMessage("❌ File not found in `commands` folder.", threadID, messageID);

  fs.readFile(fileToRead, "utf8", async (err, data) => {
    if (err) {
      console.error("❗ Read error:", err);
      return api.sendMessage("❗ Error reading the file.", threadID, messageID);
    }

    try {
      api.sendMessage("📤 Uploading file to PasteBin, please wait...", threadID, async (error, info) => {
        if (error) return console.error(error);

        const pastebinAPI = "https://pastebin-api.vercel.app";
        const response = await axios.post(`${pastebinAPI}/paste`, { text: data });

        setTimeout(() => api.unsendMessage(info.messageID), 1000);

        if (response.data && response.data.id) {
          const link = isRaw 
            ? `${pastebinAPI}/raw/${response.data.id}` 
            : `${pastebinAPI}/${response.data.id}`;

          return api.sendMessage(
            `📄 File: ${path.basename(fileToRead)}\n✅ Successfully uploaded:\n🔗 ${link}`,
            threadID
          );
        } else {
          console.error("⚠️ Unexpected API response:", response.data);
          return api.sendMessage("⚠️ Upload failed. No valid ID received from PasteBin server.", threadID);
        }
      });
    } catch (uploadError) {
      console.error("❌ Upload error:", uploadError);
      return api.sendMessage("❌ Failed to upload file:\n" + uploadError.message, threadID);
    }
  });
};
