module.exports.config = {
  name: "postreact",
  version: "1.0.0",
  hasPermssion: 0,
  credits: "RX Abdullah",
  description: "React to a Facebook post",
  commandCategory: "utility",
  usages: "[postID] [like|love|haha|wow|sad|angry|unlike]",
  cooldowns: 3,
};

module.exports.run = async ({ api, event, args }) => {
  const postID   = args[0];
  const typeRaw  = (args[1] || "like").toLowerCase();

  const validTypes = ["like", "love", "heart", "haha", "wow", "sad", "angry", "unlike",
                      "0","1","2","3","4","7","8","16"];

  if (!postID) {
    return api.sendMessage("❌ Usage: postreact [postID] [like|love|haha|wow|sad|angry|unlike]", event.threadID);
  }

  if (!validTypes.includes(typeRaw)) {
    return api.sendMessage(
      `❌ Invalid reaction type: ${typeRaw}\n✅ Valid: like, love, haha, wow, sad, angry, unlike`,
      event.threadID
    );
  }

  try {
    const result = await api.setPostReaction(postID, typeRaw);
    const reactionEmoji = {
      like: "👍", love: "❤️", heart: "❤️",
      haha: "😆", wow: "😮", sad: "😢",
      angry: "😡", unlike: "👋",
    };
    const emoji = reactionEmoji[typeRaw] || "✅";
    return api.sendMessage(
      `${emoji} Reacted to post ${postID} with "${typeRaw}"`,
      event.threadID
    );
  } catch (err) {
    console.error("postreact error:", err);
    return api.sendMessage(
      `❌ Failed to react: ${err?.error || err?.message || JSON.stringify(err)}`,
      event.threadID
    );
  }
};
