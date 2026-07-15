module.exports.config = {
  name: "userinfo",
  version: "2.1.0",
  credits: "rX",
  description: "User ID Card with Gender & Birthday Fix",
  commandCategory: "info",
  usages: "[reply / mention / uid]",
  cooldowns: 5
};

module.exports.run = async function ({ api, event, args }) {
  try {
    const { createCanvas, loadImage } = require("canvas");
    const fs = require("fs");
    const path = require("path");

    let uid;

    if (event.messageReply) uid = event.messageReply.senderID;
    else if (Object.keys(event.mentions).length > 0) uid = Object.keys(event.mentions)[0];
    else if (args[0]) uid = args[0];
    else uid = event.senderID;

    const data = await api.getUserInfo(uid);
    const user = data[uid];
    if (!user) return api.sendMessage("❌ User info পাওয়া যায়নি", event.threadID);

    // gender mapping
    const genderText =
      user.gender == 1 ? "Female" :
      user.gender == 2 ? "Male" :
      "Custom";

    // birthday text
    const birthdayText = user.isBirthday ? "Today 🎉" : "Not Today";

    // canvas setup
    const width = 800;
    const height = 450;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // background
    const bg = await loadImage(
      "https://i.postimg.cc/YqJjhZCT/48fd6b0f4be38d891f1d1e779a63c8d3.jpg"
    );
    ctx.drawImage(bg, 0, 0, width, height);

    // dark overlay
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, width, height);

    // neon frame
    ctx.strokeStyle = "#00fff0";
    ctx.lineWidth = 6;
    ctx.shadowColor = "#00fff0";
    ctx.shadowBlur = 20;
    ctx.strokeRect(20, 20, width - 40, height - 40);

    // avatar
    const avatar = await loadImage(
      `https://graph.facebook.com/${uid}/picture?width=512&height=512&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`
    );
    ctx.save();
    ctx.beginPath();
    ctx.arc(150, 170, 80, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, 70, 90, 160, 160);
    ctx.restore();

    // neon text
    ctx.shadowBlur = 15;
    ctx.shadowColor = "#00eaff";
    ctx.fillStyle = "#ffffff";

    ctx.font = "bold 30px Sans";
    ctx.fillText("USER ID CARD", 300, 70);

    ctx.font = "22px Sans";
    ctx.fillText(`Name: ${user.name}`, 300, 140);
    ctx.fillText(`User ID: ${uid}`, 300, 180);
    ctx.fillText(`Username: ${user.vanity || "N/A"}`, 300, 220);
    ctx.fillText(`Gender: ${genderText}`, 300, 260);
    ctx.fillText(`Birthday: ${birthdayText}`, 300, 300);
    ctx.fillText(`Friend: ${user.isFriend ? "Yes" : "No"}`, 300, 340);

    // line
    ctx.strokeStyle = "#00fff0";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(280, 360);
    ctx.lineTo(720, 360);
    ctx.stroke();

    ctx.font = "18px Sans";
    ctx.fillText("Powered by Maria v3", 520, 400);

    // save
    const imgPath = path.join(__dirname, "cache", `userid_${uid}.png`);
    fs.writeFileSync(imgPath, canvas.toBuffer());

    api.sendMessage(
      {
        body: "🪪 User ID Card",
        attachment: fs.createReadStream(imgPath)
      },
      event.threadID,
      () => fs.unlinkSync(imgPath)
    );

  } catch (err) {
    console.log(err);
    api.sendMessage("❌ ID Card generate করতে সমস্যা হয়েছে", event.threadID);
  }
};
