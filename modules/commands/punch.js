const request = require("request");
const fs = require("fs");
const axios = require("axios");

module.exports.config = {
  name: "punch",
  version: "1.0.0",
  hasPermssion: 0,
  credits: "Kaneki",
  description: "Punch a tagged friend",
  commandCategory: "game",
  usages: "[tag]",
  cooldowns: 5,
};

module.exports.run = async({ api, event, Threads, global }) => {
  var link = [    
    "https://i.postimg.cc/SNX8pD8Z/13126.gif",
    "https://i.postimg.cc/TYZb2gJT/1467506881-1016b5fd386cf30488508cf6f0a2bee5.gif",
    "https://i.postimg.cc/fyV3DR33/anime-punch.gif",
    "https://i.postimg.cc/P5sLnhdx/onehit-30-5-2016-3.gif",
  ];

  var mention = Object.keys(event.mentions);
  let tag = event.mentions[mention].replace("@", "");

  if (!mention) return api.sendMessage("Please tag someone", event.threadID, event.messageID);

  var callback = () => api.sendMessage({
    body: `${tag} got punched by you! 👊`,
    mentions: [{ tag: tag, id: Object.keys(event.mentions)[0] }],
    attachment: fs.createReadStream(__dirname + "/cache/punch.gif")
  }, event.threadID, () => fs.unlinkSync(__dirname + "/cache/punch.gif"));  

  return request(encodeURI(link[Math.floor(Math.random() * link.length)]))
    .pipe(fs.createWriteStream(__dirname + "/cache/punch.gif"))
    .on("close", () => callback());
}
