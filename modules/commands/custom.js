const fs = require("fs");
const path = require("path");

const dataFile = path.join(__dirname, "customData.json");

// যদি ফাইল না থাকে, তৈরি করো
if (!fs.existsSync(dataFile)) {
  fs.writeFileSync(dataFile, JSON.stringify({}));
}

module.exports.config = {
  name: "custom",
  version: "1.1.0",
  hasPermssion: 0,
  credits: "rX Abdullah",
  usePrefix: true,
  description: "Group-specific custom auto reply",
  commandCategory: "system",
  usages: "[message / mention, message / off]",
  cooldowns: 5,
};

module.exports.run = async function ({ api, event, args }) {
  const threadID = event.threadID;
  const input = args.join(" ");
  const data = JSON.parse(fs.readFileSync(dataFile, "utf8"));

  // যদি কিছু না দেওয়া হয়
  if (!input) {
    return api.sendMessage(
      "⚙️ Usage:\n!custom [message]\n!custom mention, [message]\n!custom off (to disable)",
      threadID
    );
  }

  // বন্ধ করতে চাইলে
  if (input.toLowerCase() === "off") {
    if (data[threadID]) {
      delete data[threadID];
      fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
      return api.sendMessage("🟡 Custom reply system turned OFF for this group.", threadID);
    } else {
      return api.sendMessage("⚠️ This group has no active custom reply.", threadID);
    }
  }

  // Mention mode detection
  let mentionMode = false;
  let message = input;

  if (input.toLowerCase().startsWith("mention,")) {
    mentionMode = true;
    message = input.slice(8).trim();
  }

  // ঐ group-এর জন্য data save করো
  data[threadID] = {
    message,
    mentionMode,
    enabled: true
  };

  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));

  api.sendMessage(
    `✅ Custom reply system activated for this group!\n\nMode: ${mentionMode ? "📍Mention" : "💬Normal"}\nMessage: ${message}`,
    threadID
  );
};

// যখন কেউ message পাঠায়
module.exports.handleEvent = async function ({ api, event }) {
  if (event.type !== "message" || !event.body) return;

  const threadID = event.threadID;
  const senderID = event.senderID;
  const data = JSON.parse(fs.readFileSync(dataFile, "utf8"));

  // যদি ঐ group এ system active না থাকে, কিছু করো না
  if (!data[threadID] || !data[threadID].enabled) return;

  const { message, mentionMode } = data[threadID];

  if (mentionMode) {
    try {
      const userInfo = await api.getUserInfo(senderID);
      const userName = userInfo[senderID].name;
      return api.sendMessage(
        {
          body: `@${userName} ${message}`,
          mentions: [{ tag: userName, id: senderID }]
        },
        threadID
      );
    } catch (e) {
      console.error("Error fetching user info:", e);
    }
  } else {
    return api.sendMessage(message, threadID);
  }
};
