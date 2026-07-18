const util = require("util");
// Defer global.utils access to run-time (not module load time, when it's not set yet)
const getUtils = () => global.utils || {};

module.exports.config = {
  name: "eval",
  version: "1.0.0",
  hasPermssion: 2, // ⚠️ OWNER ONLY
  credits: "rX",
  description: "Run full access JavaScript code",
  commandCategory: "Owner",
  usages: "!eval <code>",
  cooldowns: 0
};

module.exports.run = async function ({
  api,
  event,
  args,
  Users,
  Threads,
  Currencies
}) {

  // 🔐 CHANGE THIS TO YOUR FB UID
  const OWNER_ID = "100068565380737";

  if (event.senderID !== OWNER_ID) {
    return api.sendMessage("⛔ Owner only command", event.threadID);
  }

  const code = args.join(" ");
  if (!code) {
    return api.sendMessage("> ❌ Code\nExample:\n!eval 1+1", event.threadID);
  }

  try {
    let result = await (async () => eval(code))();

    if (typeof result !== "string") {
      result = util.inspect(result, { depth: 2 });
    }

    if (result.length > 1900) {
      result = result.slice(0, 1900) + "\n...output truncated";
    }

    api.sendMessage(
      `🧪 EVAL RESULT\n────────────\n${result}`,
      event.threadID
    );

  } catch (err) {
    const { removeHomeDir, log: utilLog } = getUtils();
    if (utilLog && utilLog.err) utilLog.err("eval command", err);
    else console.error("eval command error:", err);

    api.sendMessage(
      `❌ EVAL ERROR\n────────────\n${
        err.stack
          ? (removeHomeDir ? removeHomeDir(err.stack) : err.stack)
          : (removeHomeDir ? removeHomeDir(JSON.stringify(err, null, 2)) : JSON.stringify(err, null, 2))
      }`,
      event.threadID
    );
  }
};
