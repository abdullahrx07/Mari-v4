const SETTING_KEY = "autoseen";

let autoseenEnabled = true; // default: on (matches old always-on behaviour)

module.exports.config = {
  name: "autoseen",
  version: "2.0.0",
  hasPermssion: 3,
  credits: "rX",
  description: "Turn the bot's auto-seen (auto mark-as-read) on or off",
  commandCategory: "Admin",
  usages: "autoseen on/off",
  cooldowns: 5
};

// Loads the saved setting from the database once the bot has logged in.
module.exports.onLoad = async function () {
  if (global.systemData && typeof global.systemData.get === "function") {
    try {
      autoseenEnabled = await global.systemData.get(SETTING_KEY, true);
    } catch (e) {
      console.error("[autoseen] Failed to load setting from DB:", e.message);
    }
  }
};

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID } = event;
  const input = (args[0] || "").toLowerCase();

  if (input !== "on" && input !== "off") {
    return api.sendMessage(
      `Auto-seen is currently ${autoseenEnabled ? "ON ✅" : "OFF ❌"}.\nUse "autoseen on" or "autoseen off" to change it.`,
      threadID,
      messageID
    );
  }

  const newValue = input === "on";
  autoseenEnabled = newValue; // update the in-memory cache immediately

  if (global.systemData && typeof global.systemData.set === "function") {
    try {
      await global.systemData.set(SETTING_KEY, newValue);
    } catch (e) {
      console.error("[autoseen] Failed to save setting to DB:", e.message);
    }
  }

  return api.sendMessage(`Auto-seen has been turned ${newValue ? "ON ✅" : "OFF ❌"}.`, threadID, messageID);
};

// Fires on every incoming message (see includes/handle/handleCommandEvent.js).
module.exports.handleEvent = async function ({ api }) {
  if (!autoseenEnabled) return;
  api.markAsReadAll();
};
