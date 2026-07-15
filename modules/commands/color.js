module.exports.config = {
  name: "color",
  version: "1.0.0",
  credits: "rX Abdullah",
  description: "Change thread color directly",
  commandCategory: "utility",
  usages: "[colorName]",
  cooldowns: 5,
};

module.exports.run = async function ({ api, event, args }) {
  const threadID = event.threadID;

  if (!args[0]) {
    return api.sendMessage(
      "🎨 Usage: color [colorName]\nExample: color Red",
      threadID,
      event.messageID
    );
  }

  const colorName = args[0].toLowerCase();

  // ✅ Thread color list (rx-fca style) directly included
  const threadColors = {
    messengerblue: "196241301102133",
    viking: "1928399724138152",
    goldenpoppy: "174636906462322",
    radicalred: "2129984390566328",
    shocking: "2058653964378557",
    freespeechgreen: "2136751179887052",
    pumpkin: "175615189761153",
    lightcoral: "980963458735625",
    mediumslateblue: "234137870477637",
    deepskyblue: "2442142322678320",
    brilliantrose: "169463077092846",
    defaultblue: "196241301102133",
    hotpink: "169463077092846",
    aquablue: "2442142322678320",
    brightpurple: "234137870477637",
    coralpink: "980963458735625",
    orange: "175615189761153",
    green: "2136751179887052",
    lavenderpurple: "2058653964378557",
    red: "2129984390566328",
    yellow: "174636906462322",
    tealblue: "1928399724138152"
    // চাইলে বাকী colorsও add করতে পারো
  };

  // ✅ Check color validity
  if (!threadColors[colorName]) {
    const list = Object.keys(threadColors)
      .map(c => c.charAt(0).toUpperCase() + c.slice(1))
      .join(", ");
    return api.sendMessage(
      `❌ Invalid color!\n\nAvailable:\n${list}`,
      threadID,
      event.messageID
    );
  }

  try {
    // ✅ Change thread color directly
    await api.changeThreadColor(threadColors[colorName], threadID);

    api.sendMessage(
      `✅ Thread color changed to: ${colorName.charAt(0).toUpperCase() + colorName.slice(1)}`,
      threadID,
      event.messageID
    );
  } catch (err) {
    console.error(err);
    api.sendMessage(
      "❌ Error changing thread color: " + err.message,
      threadID,
      event.messageID
    );
  }
};
