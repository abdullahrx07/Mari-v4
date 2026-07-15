const request = require("request");
const fs = require("fs");
const axios = require("axios");

module.exports.config = {
  name: "kick",
  version: "1.0.0",
  hasPermssion: 0,
  credits: "Kaneki",
  description: "Kick the tagged friend",
  commandCategory: "game",
  usages: "[tag]",
  cooldowns: 5,
};

module.exports.run = async({ api, event, Threads, global }) => {
  const links = [    
    "https://i.postimg.cc/65TSxJYD/2ce5a017f6556ff103bce87b273b89b7.gif",
    "https://i.postimg.cc/65SP9jPT/Anime-083428-6224795.gif",
    "https://i.postimg.cc/RFXP2XfS/jXOwoHx.gif",
    "https://i.postimg.cc/jSPMRsNk/tumblr-nyc5ygy2a-Z1uz35lto1-540.gif",
  ];

  const mentions = Object.keys(event.mentions);
  if (!mentions.length) return api.sendMessage("Please tag someone!", event.threadID, event.messageID);

  const taggedName = event.mentions[mentions[0]].replace("@", "");

  const callback = () => {
    api.sendMessage({
      body: `${taggedName}, you just got kicked! 😆`,
      mentions: [{ tag: taggedName, id: mentions[0] }],
      attachment: fs.createReadStream(__dirname + "/cache/kick.gif")
    }, event.threadID, () => fs.unlinkSync(__dirname + "/cache/kick.gif"));
  };

  return request(encodeURI(links[Math.floor(Math.random() * links.length)]))
    .pipe(fs.createWriteStream(__dirname + "/cache/kick.gif"))
    .on("close", () => callback());
};
