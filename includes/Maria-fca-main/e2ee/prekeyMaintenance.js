"use strict";

/**
 * E2EE Prekey Maintenance - pure Node.js port of HerokeyVN/FB-Messenger-E2EE.
 *
 * Periodically tops up one-time prekeys without rotating the registered device.
 * Without this, once the server runs out of your one-time prekeys, new users
 * cannot establish Signal sessions with you and your E2EE DMs stop working.
 */

const DEFAULT_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const DEFAULT_MIN_COUNT   = 10;
const DEFAULT_UPLOAD_COUNT = 50;

class PreKeyMaintenance {
  /**
   * @param {Object} opts
   * @param {Function} opts.getServerPreKeyCount  () => Promise<number>
   * @param {Function} opts.uploadPreKeys         (count: number) => Promise<void>
   * @param {Function} [opts.getSocket]           () => socket|null  (null = offline)
   * @param {Function} [opts.getStore]            () => store|null   (null = not ready)
   * @param {number}   [opts.intervalMs]
   * @param {number}   [opts.minCount]
   * @param {number}   [opts.uploadCount]
   */
  constructor(opts) {
    if (!opts || typeof opts.getServerPreKeyCount !== "function" || typeof opts.uploadPreKeys !== "function") {
      throw new Error("PreKeyMaintenance: getServerPreKeyCount and uploadPreKeys are required");
    }
    this.opts = opts;
    this.interval = null;
  }

  start() {
    this.stop();
    const intervalMs = Number(
      this.opts.intervalMs != null
        ? this.opts.intervalMs
        : (process.env.FB_E2EE_PREKEY_SYNC_INTERVAL_MS || DEFAULT_INTERVAL_MS)
    );
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) return;

    this.interval = setInterval(() => {
      this.sync("periodic").catch((err) => {
        console.error("[E2EE PreKeyMaintenance] periodic sync failed:", err && err.message ? err.message : err);
      });
    }, intervalMs);

    if (typeof this.interval.unref === "function") this.interval.unref();
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /**
   * Run one sync pass. Safe to call manually (e.g. after login, before sending).
   */
  async sync(reason) {
    if (typeof this.opts.getSocket === "function" && !this.opts.getSocket()) return;
    if (typeof this.opts.getStore === "function" && !this.opts.getStore()) return;

    const minCount = Number(
      this.opts.minCount != null
        ? this.opts.minCount
        : (process.env.FB_E2EE_PREKEY_MIN_COUNT || DEFAULT_MIN_COUNT)
    );
    const uploadCount = Number(
      this.opts.uploadCount != null
        ? this.opts.uploadCount
        : (process.env.FB_E2EE_PREKEY_UPLOAD_COUNT || DEFAULT_UPLOAD_COUNT)
    );

    try {
      const serverCount = await this.opts.getServerPreKeyCount();
      console.log(`[E2EE PreKeyMaintenance] sync (${reason || "manual"}): server has ${serverCount} prekeys`);

      if (serverCount < minCount) {
        await this.opts.uploadPreKeys(uploadCount);
        console.log(`[E2EE PreKeyMaintenance] uploaded ${uploadCount} E2EE prekeys without changing registered device`);
      }
    } catch (err) {
      console.error(`[E2EE PreKeyMaintenance] sync failed (${reason || "manual"}):`, err && err.message ? err.message : err);
    }
  }
}

module.exports = PreKeyMaintenance;
