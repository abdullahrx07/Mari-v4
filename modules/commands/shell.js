const { execSync, exec } = require("child_process");

module.exports.config = {
  name: "shell",
  version: "2.0.0",
  hasPermission: 1,
  credits: "rX Abdullah",
  description: "Run terminal commands on the server",
  usePrefix: true,
  commandCategory: "admin",
  usages: "shell <command>",
  cooldowns: 3
};

module.exports.run = async ({ api, args, event }) => {
  const cmd = args.join(" ").trim();

  if (!cmd) {
    return api.sendMessage(
      "⚠️ Usage: shell <command>\n\nExamples:\n• shell npm install gifencoder\n• shell npm list\n• shell ls\n• shell node -v",
      event.threadID,
      event.messageID
    );
  }

  api.sendMessage(`⏳ Running:\n$ ${cmd}`, event.threadID, async (err, info) => {
    exec(cmd, { timeout: 60000, maxBuffer: 1024 * 1024 * 5 }, (error, stdout, stderr) => {
      let output = "";

      if (stdout) output += stdout.trim();
      if (stderr) output += (output ? "\n\n⚠️ stderr:\n" : "") + stderr.trim();
      if (error && !stdout && !stderr) output = "❌ " + error.message;

      if (!output) output = "✅ Done (no output)";

      // 2000 character limit
      if (output.length > 2000) output = output.slice(0, 1950) + "\n...(truncated)";

      api.sendMessage(
        `$ ${cmd}\n\n${output}`,
        event.threadID,
        event.messageID
      );

      // delete the "Running..." message
      try { api.unsendMessage(info.messageID); } catch {}
    });
  });
};
