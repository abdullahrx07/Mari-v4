module.exports.config = {
  name: "pair",
  version: "1.0.3",
  hasPermssion: 0,
  credits: "rX Abdullah", //don't change my credit
  description: "Pair two users with a fun compatibility score",
  commandCategory: "Picture",
  cooldowns: 5,
  dependencies: {
    "axios": "",
    "fs-extra": "",
    "jimp": ""
  }
};

module.exports.onLoad = async () => {
  const { resolve } = global.nodemodule["path"];
  const { existsSync, mkdirSync } = global.nodemodule["fs-extra"];
  const { downloadFile } = global.utils;
  const dirMaterial = __dirname + `/cache/canvas/`;
  const path = resolve(__dirname, 'cache/canvas', 'rx.png');
  if (!existsSync(dirMaterial + "canvas")) mkdirSync(dirMaterial, { recursive: true });
  if (!existsSync(path)) await downloadFile("https://i.postimg.cc/K82GdJjf/r07qxo-R-Download.jpg", path);

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

  let pairing_img = await jimp.read(__root + "/rx.png");
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
    .composite(circleOne.resize(137, 137), 95, 57)
    .composite(circleTwo.resize(137, 137), 505, 205);

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

  // Mention check
  if (mentions && Object.keys(mentions).length > 0) {
    partnerID = Object.keys(mentions)[0];
    let partnerInfo = await api.getUserInfo(partnerID);
    partnerName = partnerInfo[partnerID].name;
  }
  // Reply check
  else if (type === "message_reply" && messageReply.senderID) {
    partnerID = messageReply.senderID;
    let partnerInfo = await api.getUserInfo(partnerID);
    partnerName = partnerInfo[partnerID].name;
  }
  // Random participant
  else {
    let threadInfo = await api.getThreadInfo(threadID);
    let participants = threadInfo.participantIDs.filter(id => id !== senderID);
    partnerID = participants[Math.floor(Math.random() * participants.length)];
    let partnerInfo = await api.getUserInfo(partnerID);
    partnerName = partnerInfo[partnerID].name;
  }

  let senderInfo = await api.getUserInfo(senderID);
  let senderName = senderInfo[senderID].name;

  const percentages = ['21%', '67%', '19%', '37%', '17%', '96%', '52%', '62%', '76%', '83%', '100%', '99%', '0%', '48%'];
  const matchRate = percentages[Math.floor(Math.random() * percentages.length)];

  let mentionsArr = [
    { id: senderID, tag: senderName },
    { id: partnerID, tag: partnerName }
  ];

  let one = senderID, two = partnerID;
  return makeImage({ one, two }).then(path => {
    api.sendMessage({
      body: `🥰 Successful Pairing!\n💌 Wishing you two a lifetime of unexpected happiness – even with a ${matchRate} match!\n💕 Compatibility Score: ${matchRate}\nUnlikely but Unstoppable: [${senderName} + ${partnerName}]👨‍❤️‍👨`,
      mentions: mentionsArr,
      attachment: fs.createReadStream(path)
    }, threadID, () => fs.unlinkSync(path), messageID);
  });
};
