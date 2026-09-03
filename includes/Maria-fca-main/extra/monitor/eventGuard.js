"use strict";

/**
 * eventGuard.js
 *
 * Duplicate-event guard for the MQTT listener. Facebook sometimes delivers
 * the same event (same threadID + same messageID) 2-3 times in quick
 * succession; this guard lets the first occurrence through and skips the
 * rest, logging each skip with the shared `[ MARI -FCA ]` frame.
 *
 * Uses a TTL-based in-memory Map with periodic cleanup so memory stays
 * bounded over long sessions.
 */

const mariLogger = require('./mariLogger');

const TTL_MS = 60 * 1000;
const CLEANUP_INTERVAL_MS = 30 * 1000;

// key -> expiry timestamp (ms since epoch)
const seen = new Map();

/**
 * Builds a dedup key for an event: `type|threadID|messageID`.
 *
 * Only events carrying a real messageID are deduplicated. Events without a
 * messageID (e.g. `typ` / typing and `presence` notifications, which have no
 * unique identifier and legitimately repeat many times per second) are never
 * treated as duplicates — they pass straight through. Returns null (guard
 * skipped) when there is no messageID.
 */
function buildKey(event) {
    if (!event || typeof event !== 'object') return null;
    const messageID = event.messageID;
    if (messageID == null) return null;
    const threadID = event.threadID != null ? event.threadID : '';
    return `${event.type}|${threadID}|${messageID}`;
}

/**
 * Returns true if this event was already seen within the TTL window.
 * Otherwise records it and returns false.
 */
function isDuplicate(event) {
    const key = buildKey(event);
    if (key === null) return false;

    const now = Date.now();
    const expiry = seen.get(key);
    if (expiry !== undefined && expiry > now) return true;

    seen.set(key, now + TTL_MS);
    return false;
}

/**
 * Wraps an error-first event callback with duplicate filtering. Errors pass
 * straight through; duplicate events are skipped (with a red `[ MARI -FCA ]`
 * log line) and never reach the callback.
 */
function wrap(callback) {
    return function (err, event) {
        if (err) return callback(err, event);
        if (isDuplicate(event)) {
            mariLogger.log(
                `Duplicate event skipped → type: ${event.type} | thread: ${event.threadID != null ? event.threadID : 'N/A'} | msg: ${event.messageID != null ? event.messageID : 'N/A'}`,
                'over'
            );
            return;
        }
        return callback(err, event);
    };
}

const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, expiry] of seen) {
        if (expiry <= now) seen.delete(key);
    }
}, CLEANUP_INTERVAL_MS);

if (cleanupTimer && typeof cleanupTimer.unref === 'function') {
    cleanupTimer.unref();
}

module.exports = {
    wrap,
    isDuplicate,
    buildKey
};
