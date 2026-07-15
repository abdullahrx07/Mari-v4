module.exports.config = {
  name: "copy",
  version: "1.0.0",
  hasPermssion: 0,
  credits: "RxHelper",
  description: "Repeat a text N times in separate lines",
  commandCategory: "utility",
  usages: "!copy <Nx> <text>  | or reply a message then use: !copy <Nx>",
  cooldowns: 2
};

module.exports.run = async function ({ api, event, args }) {
  try {
    const MAX_TIMES = 100;
    const reply = event.messageReply;

    if (!args[0]) {
      return api.sendMessage(
        "Usage:\n• !copy 60x I love you\n• (Reply a message) !copy 10x\n\nNote: max 100x",
        event.threadID, event.messageID
      );
    }

    // Parse like "60x"
    const timesMatch = String(args[0]).toLowerCase().match(/^(\d{1,3})x$/);
    if (!timesMatch) {
      return api.sendMessage(
        "First argument must be like 10x / 60x / 100x.",
        event.threadID, event.messageID
      );
    }

    let times = parseInt(timesMatch[1], 10);
    if (isNaN(times) || times < 1) {
      return api.sendMessage("Times must be a positive number.", event.threadID, event.messageID);
    }
    if (times > MAX_TIMES) times = MAX_TIMES; // safety cap

    // Text to repeat: either from args after Nx or from replied message
    let text = args.slice(1).join(" ").trim();
    if (!text && reply && reply.body) text = reply.body.trim();

    if (!text) {
      return api.sendMessage(
        "Give some text to copy. Example:\n!copy 5x Hello\n(or reply any message then use !copy 5x)",
        event.threadID, event.messageID
      );
    }

    // Build output with line breaks
    const output = Array(times).fill(text).join("\n");

    // Messenger has message length limits; chunk if too long
    const CHUNK_SIZE = 15000;
    if (output.length <= CHUNK_SIZE) {
      return api.sendMessage(output, event.threadID);
    } else {
      for (let i = 0; i < output.length; i += CHUNK_SIZE) {
        await new Promise(res =>
          api.sendMessage(output.slice(i, i + CHUNK_SIZE), event.threadID, res)
        );
      }
    }
  } catch (e) {
    console.error(e);
    return api.sendMessage("❌ Something went wrong while copying text.", event.threadID, event.messageID);
  }
};
