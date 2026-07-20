const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");
const Canvas = require("canvas");
Canvas.registerFont(path.join(__dirname, "cache", "kalpurush.ttf"), {
  family: "Kalpurush"
});

module.exports.config = {
  name: "joinnoti",
  version: "4.4.0",
  credits: "rX Abdullah",
  eventType: ["log:subscribe"],
  description: "Welcome image with profile borders. Robust for E2EE and regular groups."
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Safe api.getThreadInfo with cached fallback */
async function safeGetThreadInfo(api, threadID) {
  // 1. Try in-memory cache first (avoids API call entirely if already loaded)
  const cached = global.data && global.data.threadInfo && global.data.threadInfo.get(String(threadID));
  if (cached && cached.threadName) return cached;

  // 2. Fall back to live API
  try {
    return await api.getThreadInfo(threadID);
  } catch (e) {
    console.error("[joinNoti] getThreadInfo failed:", e.message || e);
    return null;
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

module.exports.run = async function ({ api, event, Users }) {
  const { threadID, logMessageData } = event;

  // E2EE group join events come via MQTT with the numeric thread ID, but if
  // for any reason a JID arrives here, we skip the canvas path entirely.
  const isE2EEJid = typeof threadID === "string" && threadID.includes("@");

  // Safely extract the added participant — handle both addedParticipants array
  // and any single-participant variant some event payloads use.
  const added =
    (logMessageData && logMessageData.addedParticipants && logMessageData.addedParticipants[0]) ||
    (logMessageData && logMessageData.participant) ||
    null;

  if (!added) return;

  const userID = String(added.userFbId || added.id || added.userId || "");
  if (!userID) return;

  const botID = api.getCurrentUserID();

  // ═══ CASE 1: BOT ADDED ═══════════════════════════════════════════════════
  if (userID == botID) {
    api.sendMessage(
      "𝐓𝐡𝐚𝐧𝐤𝐬 𝐟𝐨𝐫 𝐚𝐝𝐝𝐢𝐧𝐠 𝐦𝐞 ❤️\n𝐓𝐲𝐩𝐞 !𝐡𝐞𝐥𝐩 𝐭𝐨 𝐬𝐞𝐞 𝐦𝐲 𝐜𝐨𝐦𝐦𝐚𝐧𝐝𝐬!",
      threadID
    );
    // changeNickname only works on regular (non-JID) threads
    if (!isE2EEJid) {
      try { await api.changeNickname("Sııƞƞeɽ мΛяเα 倫ッ", threadID, botID); } catch {}
    }
    return;
  }

  const userName = added.fullName || added.name || `User ${userID}`;
  const inviterID = event.author ? String(event.author) : null;
  const inviterName = inviterID
    ? await Users.getNameUser(inviterID).catch(() => "someone")
    : "someone";

  // ═══ CASE 2: E2EE JID thread — text-only welcome ═════════════════════════
  if (isE2EEJid) {
    return api.sendMessage(
      `🌸 Welcome ${userName} to the group!\n` +
      `📨 Invited by: ${inviterName}`,
      threadID
    );
  }

  // ═══ CASE 3: Regular group — canvas welcome image ════════════════════════

  // Get thread info safely (cached or live)
  const info = await safeGetThreadInfo(api, threadID);

  const groupName    = (info && info.threadName)    || "this group";
  const adminCount   = (info && Array.isArray(info.adminIDs))   ? info.adminIDs.length   : 0;
  const memberCount  = (info && Array.isArray(info.participantIDs)) ? info.participantIDs.length : 0;
  const userInfoArr  = (info && Array.isArray(info.userInfo))   ? info.userInfo          : [];
  const male         = userInfoArr.filter(u => u.gender === "MALE").length;
  const female       = userInfoArr.filter(u => u.gender === "FEMALE").length;
  const groupPhotoURL = (info && info.imageSrc) || null;

  const avatarURL = `https://graph.facebook.com/${userID}/picture?width=512&height=512&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`;
  const inviterAvatarURL = inviterID
    ? `https://graph.facebook.com/${inviterID}/picture?width=512&height=512&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`
    : null;

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

  const avt     = path.join(cache, `avt_${userID}.png`);
  const inv     = path.join(cache, `inv_${inviterID || "unknown"}.png`);
  const grp     = path.join(cache, `grp_${threadID}.png`);
  const bgFile  = path.join(cache, `bg_${Date.now()}.png`);
  const out     = path.join(cache, `welcome_${userID}_${Date.now()}.png`);

  const cleanup = () => {
    for (const f of [avt, inv, grp, bgFile, out]) {
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
    }
  };

  try {
    // Download images — each wrapped independently so one failure doesn't kill everything
    await axios.get(avatarURL, { responseType: "arraybuffer", timeout: 10000 })
      .then(r => fs.writeFileSync(avt, r.data))
      .catch(() => null);

    if (inviterAvatarURL) {
      await axios.get(inviterAvatarURL, { responseType: "arraybuffer", timeout: 10000 })
        .then(r => fs.writeFileSync(inv, r.data))
        .catch(() => null);
    }

    if (groupPhotoURL) {
      await axios.get(groupPhotoURL, { responseType: "arraybuffer", timeout: 10000 })
        .then(r => fs.writeFileSync(grp, r.data))
        .catch(() => null);
    }

    await axios.get(backgroundURL, { responseType: "arraybuffer", timeout: 10000 })
      .then(r => fs.writeFileSync(bgFile, r.data))
      .catch(() => null);

    // If the user avatar failed to download, fall back to a text welcome
    if (!fs.existsSync(avt)) {
      cleanup();
      return api.sendMessage(
        `🌸 Welcome @${userName} to ${groupName}!\nInvited by: ${inviterName}`,
        threadID
      );
    }

    const canvas = Canvas.createCanvas(1280, 720);
    const ctx = canvas.getContext("2d");

    // Background
    if (fs.existsSync(bgFile)) {
      const bg = await Canvas.loadImage(bgFile);
      ctx.drawImage(bg, 0, 0, 1280, 720);
    } else {
      ctx.fillStyle = "#1a1a2e";
      ctx.fillRect(0, 0, 1280, 720);
    }

    // Header bar
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, 1280, 130);

    // Group photo (top-left circle)
    if (groupPhotoURL && fs.existsSync(grp)) {
      try {
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
      } catch {}
    }

    // Group name & stats
    ctx.fillStyle = "#fff";
    ctx.font = "bold 35px Kalpurush";
    ctx.fillText(groupName, 180, 60);
    ctx.font = "26px Kalpurush";
    if (memberCount) ctx.fillText(`${memberCount} members`, 180, 100);
    if (adminCount)  ctx.fillText(`${adminCount} admins`,   360, 100);

    // Inviter name (top-right)
    ctx.font = "bold 28px Kalpurush";
    ctx.fillStyle = "#fff";
    ctx.fillText("Invited by:", 950, 50);
    ctx.font = "bold 30px Kalpurush";
    ctx.fillStyle = "#ff69b4";
    ctx.fillText(inviterName, 950, 90);

    // Inviter avatar circle (top-right)
    if (inviterID && fs.existsSync(inv)) {
      try {
        const invPic = await Canvas.loadImage(inv);
        ctx.save();
        ctx.beginPath();
        ctx.arc(1190, 65, 45, 0, Math.PI * 2);
        ctx.strokeStyle = "#ff69b4";
        ctx.lineWidth = 5;
        ctx.stroke();
        ctx.clip();
        ctx.drawImage(invPic, 1150, 25, 80, 80);
        ctx.restore();
      } catch {}
    }

    // Neon WELCOME text
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
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";

    // Main user avatar (center)
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

    // Neon username
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

    // Footer bar
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 650, 1280, 70);
    ctx.font = "28px Kalpurush";
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.fillText(
      `✰ ${memberCount} Members     ♂️ ${male} Male     ♀️ ${female} Female     ★ Thanks for using: Maria v3`,
      640, 695
    );

    fs.writeFileSync(out, canvas.toBuffer());

    api.sendMessage(
      {
        body: `🌸 Welcome @${userName} to ${groupName}!`,
        attachment: fs.createReadStream(out),
        mentions: [{ tag: `@${userName}`, id: userID }]
      },
      threadID,
      () => cleanup()
    );

  } catch (e) {
    cleanup();
    console.error("[joinNoti] canvas error:", e.message || e);
    // Graceful text fallback so the user still gets welcomed
    api.sendMessage(
      `🌸 Welcome @${userName} to ${groupName}!\nInvited by: ${inviterName}`,
      threadID
    );
  }
};
