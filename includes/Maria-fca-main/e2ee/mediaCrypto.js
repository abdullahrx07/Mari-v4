"use strict";

/**
 * E2EE Media Crypto - pure Node.js port of HerokeyVN/FB-Messenger-E2EE
 * Layer 4: AES-256-CBC + HMAC-SHA256 + HKDF media scheme.
 * No Signal Protocol needed here - this is pure symmetric crypto.
 */

const { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, createHash } = require("crypto");

// Media type -> HKDF info string
const MediaType = {
  image:    "WhatsApp Image Keys",
  video:    "WhatsApp Video Keys",
  audio:    "WhatsApp Audio Keys",
  document: "WhatsApp Document Keys",
  sticker:  "WhatsApp Image Keys",
  history:  "WhatsApp History Keys",
  appstate: "WhatsApp App State Keys",
};

// MMS type strings used in upload/download URLs
const MmsType = {
  image:    "image",
  video:    "video",
  audio:    "ptt",
  document: "document",
  sticker:  "image",
  history:  "md-msg-hist",
  appstate: "md-app-state",
};

/**
 * HKDF-SHA256 expand of mediaKey into iv + cipherKey + macKey + refKey (112 bytes total).
 */
function expandMediaKey(mediaKey, type) {
  const info = MediaType[type] || MediaType.document;
  const expanded = Buffer.from(
    hkdfSync("sha256", mediaKey, Buffer.alloc(0), info, 112),
  );
  return {
    iv: expanded.subarray(0, 16),
    cipherKey: expanded.subarray(16, 48),
    macKey: expanded.subarray(48, 80),
    refKey: expanded.subarray(80, 112),
  };
}

/**
 * Encrypt media for upload.
 */
function encryptMedia(plaintext, type) {
  const mediaKey = randomBytes(32);
  const { iv, cipherKey, macKey } = expandMediaKey(mediaKey, type);

  const cipher = createCipheriv("aes-256-cbc", cipherKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  const mac = createHmac("sha256", macKey)
    .update(iv)
    .update(ciphertext)
    .digest()
    .subarray(0, 10);

  const dataToUpload = Buffer.concat([ciphertext, mac]);

  return {
    mediaKey,
    fileSHA256: Buffer.from(createHash("sha256").update(plaintext).digest()),
    fileEncSHA256: Buffer.from(createHash("sha256").update(dataToUpload).digest()),
    fileLength: plaintext.length,
    dataToUpload,
  };
}

const MEDIA_MAC_LENGTH = 10;

/**
 * Decrypt downloaded E2EE media.
 */
function decryptMedia(opts) {
  const { data, mediaKey, type, fileSHA256, fileEncSHA256 } = opts || {};

  if (!Buffer.isBuffer(data)) throw new Error("decryptMedia: data must be a Buffer");
  if (data.length <= MEDIA_MAC_LENGTH) throw new Error(`Media data too short (${data.length} bytes)`);

  if (fileEncSHA256) {
    const actual = createHash("sha256").update(data).digest();
    if (!actual.equals(fileEncSHA256)) throw new Error("Invalid media enc SHA256 - data corrupted or tampered");
  }

  const ciphertext = data.subarray(0, -MEDIA_MAC_LENGTH);
  const mac = data.subarray(-MEDIA_MAC_LENGTH);

  const { iv, cipherKey, macKey } = expandMediaKey(mediaKey, type || "document");

  const expectedMac = createHmac("sha256", macKey)
    .update(iv)
    .update(ciphertext)
    .digest()
    .subarray(0, MEDIA_MAC_LENGTH);

  if (!expectedMac.equals(mac)) throw new Error("Invalid media HMAC - data corrupted or wrong key");

  const decipher = createDecipheriv("aes-256-cbc", cipherKey, iv);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  if (fileSHA256) {
    const actual = createHash("sha256").update(plaintext).digest();
    if (!actual.equals(fileSHA256)) throw new Error("Invalid media SHA256 - file corrupted after decryption");
  }

  return plaintext;
}

function sha256(data) {
  return Buffer.from(createHash("sha256").update(data).digest());
}

module.exports = {
  MediaType,
  MmsType,
  expandMediaKey,
  encryptMedia,
  decryptMedia,
  sha256,
};
