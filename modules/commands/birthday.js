module.exports.config = {
  name: "birthday",
  version: "1.0.0",
  hasPermssion: 0,
  credits: "ChatGPT for rX Abdullah",
  description: "Shows birthday countdown or wishes",
  usePrefix: true,
  commandCategory: "info",
  cooldowns: 5
};

module.exports.run = async ({ api, event }) => {
  const fs = global.nodemodule["fs-extra"];
  const request = global.nodemodule["request"];

  const now = new Date();
  let targetYear = now.getFullYear();
  const birthMonth = 8;
  const birthDate = 26;
  const birthday = new Date(targetYear, birthMonth, birthDate, 0, 0, 0);

  if (now > birthday) targetYear++;

  const target = new Date(targetYear, birthMonth, birthDate);
  const t = target - now;

  const seconds = Math.floor((t / 1000) % 60);
  const minutes = Math.floor((t / 1000 / 60) % 60);
  const hours = Math.floor((t / (1000 * 60 * 60)) % 24);
  const days = Math.floor(t / (1000 * 60 * 60 * 24));

  const imageURL = "https://i.postimg.cc/QMS23xxv/IMG-0839.jpg";
  const link = "\n\n🔗 m.me/rxabdullah007";

  const send = (msg) => {
    const callback = () => api.sendMessage({
      body: msg,
      attachment: fs.createReadStream(__dirname + "/cache/birthday.jpg")
    }, event.threadID, () => fs.unlinkSync(__dirname + "/cache/birthday.jpg"), event.messageID);

    request(encodeURI(imageURL))
      .pipe(fs.createWriteStream(__dirname + "/cache/birthday.jpg"))
      .on("close", () => callback());
  };

  if (days === 0 && hours === 0 && minutes === 0 && seconds <= 59) {
    return send(`🎉 আজ rX Abdullah এর জন্মদিন!\nসবাই উইশ করো 🥳💙\n📅 26 সেপ্টেম্বর, 2007 🎂${link}`);
  }

  return send(`📅 rX Abdullah এর জন্মদিন আসতে বাকি:\n\n⏳ ${days} দিন\n🕒 ${hours} ঘণ্টা\n🕑 ${minutes} মিনিট\n⏱️ ${seconds} সেকেন্ড${link}`);
};
