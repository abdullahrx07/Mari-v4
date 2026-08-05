// Database-backed storage for the Anti-System (anti.js command + listen.js
// event checks). Previously this data lived only in anti.json on disk —
// on hosts with an ephemeral filesystem (Replit redeploys, container
// restarts, etc.) that file can reset and every protected box's saved
// name/picture/nickname data is lost.
//
// Now MongoDB (via the existing global.systemData key-value store, the
// same one used for "approved_threads") is the source of truth. anti.json
// is kept only as a local mirror/backup — nice for quick manual inspection,
// never required for the bot to keep working.

const fs = require("fs-extra");
const axios = require("axios");
const FormData = require("form-data");

const SYSTEM_KEY = "anti";

const DEFAULT_DATA = {
  boxname: [],
  boximage: [],
  antiout: {},
  antiNickname: []
};

function readLocalFile() {
  try {
    return JSON.parse(fs.readFileSync(global.anti, "utf8"));
  } catch (e) {
    return null;
  }
}

function writeLocalFile(data) {
  try {
    fs.writeFileSync(global.anti, JSON.stringify(data, null, 4));
  } catch (e) {
    console.error("[antiStore] Failed to write local anti.json backup:", e.message);
  }
}

function normalize(data) {
  data = data && typeof data === "object" ? data : {};
  if (!Array.isArray(data.boxname)) data.boxname = [];
  if (!Array.isArray(data.boximage)) data.boximage = [];
  if (!data.antiout || typeof data.antiout !== "object") data.antiout = {};
  if (!Array.isArray(data.antiNickname)) data.antiNickname = [];
  return data;
}

// Reads anti-system data. MongoDB is the source of truth; anti.json is only
// used as a fallback (e.g. DB briefly unreachable) or, on first ever run,
// to migrate whatever was already saved locally into the database.
async function getAntiData() {
  if (global.systemData && typeof global.systemData.get === "function") {
    try {
      let data = await global.systemData.get(SYSTEM_KEY, null);
      if (!data) {
        // First run / migration path: seed the DB from the legacy anti.json
        const local = readLocalFile();
        data = normalize(local || DEFAULT_DATA);
        await global.systemData.set(SYSTEM_KEY, data);
      }
      return normalize(data);
    } catch (e) {
      console.error("[antiStore] DB read failed, falling back to anti.json:", e.message);
    }
  }
  return normalize(readLocalFile() || { ...DEFAULT_DATA });
}

// Saves anti-system data. Written to MongoDB (durable) and mirrored to
// anti.json (best-effort local cache — failure here is never fatal).
async function saveAntiData(data) {
  data = normalize(data);
  writeLocalFile(data);
  if (global.systemData && typeof global.systemData.set === "function") {
    try {
      await global.systemData.set(SYSTEM_KEY, data);
      return true;
    } catch (e) {
      console.error("[antiStore] DB write failed, data only saved locally:", e.message);
      return false;
    }
  }
  return false;
}

module.exports = { getAntiData, saveAntiData, reuploadImage };

// Re-hosts a group photo URL to imgur so it survives even after the
// original Facebook CDN link expires. Streams the image straight into
// the upload request (no temp file on disk needed — the old
// global.api.imgur()/global.utils.imgur() helpers wrote to a
// srcipts/cmds/cache folder that doesn't exist in this project, which is
// why "anti data add" / "anti 2" were throwing errors).
async function reuploadImage(url) {
  if (!url) return null;
  const image = await axios.get(url, { responseType: "arraybuffer" });
  const form = new FormData();
  form.append("image", Buffer.from(image.data), { filename: `box_${Date.now()}.jpg` });
  const upload = await axios.post("https://api.imgur.com/3/upload", form, {
    headers: {
      ...form.getHeaders(),
      Authorization: "Client-ID c76eb7edd1459f3"
    }
  });
  if (!upload.data || !upload.data.success || !upload.data.data) {
    throw new Error("Imgur upload failed");
  }
  return upload.data.data.link;
}
