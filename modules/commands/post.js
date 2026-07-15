module.exports.config = {
  name: "post",
  version: "2.0.0",
  permission: 0,
  credits: "rX Abdullah",
  description: "Create a Facebook post using createPost",
  commandCategory: "facebook",
  usages: "!post <text>",
  cooldowns: 2
};

module.exports.run = async function ({ api, event, args }) {
  const content = args.join(" ");

  if (!content)
    return api.sendMessage("⚠️ Usage: !post <text>", event.threadID, event.messageID);

  try {
    api.createPost(
      {
        body: content
      },
      (err, url) => {
        if (err) {
          console.log("POST ERROR:", err);
          return api.sendMessage(
            "❌ Failed to post!\n" + JSON.stringify(err, null, 2),
            event.threadID,
            event.messageID
          );
        }

        return api.sendMessage(
          "✅ Successfully posted!\n🔗 " + url,
          event.threadID,
          event.messageID
        );
      }
    );
  } catch (e) {
    console.log("POST CATCH ERROR:", e);
    return api.sendMessage(
      "❌ Exception error:\n" + JSON.stringify(e, null, 2),
      event.threadID,
      event.messageID
    );
  }
};
