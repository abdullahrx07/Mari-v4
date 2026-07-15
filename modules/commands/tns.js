module.exports.config = {
  name: "tns",
  version: "1.0.3",
  hasPermssion: 0,
  credits: "rX",
  usePrefix: false,
  description: "Translate text to specified language",
  commandCategory: "media",
  usages: "[language] (text)",
  cooldowns: 5,
  dependencies: {
    "request": ""
  }
};

module.exports.run = async ({ api, event, args }) => {
  const request = global.nodemodule["request"];

  if (args.length == 0 && event.type != "message_reply") 
    return api.sendMessage("Please provide text to translate!", event.threadID, event.messageID);

  let lang = args[0].toLowerCase(); // language code or name
  let translateThis = args.slice(1).join(" ");

  // If reply and no text after command, use replied message
  if (event.type == "message_reply" && translateThis.length == 0) {
    translateThis = event.messageReply.body;
  }

  if (!translateThis) 
    return api.sendMessage("Please provide text to translate!", event.threadID, event.messageID);

  // Map common language names to Google Translate codes
  const langMap = {
    "bangla": "bn",
    "bengali": "bn",
    "hindi": "hi",
    "english": "en",
    "vi": "vi",
    "arabic": "ar"
  };

  if (langMap[lang]) lang = langMap[lang];

  return request(encodeURI(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${lang}&dt=t&q=${translateThis}`), (err, response, body) => {
    if (err) return api.sendMessage("An error has occurred!", event.threadID, event.messageID);

    try {
      const retrieve = JSON.parse(body);
      let text = '';
      retrieve[0].forEach(item => (item[0]) ? text += item[0] : '');
      api.sendMessage(text, event.threadID, event.messageID);
    } catch (e) {
      return api.sendMessage("Error parsing translation!", event.threadID, event.messageID);
    }
  });
};
