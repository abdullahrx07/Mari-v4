const request = require("request");
const fs = require("fs");
const axios = require("axios");

module.exports.config = {
  name: "kiss",
  version: "1.0.0",
  hasPermssion: 0,
  credits: "mirai-team",
  description: "Kiss the person you tag",
  commandCategory: "game",
  usages: "@tag",
  cooldowns: 5,
  dependencies: {
    "request": "",
    "fs": "",
    "axios": ""
  }
};

module.exports.run = async ({ api, event, args, client, Users, Threads, __GLOBAL, Currencies }) => {
  const request = require('request');
  const fs = require('fs');

  // Get the mentioned user
  var mention = Object.keys(event.mentions)[0];
  let tag = event.mentions[mention].replace("@", "");

  // Random kiss GIFs
  var link = [
    "https://i.postimg.cc/G37G3WDd/574fcc7979b6f-1533876767756310501023.gif",
    "https://i.postimg.cc/XqzC25Wp/574fcc797b21e-1533876813029926506824.gif",
    "https://i.postimg.cc/DZ5sXDYQ/574fcc92e98c3-1533876840028170363441.gif",
    "https://i.postimg.cc/yYD9DLh9/Crafty-Live-Junco-size-restricted.gif",
    "https://i.postimg.cc/NFJ1WV6G/dedac9ceaace3856b6fe85522579fb88.gif"
  ];
  
  // Send message after downloading GIF
  var callback = () => api.sendMessage({
    body: `Hey ${tag}!\nHere’s a kiss for you 💗`,
    mentions: [{
      tag: tag,
      id: Object.keys(event.mentions)[0]
    }],
    attachment: fs.createReadStream(__dirname + "/cache/kiss.gif")
  }, event.threadID, () => fs.unlinkSync(__dirname + "/cache/kiss.gif"));

  // Download random GIF
  return request(encodeURI(link[Math.floor(Math.random() * link.length)]))
    .pipe(fs.createWriteStream(__dirname + "/cache/kiss.gif"))
    .on("close", () => callback());
};
