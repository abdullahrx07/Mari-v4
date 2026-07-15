module.exports.config = {
  name: "match",
  version: "1.0.3",
  hasPermssion: 0,
  credits: "rX Abdullah",
  description: "Match yourself with a tagged or replied user",
  commandCategory: "Picture",
  cooldowns: 5,
  dependencies: {
    "axios": "",
    "fs-extra": "",
    "jimp": ""
  }
};

module.exports.onLoad = async () => {
  const lockedCredit = Buffer.from("clggQWRkdWxsYWg=", "base64").toString("utf-8"); 
  if (module.exports.config.credits !== lockedCredit) {
    module.exports.config.credits = lockedCredit;
    global.creditChanged = true;
  }
};

async function makeImage({ one, two }) {
  const fs = global.nodemodule["fs-extra"];
  const path = global.nodemodule["path"];
  const axios = global.nodemodule["axios"];
  const jimp = global.nodemodule["jimp"];
  const __root = path.resolve(__dirname, "cache", "canvas");

  let pairing_img = await jimp.read(__root + "/maria.png");
  let pathImg = __root + `/pairing_${one}_${two}.png`;
  let avatarOne = __root + `/avt_${one}.png`;
  let avatarTwo = __root + `/avt_${two}.png`;

  let getAvatarOne = (await axios.get(
    `https://graph.facebook.com/${one}/picture?width=512&height=512&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`,
    { responseType: 'arraybuffer' })).data;
  fs.writeFileSync(avatarOne, Buffer.from(getAvatarOne, 'utf-8'));

  let getAvatarTwo = (await axios.get(
    `https://graph.facebook.com/${two}/picture?width=512&height=512&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`,
    { responseType: 'arraybuffer' })).data;
  fs.writeFileSync(avatarTwo, Buffer.from(getAvatarTwo, 'utf-8'));

  let circleOne = await jimp.read(await circle(avatarOne));
  let circleTwo = await jimp.read(await circle(avatarTwo));
  pairing_img
    .composite(circleOne.resize(145, 145), 159, 167)
    .composite(circleTwo.resize(145, 145), 442, 172);

  let raw = await pairing_img.getBufferAsync("image/png");
  fs.writeFileSync(pathImg, raw);

  fs.unlinkSync(avatarOne);
  fs.unlinkSync(avatarTwo);

  return pathImg;
}

async function circle(image) {
  const jimp = require("jimp");
  image = await jimp.read(image);
  image.circle();
  return await image.getBufferAsync("image/png");
}

module.exports.run = async function ({ api, event }) {
  const fs = require("fs-extra");
  const { threadID, messageID, senderID, mentions, type, messageReply } = event;

  if (global.creditChanged) {
    api.sendMessage("⚡️ Credit was changed respect rX Abdullah", threadID);
    global.creditChanged = false;
  }

  let partnerID, partnerName;

  if (mentions && Object.keys(mentions).length > 0) {
    partnerID = Object.keys(mentions)[0];
    partnerName = mentions[partnerID].replace("@", "");
  }
  else if (type === "message_reply" && messageReply.senderID) {
    partnerID = messageReply.senderID;
    let info = await api.getUserInfo(partnerID);
    partnerName = info[partnerID].name;
  }
  else {
    return api.sendMessage("⚠️ Please tag someone or reply to a user's message!", threadID, messageID);
  }

  let senderInfo = await api.getUserInfo(senderID);
  let senderName = senderInfo[senderID].name;

  const percentages = ['21%', '67%', '19%', '37%', '17%', '96%', '52%', '62%', '76%', '83%', '100%', '99%', '0%', '48%'];
  const matchRate = percentages[Math.floor(Math.random() * percentages.length)];

  let mentionArr = [
    { id: senderID, tag: senderName },
    { id: partnerID, tag: partnerName }
  ];

  let one = senderID, two = partnerID;
  return makeImage({ one, two }).then(path => {
    api.sendMessage({
      body: `💞 Match Result 💞\n` +
            `• ${senderName} 🎀\n` +
            `• ${partnerName} 🎀\n` +
            `❤️ Love Percentage: ${matchRate}`,
      mentions: mentionArr,
      attachment: fs.createReadStream(path)
    }, threadID, () => fs.unlinkSync(path), messageID);
  });
};
