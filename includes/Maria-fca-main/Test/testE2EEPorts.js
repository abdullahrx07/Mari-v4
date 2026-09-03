"use strict";

/**
 * Tests for the E2EE modules ported from HerokeyVN/FB-Messenger-E2EE:
 *   - mediaCrypto   (AES-256-CBC + HMAC-SHA256 + HKDF)
 *   - mediaUpload   (toMediaUploadToken)
 *   - outboundCache (TTL + bounded eviction)
 *   - retryManager  (receipt parsing, retry limits)
 *   - prekeyMaintenance (sync top-up logic)
 *
 * Run from the Test/ folder:  node testE2EEPorts.js
 */

const assert = require("assert");
const path = require("path");

// ── helpers ───────────────────────────────────────────────────────────────────
function loadE2EE() {
  // Test/ lives next to e2ee/ inside the project root.
  return require(path.join(__dirname, "..", "e2ee", "e2ee"));
}

async function testMediaCrypto() {
  const e2ee = loadE2EE();
  const { encryptMedia, decryptMedia, expandMediaKey, MediaType } = e2ee;

  // 1. roundtrip
  const plaintext = Buffer.from("hello world this is a secret image");
  const enc = encryptMedia(plaintext, "image");
  assert.strictEqual(enc.mediaKey.length, 32, "mediaKey is 32 bytes");
  assert.strictEqual(enc.fileSHA256.length, 32, "fileSHA256 is 32 bytes");
  assert.strictEqual(enc.fileEncSHA256.length, 32, "fileEncSHA256 is 32 bytes");
  assert.strictEqual(enc.fileLength, plaintext.length, "fileLength matches");

  const dec = decryptMedia({
    data: enc.dataToUpload,
    mediaKey: enc.mediaKey,
    type: "image",
    fileSHA256: enc.fileSHA256,
    fileEncSHA256: enc.fileEncSHA256,
  });
  assert.ok(dec.equals(plaintext), "decrypt(encrypt(x)) === x");

  // 2. wrong key fails
  const wrongKey = Buffer.alloc(32, 1);
  assert.throws(
    () => decryptMedia({ data: enc.dataToUpload, mediaKey: wrongKey, type: "image" }),
    /Invalid media HMAC/,
    "wrong key throws HMAC error"
  );

  // 3. tampered data fails enc SHA256
  const tampered = Buffer.from(enc.dataToUpload);
  tampered[0] = tampered[0] ^ 0xff;
  assert.throws(
    () => decryptMedia({ data: tampered, mediaKey: enc.mediaKey, type: "image", fileEncSHA256: enc.fileEncSHA256 }),
    /Invalid media enc SHA256/,
    "tampered data throws enc SHA256 error"
  );

  // 4. expandMediaKey deterministic
  const key = Buffer.alloc(32, 7);
  const k1 = expandMediaKey(key, "image");
  const k2 = expandMediaKey(key, "image");
  assert.ok(k1.iv.equals(k2.iv), "HKDF deterministic iv");
  assert.strictEqual(k1.cipherKey.length, 32, "cipherKey 32 bytes");

  // 5. unknown type falls back to document
  const k3 = expandMediaKey(key, "nonexistent");
  const k4 = expandMediaKey(key, "document");
  assert.ok(k3.iv.equals(k4.iv), "unknown type falls back to document");

  console.log("✅ mediaCrypto: all tests passed");
}

async function testMediaUploadToken() {
  const e2ee = loadE2EE();
  const { mediaUpload } = e2ee;

  // URL-safe base64 (no +, /, =)
  const hash = Buffer.from("abcdefghijklmnopqrstuvwxyz012345");
  const token = mediaUpload.toMediaUploadToken(hash);
  assert.ok(!token.includes("+"), "no + in token");
  assert.ok(!token.includes("/"), "no / in token");
  assert.ok(token.length > 0, "token non-empty");

  // roundtrip back to base64
  const back = Buffer.from(token.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  assert.ok(back.equals(hash), "token decodes back to original hash");

  console.log("✅ mediaUpload: token tests passed");
}

async function testOutboundCache() {
  const e2ee = loadE2EE();
  const { OutboundMessageCache } = e2ee;

  const cache = new OutboundMessageCache({ ttlMs: 200, maxSize: 3 });

  // 1. set/get
  cache.set("m1", { payload: "hello", senderJid: "123@msgr" });
  assert.ok(cache.get("m1"), "get returns entry");
  assert.strictEqual(cache.get("m1").senderJid, "123@msgr");

  // 2. miss
  assert.strictEqual(cache.get("nope"), null, "missing id returns null");

  // 3. TTL expiry
  await new Promise((r) => setTimeout(r, 250));
  assert.strictEqual(cache.get("m1"), null, "expired entry returns null");

  // 4. bounded eviction (maxSize 3)
  const cache2 = new OutboundMessageCache({ ttlMs: 60000, maxSize: 3 });
  cache2.set("a", { payload: 1 });
  cache2.set("b", { payload: 2 });
  cache2.set("c", { payload: 3 });
  cache2.set("d", { payload: 4 }); // should evict "a"
  assert.strictEqual(cache2.get("a"), null, "oldest entry evicted");
  assert.ok(cache2.get("d"), "newest entry present");
  assert.strictEqual(cache2.size, 3, "size stays at maxSize");

  // 5. delete + clear
  cache2.delete("d");
  assert.strictEqual(cache2.get("d"), null, "delete works");
  cache2.clear();
  assert.strictEqual(cache2.size, 0, "clear empties");

  console.log("✅ outboundCache: all tests passed");
}

async function testRetryManager() {
  const e2ee = loadE2EE();
  const { E2EERetryManager, OutboundMessageCache } = e2ee;

  const cache = new OutboundMessageCache({ ttlMs: 60000 });
  let resentTo = null;
  let resentPayload = null;

  const rm = new E2EERetryManager({
    cache,
    getClient: () => ({
      sendPayloadToJid: async (jid, payload, opts) => {
        resentTo = jid;
        resentPayload = payload;
      },
    }),
    getSocket: () => ({}),
    getSelfJid: () => "self@msgr",
    getPreKeyBundle: async () => ({}),
    log: () => {}, // silent
  });

  // 1. no messageId -> no-op
  await rm.handleReceipt({ tag: "receipt", attrs: {} });
  assert.strictEqual(resentTo, null, "no id = no retry");

  // 2. unknown message -> no-op
  await rm.handleReceipt({ tag: "receipt", attrs: { id: "unknown" } });
  assert.strictEqual(resentTo, null, "unknown id = no retry");

  // 3. known message -> retry sent
  cache.set("m123", { payload: "secret", senderJid: "999@msgr" });
  await rm.handleReceipt({
    tag: "receipt",
    attrs: { id: "m123" },
    content: [{ tag: "retry", attrs: { id: "m123", count: "1" } }],
  });
  assert.strictEqual(resentTo, "999@msgr", "retry sent to cached senderJid");
  assert.strictEqual(resentPayload, "secret", "cached payload resent");

  // 4. retry count >= 10 -> dropped
  resentTo = null;
  await rm.handleReceipt({
    tag: "receipt",
    attrs: { id: "m123" },
    content: [{ tag: "retry", attrs: { id: "m123", count: "10" } }],
  });
  assert.strictEqual(resentTo, null, "retry count >= 10 dropped");

  console.log("✅ retryManager: all tests passed");
}

async function testPreKeyMaintenance() {
  const e2ee = loadE2EE();
  const { PreKeyMaintenance } = e2ee;

  let uploaded = 0;

  // 1. below min -> uploads
  const pm = new PreKeyMaintenance({
    getServerPreKeyCount: async () => 3,
    uploadPreKeys: async (count) => { uploaded = count; },
    minCount: 10,
    uploadCount: 50,
  });
  await pm.sync("test");
  assert.strictEqual(uploaded, 50, "uploads when below min");

  // 2. above min -> no upload
  uploaded = 0;
  const pm2 = new PreKeyMaintenance({
    getServerPreKeyCount: async () => 20,
    uploadPreKeys: async (count) => { uploaded = count; },
    minCount: 10,
  });
  await pm2.sync("test");
  assert.strictEqual(uploaded, 0, "no upload when above min");

  // 3. start/stop interval
  const pm3 = new PreKeyMaintenance({
    getServerPreKeyCount: async () => 20,
    uploadPreKeys: async () => {},
    intervalMs: 1000,
  });
  pm3.start();
  assert.ok(pm3.interval, "interval started");
  pm3.stop();
  assert.strictEqual(pm3.interval, null, "interval stopped");

  console.log("✅ prekeyMaintenance: all tests passed");
}

// ── run all ───────────────────────────────────────────────────────────────────
(async () => {
  try {
    await testMediaCrypto();
    await testMediaUploadToken();
    await testOutboundCache();
    await testRetryManager();
    await testPreKeyMaintenance();
    console.log("\n🎉 ALL E2EE PORT TESTS PASSED");
    process.exit(0);
  } catch (err) {
    console.error("\n❌ TEST FAILED:", err);
    process.exit(1);
  }
})();
