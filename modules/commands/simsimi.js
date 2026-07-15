const axios = require("axios");

module.exports.config = {
  name: "simsimi",
  version: "2.0.0",
  hasPermssion: 0,
  credits: "rX",
  description: "Exact Answer → Actual Question finder",
  commandCategory: "Fun",
  cooldowns: 3,
  dependencies: []
};

const API_URL = "https://rx-simisimi-api-tllc.onrender.com";

module.exports.run = async ({ event, api, args }) => {
  const input = args.join(" ").trim();

  // ========================
  // Input validation
  // ========================
  if (!input) {
    return api.sendMessage(
      "❌ Please provide an answer to find its actual question.",
      event.threadID
    );
  }

  // ========================
  // Exact Answer → Question
  // ========================
  try {
    const res = await axios.post(
      `${API_URL}/findQuestion`,
      { answer: input },
      { timeout: 10000 }
    );

    // If question(s) found
    if (Array.isArray(res.data?.questions) && res.data.questions.length > 0) {
      const list = res.data.questions
        .map((q, i) => `${i + 1}. ${q}`)
        .join("\n");

      return api.sendMessage(
        `📌 This answer was used in the following question(s):\n\n${list}`,
        event.threadID
      );
    }

    // API message (not found)
    if (res.data?.message) {
      return api.sendMessage(
        `❌ ${res.data.message}`,
        event.threadID
      );
    }

    return api.sendMessage(
      "❌ No actual question found for this answer.",
      event.threadID
    );

  } catch (err) {
    console.error("findQuestion API error:", err.message);
    return api.sendMessage(
      "⚠️ Failed to contact server. Please try again later.",
      event.threadID
    );
  }
};
