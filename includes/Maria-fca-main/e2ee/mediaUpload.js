"use strict";

/**
 * E2EE Media Upload - pure Node.js port of HerokeyVN/FB-Messenger-E2EE.
 *
 * Upload encrypted media bytes to Facebook's upload CDN (wa-msgr/mms).
 * Supports retry on 401 by refreshing the upload config.
 */

const https = require("https");
const { URL } = require("url");

/**
 * Convert fileEncSHA256 to the URL-safe token used in upload paths.
 */
function toMediaUploadToken(fileEncSHA256) {
  return fileEncSHA256.toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
}

/**
 * Upload encrypted media bytes to Facebook's upload CDN.
 * Supports retry on 401 by refreshing the upload config.
 *
 * @param {Object} config        MediaUploadConfig { host, auth }
 * @param {Buffer} data          Encrypted media payload
 * @param {Buffer} fileEncSHA256 SHA256 of encrypted payload
 * @param {string} mmsType       MmsType string ("image", "video", "ptt", "document", ...)
 * @param {Object} options       { refreshConfig?, maxRetries? }
 * @returns {Promise<{url, directPath, handle, objectId}>}
 */
async function uploadMedia(config, data, fileEncSHA256, mmsType, options) {
  if (!config || !config.auth) {
    throw new Error("Missing media upload auth token; query media_conn before uploading E2EE media");
  }

  const token = toMediaUploadToken(fileEncSHA256);
  const maxRetries = options && options.maxRetries != null ? options.maxRetries : 1;
  let currentConfig = config;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const uploadUrl = `https://${currentConfig.host}/wa-msgr/mms/${mmsType}/${token}?auth=${encodeURIComponent(currentConfig.auth)}&token=${encodeURIComponent(token)}`;

    const result = await _postBuffer(uploadUrl, data, {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(data.length),
      "Origin": "https://www.facebook.com",
      "Referer": "https://www.facebook.com/",
    });

    if (result.statusCode >= 200 && result.statusCode < 300) {
      let json = {};
      try { json = JSON.parse(result.body); } catch (_) {}
      const stringField = (...keys) => {
        for (const key of keys) {
          const value = json[key];
          if (typeof value === "string") return value;
          if (typeof value === "number") return String(value);
        }
        return "";
      };

      return {
        url: stringField("url"),
        directPath: stringField("direct_path", "directPath"),
        handle: stringField("handle"),
        objectId: stringField("object_id", "objectID", "objectId"),
      };
    }

    // On 401, try to refresh config and retry
    if (result.statusCode === 401 && attempt < maxRetries && options && typeof options.refreshConfig === "function") {
      const body = result.body || "";
      console.warn(`Media upload 401 (attempt ${attempt + 1}), refreshing config...`, body.slice(0, 200));
      currentConfig = await options.refreshConfig();
      if (!currentConfig || !currentConfig.auth) {
        throw new Error("Media upload refresh returned empty auth token");
      }
      continue;
    }

    const body = result.body || "";
    throw new Error(`Media upload failed: HTTP ${result.statusCode} - ${body}`);
  }

  throw new Error("Media upload failed after retries");
}

function _postBuffer(urlStr, data, headers) {
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(urlStr); } catch (e) { return reject(e); }

    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: parsed.pathname + parsed.search,
        method: "POST",
        headers: headers,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      }
    );

    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

module.exports = {
  toMediaUploadToken,
  uploadMedia,
};
