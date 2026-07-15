const request = require("request");
const fs = require("fs");
const axios = require("axios");

module.exports.config = {
  name: "hug",
  version: "1.0.0",
  hasPermssion: 0,
  credits: "Lê Định Mod",
  description: "Hug the person you want",
  commandCategory: "game",
  usages: "@tag",
  cooldowns: 5,
  dependencies: { "request": "", "fs": "", "axios": "" }
};

module.exports.run = async({ api, event, args, client, Users, Threads, __GLOBAL, Currencies }) => {
    const request = require('request');
    const fs = require('fs');
    
    // Get the first mentioned user
    var mention = Object.keys(event.mentions)[0];
    let tag = event.mentions[mention].replace("@", "");
    
    // List of hug GIFs
    var link = [
        "https://genk.mediacdn.vn/2016/04-1483112033497.gif",
    ];

    // Callback function to send the message with the GIF
    var callback = () => api.sendMessage({
        body: `Hey ${tag} 💌, I want to give you a hug 💗`,
        mentions: [{
            tag: tag,
            id: Object.keys(event.mentions)[0]
        }],
        attachment: fs.createReadStream(__dirname + "/cache/hug.gif")
    }, event.threadID, () => fs.unlinkSync(__dirname + "/cache/hug.gif"));

    // Download the GIF and then call the callback
    return request(encodeURI(link[Math.floor(Math.random() * link.length)]))
        .pipe(fs.createWriteStream(__dirname + "/cache/hug.gif"))
        .on("close", () => callback());
};
