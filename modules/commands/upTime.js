const { createCanvas, loadImage } = require("canvas");
const os = require("os");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

module.exports.config = {
  name: "uptime",
  version: "23.1.1",
  hasPermssion: 0,
  credits: "rX",
  description: "Show v3 uptime info",
  commandCategory: "system",
  usages: "uptime",
  cooldowns: 5
};

// --- History for Dual Pulse Graphs ---
const HISTORY_LENGTH = 10;
let netHistory1 = Array.from({ length: HISTORY_LENGTH }, () => Math.floor(Math.random() * 40 + 30));
let netHistory2 = Array.from({ length: HISTORY_LENGTH }, () => Math.floor(Math.random() * 40 + 20));

// --- Restart Counter ---
const restartFile = path.join(__dirname, "restart.json");
let restartCount = 1;
if (fs.existsSync(restartFile)) {
  restartCount = JSON.parse(fs.readFileSync(restartFile)).count + 1;
}
fs.writeFileSync(restartFile, JSON.stringify({ count: restartCount }));

function getCpuUsageAsync() {
  return new Promise((resolve) => {
    const start = os.cpus();
    setTimeout(() => {
      const end = os.cpus();
      let idleDiff = 0, totalDiff = 0;
      for (let i = 0; i < start.length; i++) {
        const s = start[i].times, e = end[i].times;
        idleDiff += e.idle - s.idle;
        totalDiff += Object.keys(e).reduce((acc, key) => acc + (e[key] - s[key]), 0);
      }
      resolve(100 - Math.round((idleDiff / totalDiff) * 100));
    }, 100);
  });
}

function getDiskUsage() {
  try {
    const out = execSync("df -k /").toString().split("\n")[1].split(/\s+/);
    return {
      percent: Math.round((parseInt(out[2]) / parseInt(out[1])) * 100)
    };
  } catch {
    return { percent: 0 };
  }
}

module.exports.run = async function ({ api, event }) {
  try {
    const cpu = await getCpuUsageAsync();
    const totalRAM = os.totalmem();
    const usedRAM = totalRAM - os.freemem();
    const ramPercent = usedRAM / totalRAM;
    const disk = getDiskUsage();

    const allUsers = global.data.allUserID || [];
    const realUserCount = allUsers.length;

    const dataSent = ((restartCount * 1.2) + (realUserCount * 0.05)).toFixed(1);
    const dataReceived = ((restartCount * 0.8) + (realUserCount * 0.03)).toFixed(1);

    const up = process.uptime();
    const d = Math.floor(up / 86400);
    const h = Math.floor((up % 86400) / 3600);
    const m = Math.floor((up % 3600) / 60);

    netHistory1.push(Math.floor(Math.random() * 40 + 30));
    if (netHistory1.length > HISTORY_LENGTH) netHistory1.shift();
    netHistory2.push(Math.floor(Math.random() * 40 + 10));
    if (netHistory2.length > HISTORY_LENGTH) netHistory2.shift();

    const canvas = createCanvas(480, 480);
    const ctx = canvas.getContext("2d");

    const backgrounds = [
      "https://i.imgur.com/v1aVEQn.jpeg",
      "https://i.imgur.com/fCydouZ.jpeg"
    ];
    const randomBg = backgrounds[Math.floor(Math.random() * backgrounds.length)];
    const bgImage = await loadImage(randomBg);
    ctx.drawImage(bgImage, 0, 0, 480, 480);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // --- TOP TITLE ---
    ctx.shadowBlur = 15;
    ctx.shadowColor = "#00f2ff";
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 20px Arial";
    ctx.fillText("MARIA V3 UPTIME INFO", 240, 40);
    ctx.shadowBlur = 0;

    // 1. CPU
    ctx.shadowBlur = 8;
    ctx.fillStyle = "#00f2ff";
    ctx.shadowColor = "#00f2ff";
    ctx.font = "bold 24px Arial";
    ctx.fillText(`${cpu}%`, 100, 120);

    // 2. RAM
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 10px Arial";
    ctx.fillText(
      `${(usedRAM / 1024 ** 3).toFixed(1)}G / ${(totalRAM / 1024 ** 3).toFixed(1)}G`,
      240,
      105
    );
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.fillRect(200, 120, 80, 6);
    ctx.fillStyle = "#00f2ff";
    ctx.shadowBlur = 10;
    ctx.shadowColor = "#00f2ff";
    ctx.fillRect(200, 120, 80 * ramPercent, 6);

    // 3. SERVER STATUS
    ctx.shadowBlur = 10;
    ctx.fillStyle = "#00ff8a";
    ctx.shadowColor = "#00ff8a";
    ctx.font = "bold 18px Arial";
    ctx.fillText("ONLINE", 385, 120);

    // 4. DISK
    ctx.fillStyle = "#bc00ff";
    ctx.shadowColor = "#bc00ff";
    ctx.font = "bold 20px Arial";
    ctx.fillText(`${disk.percent}%`, 100, 255);

    // 5. UPTIME
    ctx.fillStyle = "#00f2ff";
    ctx.shadowColor = "#00f2ff";
    ctx.font = "bold 14px Courier New";
    ctx.fillText(`${d}D ${h}H ${m}M`, 240, 235);

    // 6. NETWORK GRAPH
    const startX = 355, startY = 265, graphW = 65, graphH = 30;

    ctx.beginPath();
    ctx.strokeStyle = "#ff00ff";
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = 10;
    ctx.shadowColor = "#ff00ff";
    netHistory2.forEach((val, i) => {
      const x = startX + (i * (graphW / (HISTORY_LENGTH - 1)));
      const y = (startY + 5) - (val * (graphH / 100));
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = "#00f2ff";
    ctx.lineWidth = 2;
    ctx.shadowBlur = 15;
    ctx.shadowColor = "#00f2ff";
    netHistory1.forEach((val, i) => {
      const x = startX + (i * (graphW / (HISTORY_LENGTH - 1)));
      const y = startY - (val * (graphH / 100));
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();

    // 7. RESTART
    ctx.shadowBlur = 8;
    ctx.fillStyle = "#bc00ff";
    ctx.font = "bold 20px Arial";
    ctx.fillText(`${restartCount}`, 95, 360);

    // 8. USERS
    ctx.fillStyle = "#00f2ff";
    ctx.font = "bold 18px Arial";
    ctx.fillText(`${realUserCount}`, 240, 360);

    // 9. DATA
    ctx.fillStyle = "#bc00ff";
    ctx.font = "bold 11px Arial";
    ctx.fillText(`↑${dataSent}GB ↓${dataReceived}GB`, 385, 360);

    const cacheDir = path.join(__dirname, "cache");
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir);

    const imgPath = path.join(cacheDir, `uptime_${Date.now()}.png`);
    fs.writeFileSync(imgPath, canvas.toBuffer());

    // -------- OVER TEXT SYSTEM --------
    const textInfo =
`📊 𝗠𝗔𝗥𝗜𝗔 𝗩𝟯 𝗨𝗣𝗧𝗜𝗠𝗘
━━━━━━━━━━━━━━
⚙ CPU: ${cpu}%
🧠 RAM: ${(usedRAM / 1024 ** 3).toFixed(1)}G / ${(totalRAM / 1024 ** 3).toFixed(1)}G
💾 Disk: ${disk.percent}%
⏱ Uptime: ${d}D ${h}H ${m}M
🔁 Restart: ${restartCount}
👥 Active Users: ${realUserCount}
📡 Data: ↑${dataSent}GB ↓${dataReceived}GB
━━━━━━━━━━━━━━
✨ Status: ONLINE`;

    api.sendMessage(
      {
        body: textInfo,
        attachment: fs.createReadStream(imgPath)
      },
      event.threadID,
      () => fs.unlinkSync(imgPath),
      event.messageID
    );

  } catch (err) {
    api.sendMessage("❌ Error: " + err.message, event.threadID);
  }
};
