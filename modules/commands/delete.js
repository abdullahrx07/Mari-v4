const axios = require("axios");

module.exports.config = {
  name: "delete",
  version: "1.0.0",
  hasPermssion: 1,   // শুধু admin/owner use করতে পারবে
  credits: "rX Abdullah",
  description: "Delete a trigger (ask) from server",
  commandCategory: "admin",
  usages: "!delete <trigger>",
  cooldowns: 5
};

module.exports.run = async function({ api, event, args }) {
  try {
    const trigger = args.join(" ").trim();
    if (!trigger) {
      return api.sendMessage("❌ Trigger name missing. Use: !deleteAsk <trigger>", event.threadID, event.messageID);
    }

    const url = "https://rx-simisimi-api-tllc.onrender.com/deleteAsk";
    const params = { ask: trigger };

    const res = await axios.delete(url, { params });
    const message = res.data.message || "✅ Done";

    api.sendMessage(message, event.threadID, event.messageID);
  } catch (err) {
    console.error("deleteAsk error:", err.response?.data || err.message);
    api.sendMessage("⚠️ Error deleting ask", event.threadID, event.messageID);
  }
};
