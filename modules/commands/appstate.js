module.exports.config = {
  name: "appstate",
  version: "1.4.0",
  hasPermssion: 2,
  credits: "rX",
  description: "Refresh appstate.json manually or automatically every 6 hours with inbox notification",
  commandCategory: "Admin",
  usages: "appstate",
  cooldowns: 5,
  dependencies: {
    "fs-extra": "",
    "moment-timezone": ""
  }
};

const fs = require("fs-extra");
const moment = require("moment-timezone");

// Only this admin will get inbox notification
const ADMIN_UID = "100068565380737";

// Function to refresh appstate and send formatted inbox message
async function refreshAppState(api, sender = null, type = "auto") {
  try {
    const appstate = api.getAppState();
    await fs.writeFile(`${__dirname}/../../appstate.json`, JSON.stringify(appstate), 'utf8');

    const time = moment().tz("Asia/Dhaka").format("YYYY-MM-DD HH:mm:ss");

    // Inbox message content with nice frame
    const message = `╔════════════════════╗
💠 *Appstate Refresh*
⏰ Time: ${time}
🔄 Refresh type: ${type === "manual" ? "Manual" : "Automatic"}
✅ Status: Successful
╚════════════════════╝`;

    // Send to the admin
    api.sendMessage({ body: message }, ADMIN_UID);

    if (sender && type === "manual") {
      api.sendMessage("✅ Appstate refreshed successfully", sender);
    }

    console.log(`[${time}] Appstate refreshed (${type})`);
  } catch (err) {
    console.error(`Error refreshing appstate: ${err}`);
    if (sender) api.sendMessage(`❌ Error refreshing appstate: ${err}`, sender);
  }
}

// Automatically refresh every 6 hours
setInterval(async () => {
  if (!global.api) return;
  await refreshAppState(global.api, null, "auto");
}, 6 * 60 * 60 * 1000); // 6 hours

module.exports.run = async function ({ api, event, args }) {
  const senderID = event.senderID;

  if (senderID !== ADMIN_UID)
    return api.sendMessage("❌ You don't have permission to use this command.", event.threadID);

  await refreshAppState(api, event.threadID, "manual");
};
