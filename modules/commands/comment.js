const axios = require("axios");

module.exports.config = {
  name: "comment",
  version: "2.0.0",
  permission: 0,
  credits: "rX Abdullah",
  description: "Comment on a Facebook post (supports share links)",
  commandCategory: "facebook",
  usages: "!comment <post link or postID> <text>",
  cooldowns: 2
};

module.exports.run = async function ({ api, event, args }) {

  if (!args[0])
    return api.sendMessage("⚠️ Give Post Link or Post ID.\nExample: !comment <link> Hello", event.threadID, event.messageID);

  const input = args[0];
  let postID = input;

  // ================================
  // 🔥 AUTO EXTRACT POST ID SYSTEM
  // ================================
  async function extractPostID(url) {
    try {
      const { request } = await axios.get(url, { maxRedirects: 5 });

      // Final redirected URL
      const finalURL = request.res.responseUrl;

      // Case 1: fb.com/story.php?story_fbid=xxx&id=yyy
      let match = finalURL.match(/story_fbid=(\d+)/);
      if (match) return match[1];

      // Case 2: posts/<id>
      match = finalURL.match(/posts\/(\d+)/);
      if (match) return match[1];

      // Case 3: videos/<id>
      match = finalURL.match(/videos\/(\d+)/);
      if (match) return match[1];

      // Case 4: permalink/<id>
      match = finalURL.match(/permalink\/(\d+)/);
      if (match) return match[1];

      // Case 5: fbid=<id>
      match = finalURL.match(/fbid=(\d+)/);
      if (match) return match[1];

      // Case 6: photo.php?fbid=<id>
      match = finalURL.match(/\/(\d{10,})/);
      if (match) return match[1];

      return null;
    } catch (e) {
      console.log("Extract Error:", e);
      return null;
    }
  }

  // If input is URL → extract postID
  if (input.startsWith("http")) {
    postID = await extractPostID(input);

    if (!postID)
      return api.sendMessage("❌ Could not extract post ID from link!", event.threadID, event.messageID);
  }

  const messageText = args.slice(1).join(" ") || "Hello!";

  const messageObj = {
    body: messageText,
    attachments: [],
    mentions: [],
    sticker: null,
    url: null
  };

  try {
    const result = await api.createCommentPost(messageObj, postID);

    return api.sendMessage(
      `✅ Comment posted successfully!\n🆔 Comment ID: ${result?.id}\n🔗 Link: ${result?.url}`,
      event.threadID,
      event.messageID
    );

  } catch (err) {
    console.log(err);
    return api.sendMessage("❌ Failed to comment!\n" + err, event.threadID, event.messageID);
  }
};
