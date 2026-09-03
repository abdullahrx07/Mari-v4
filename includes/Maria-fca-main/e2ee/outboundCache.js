"use strict";

/**
 * Outbound Message Cache - pure Node.js port of HerokeyVN/FB-Messenger-E2EE.
 *
 * Caches recently-sent E2EE messages so that when Facebook sends a retry
 * receipt (recipient couldn't decrypt), we can re-send the exact payload.
 * Entries auto-expire after TTL and the cache is bounded.
 */

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_MAX_SIZE = 500;

class OutboundMessageCache {
  /**
   * @param {Object} [opts]
   * @param {number} [opts.ttlMs]     Time-to-live per entry
   * @param {number} [opts.maxSize]   Maximum entries (oldest evicted first)
   */
  constructor(opts) {
    opts = opts || {};
    this.ttlMs = opts.ttlMs != null ? opts.ttlMs : DEFAULT_TTL_MS;
    this.maxSize = opts.maxSize != null ? opts.maxSize : DEFAULT_MAX_SIZE;
    this._map = new Map(); // messageId -> { payload, senderJid, chatJid, timestamp }
  }

  /**
   * Store an outbound message payload.
   * @param {string} messageId
   * @param {Object} entry  { payload, senderJid, chatJid, ... }
   */
  set(messageId, entry) {
    if (!messageId) return;
    const key = String(messageId);

    // Evict oldest if at capacity
    if (this._map.size >= this.maxSize && !this._map.has(key)) {
      const firstKey = this._map.keys().next().value;
      if (firstKey !== undefined) this._map.delete(firstKey);
    }

    this._map.set(key, {
      payload: entry && entry.payload != null ? entry.payload : entry,
      senderJid: entry && entry.senderJid,
      chatJid: entry && entry.chatJid,
      frame: entry && entry.frame,
      timestamp: Date.now(),
    });
  }

  /**
   * Retrieve a cached entry, or null if missing / expired.
   */
  get(messageId) {
    if (!messageId) return null;
    const key = String(messageId);
    const entry = this._map.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.ttlMs) {
      this._map.delete(key);
      return null;
    }
    return entry;
  }

  delete(messageId) {
    if (!messageId) return false;
    return this._map.delete(String(messageId));
  }

  clear() {
    this._map.clear();
  }

  get size() {
    return this._map.size;
  }

  /** Remove all expired entries (called periodically if desired). */
  prune() {
    const now = Date.now();
    for (const [key, entry] of this._map) {
      if (now - entry.timestamp > this.ttlMs) this._map.delete(key);
    }
  }
}

module.exports = OutboundMessageCache;
