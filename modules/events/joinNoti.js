const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");
const Canvas = require("canvas");
Canvas.registerFont(path.join(__dirname, "cache", "kalpurush.ttf"), {
  family: "Kalpurush"
});
module.exports.config = {
  name: "joinnoti",
  version: "4.3.0",
  credits: "rX Abdullah", //don't change this credite for more update (github.com/rxabdullah007) 
  eventType: ["log:subscribe"],
  description: "Welcome image with profile borders, inviter shifted, and random background"
};

module.exports.run = async function ({ api, event, Users }) {

  const { threadID, logMessageData } = event;
  const added = logMessageData.addedParticipants?.[0];
  if (!added) return;

  const userID = added.userFbId;
  const botID = api.getCurrentUserID();

  // =============== CASE 1: BOT ADDED ===============
  if (userID == botID) {

    api.sendMessage(
      "𝐓𝐡𝐚𝐧𝐤𝐬 𝐟𝐨𝐫 𝐚𝐝𝐝𝐢𝐧𝐠 𝐦𝐞 ❤️\n𝐓𝐲𝐩𝐞 !𝐡𝐞𝐥𝐩 𝐭𝐨 𝐬𝐞𝐞 𝐦𝐲 𝐜𝐨𝐦𝐦𝐚𝐧𝐝𝐬!",
      threadID
    );

    await api.changeNickname("Sııƞƞeɽ мΛяเα 倫ッ", threadID, botID);

    return;
  }

  // =============== CASE 2: NORMAL USER ADDED ===============

  const userName = added.fullName;

  const info = await api.getThreadInfo(threadID);
  const groupName = info.threadName;
  const adminCount = info.adminIDs.length;
  const memberCount = info.participantIDs.length;

  const male = info.userInfo.filter(u => u.gender === "MALE").length;
  const female = info.userInfo.filter(u => u.gender === "FEMALE").length;

  const inviterID = event.author;
  const inviterName = await Users.getNameUser(inviterID);

  const avatarURL = `https://graph.facebook.com/${userID}/picture?width=512&height=512&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`;
  const inviterAvatarURL = `https://graph.facebook.com/${inviterID}/picture?width=512&height=512&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`;
  const groupPhotoURL = info.imageSrc;

  const backgrounds = [
    "https://i.postimg.cc/KvKRcxmh/0e915f11edad950d8356a26a96f1d9d9.jpg",
    "https://i.postimg.cc/3whRZGpC/169243.jpg",
    "https://i.postimg.cc/4yyn9Ttv/2Ayk-GB.jpg",
    "https://i.postimg.cc/PrBNP95c/360-F-665314071-v-Zb-Ef-Kb-Imd0l-Tgt-B9tb-Dyeoh74FCb-WJz.jpg",
    "https://i.postimg.cc/4y0yvFbq/43afd01dc42127c352f1fde070cc2be0.jpg",
    "https://i.postimg.cc/YqJjhZCT/48fd6b0f4be38d891f1d1e779a63c8d3.jpg",
    "https://i.postimg.cc/MKcvZqq3/anime-aesthetic-pictures-lqtumoq8zq18qvfs.jpg",
    "https://i.postimg.cc/pXgyp4dy/cropped-anime-girls-bunny-ears-mx-shimmer-wallpaper-preview.jpg",
    "https://i.postimg.cc/c4V6r2JS/dark-sunset-wallpaper-1366x768-81373-46.jpg",
    "https://i.postimg.cc/9F4rXCCL/demon-slayer-zenitsu-agatsuma-around-blue-lightning-with-black-backgorund-hd-anime-HD.jpg",
    "https://i.postimg.cc/zXLVD88Q/desktop-wallpaper-chill-anime-on-dog-dog-spring-lofi.jpg",
    "https://i.postimg.cc/zvQvwPSS/efbca9cd58be501870f823c6bf18b3ba.jpg",
    "https://i.postimg.cc/BQ8XZ4J9/f6c517ccc8bab364676add8b07c0736d.jpg",
    "https://i.postimg.cc/HsJVWdd5/HD-wallpaper-anime-original-girl-lantern-night-umbrella.jpg",
    "https://i.postimg.cc/jSP2NcW6/Kurumi.jpg",
    "https://i.postimg.cc/Fs2178KR/RPMc-Bv-KKHCckgo-Ry-Uh-He-Z.jpg",
    "https://i.postimg.cc/MpVHR5c9/sunset-minimalist-wallpaper-1600x900-81072-47.jpg",
    "https://i.postimg.cc/RV3NC44s/Uj-Jo-Pk.jpg",
    "https://i.postimg.cc/sg7xSmBv/wp5894854.jpg",
    "https://i.postimg.cc/90k0PNtN/wp6231959.jpg"
  ];

  const backgroundURL = backgrounds[Math.floor(Math.random() * backgrounds.length)];

  const cache = path.join(__dirname, "cache");
  fs.ensureDirSync(cache);

  const avt = path.join(cache, `avt_${userID}.png`);
  const inv = path.join(cache, `inv_${inviterID}.png`);
  const grp = path.join(cache, `grp_${threadID}.png`);
  const bgFile = path.join(cache, `bg.png`);
  const out = path.join(cache, `welcome_${userID}.png`);

  try {

    fs.writeFileSync(avt, (await axios.get(avatarURL, { responseType: "arraybuffer" })).data);
    fs.writeFileSync(inv, (await axios.get(inviterAvatarURL, { responseType: "arraybuffer" })).data);
    if (groupPhotoURL)
      fs.writeFileSync(grp, (await axios.get(groupPhotoURL, { responseType: "arraybuffer" })).data);
    fs.writeFileSync(bgFile, (await axios.get(backgroundURL, { responseType: "arraybuffer" })).data);

    const canvas = Canvas.createCanvas(1280, 720);
    const ctx = canvas.getContext("2d");

    const bg = await Canvas.loadImage(bgFile);
    ctx.drawImage(bg, 0, 0, 1280, 720);

    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, 1280, 130);

    if (groupPhotoURL) {
      const g = await Canvas.loadImage(grp);
      ctx.save();
      ctx.beginPath();
      ctx.arc(80, 65, 50, 0, Math.PI * 2);
      ctx.strokeStyle = "#00f";
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.clip();
      ctx.drawImage(g, 30, 15, 100, 100);
      ctx.restore();
    }

    ctx.fillStyle = "#fff";
    ctx.font = "bold 35px Kalpurush";
    ctx.fillText(groupName, 180, 60);

    ctx.font = "26px Kalpurush";
    ctx.fillText(`${memberCount} members`, 180, 100);
    ctx.fillText(`${adminCount} admins`, 360, 100);

    ctx.font = "bold 28px Kalpurush";
    ctx.fillStyle = "#fff";
    ctx.fillText("Invited by:", 950, 50);

    ctx.font = "bold 30px Kalpurush";
    ctx.fillStyle = "#ff69b4";
    ctx.fillText(inviterName, 950, 90);

    const inviterPic = await Canvas.loadImage(inv);
    ctx.save();
    ctx.beginPath();
    ctx.arc(1190, 65, 45, 0, Math.PI * 2);
    ctx.strokeStyle = "#ff69b4";
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.clip();
    ctx.drawImage(inviterPic, 1150, 25, 80, 80);
    ctx.restore();

    // NEON WELCOME TEXT
    ctx.textAlign = "center";
    ctx.font = "bold 80px Kalpurush";

    ctx.fillStyle = "#39FF14";
    ctx.shadowColor = "#39FF14";
    ctx.shadowBlur = 45;
    ctx.fillText("WELCOME", 640, 200);

    ctx.shadowColor = "white";
    ctx.shadowBlur = 15;
    ctx.fillStyle = "#d9ffd9";
    ctx.fillText("WELCOME", 640, 200);

    // Reset Shadow
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";

    // MAIN AVATAR
    const av = await Canvas.loadImage(avt);
    ctx.save();
    ctx.beginPath();
    ctx.arc(640, 360, 115, 0, Math.PI * 2);
    ctx.strokeStyle = "#00ff00";
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.clip();
    ctx.drawImage(av, 530, 250, 220, 220);
    ctx.restore();

    // NEON USERNAME
    ctx.textAlign = "center";
    ctx.font = "bold 56px Kalpurush";
    ctx.fillStyle = "#39FF14";
    ctx.shadowColor = "#39FF14";
    ctx.shadowBlur = 35;
    ctx.fillText(userName, 640, 520);

    ctx.shadowColor = "white";
    ctx.shadowBlur = 12;
    ctx.fillStyle = "#CCFFCC";
    ctx.fillText(userName, 640, 520);

    ctx.shadowBlur = 0;

    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 650, 1280, 70);

    ctx.font = "28px Kalpurush";
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";

    ctx.fillText(`✰ ${memberCount} Members     ♂️ ${male} Male     ♀️ ${female} Female     ★ Thanks for using: Maria v3`, 640, 695);

    fs.writeFileSync(out, canvas.toBuffer());

    api.sendMessage(
      {
        body: `🌸 Welcome @${userName} to ${groupName}!`,
        attachment: fs.createReadStream(out),
        mentions: [{ tag: `@${userName}`, id: userID }]
      },
      threadID,
      () => {
        if (fs.existsSync(avt)) fs.unlinkSync(avt);
        if (fs.existsSync(inv)) fs.unlinkSync(inv);
        if (groupPhotoURL && fs.existsSync(grp)) fs.unlinkSync(grp);
        if (fs.existsSync(bgFile)) fs.unlinkSync(bgFile);
        if (fs.existsSync(out)) fs.unlinkSync(out);
      }
    );

  } catch (e) {
    console.log(e);
    api.sendMessage("❌ Error while generating welcome image!", threadID);
  }
};
