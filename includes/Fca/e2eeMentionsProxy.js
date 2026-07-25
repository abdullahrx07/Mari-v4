'use strict';
/**
 * E2EE Mentions Proxy — bot/includes/Fca/e2eeMentionsProxy.js
 *
 * সমস্যা:
 *   E2EE group-এ user message পাঠালে event.mentions খালি থাকে।
 *   api.getThreadInfo("jid@g.us") call করলে শুধু sender-এর info আসে।
 *
 * সমাধান (Proxy System):
 *   1. Primary:  event.mentions চেক করো — কিছু থাকলে সেটাই ব্যবহার করো
 *   2. Fallback: mentions খালি হলে api.getThreadInfo(numericID) দিয়ে
 *                সব participant fetch করে event.mentions populate করো
 *
 * Cache: প্রতিটি thread-এর info 5 মিনিট cache করা থাকবে
 *        যাতে প্রতি message-এ API call না হয়।
 */

const rxLog = require('../../utils/rxLog');

// ─── Cache ────────────────────────────────────────────────────────────────────
const _cache = new Map();           // numericID → { info, ts }
const CACHE_TTL = 5 * 60 * 1000;   // 5 minutes

// JID → numeric ID  (e.g. "12345@g.us" → "12345")
function toNumericID(jid) {
  return String(jid).split('@')[0];
}

// E2EE group check
function isE2EEGroup(event) {
  return (
    typeof event.threadID === 'string' &&
    event.threadID.includes('@') &&
    (event.isGroup === true || event.isGroup === 'true')
  );
}

// ─── getThreadInfo with cache ─────────────────────────────────────────────────
function getThreadInfoCached(api, jid) {
  const numericID = toNumericID(jid);

  const cached = _cache.get(numericID);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return Promise.resolve(cached.info);
  }

  return new Promise((resolve) => {
    try {
      api.getThreadInfo(numericID, (err, result) => {
        if (err || !result) {
          resolve(null);
          return;
        }
        _cache.set(numericID, { info: result, ts: Date.now() });
        resolve(result);
      });
    } catch (e) {
      resolve(null);
    }
  });
}

// ─── Name matching: body থেকে @mention parse করে participant match ─────────────
/**
 * message body-تے "@SomeName" আছে কিনা দেখে participant list থেকে match করে।
 * can match exact full-name (same to same) or more.
 * Return: { uid: name } শুধু matched জনের, অথবা null যদি কেউ না মেলে।
 */
function matchMentionsFromBody(body, allParticipants) {
  if (!body || !body.includes('@')) return null;

  const bodyLower = body.toLowerCase().replace(/\s+/g, ' ');
  const matched = {};

  for (const [uid, name] of Object.entries(allParticipants)) {
    if (!name) continue;
    const nameLower = name.trim().toLowerCase().replace(/\s+/g, ' ');

    // exact full name match — "@Jannatul Ferdous Mawa"
    if (bodyLower.includes('@' + nameLower)) {
      matched[uid] = name;
    }
  }

  return Object.keys(matched).length > 0 ? matched : null;
}

// ─── Core: patch event.mentions ───────────────────────────────────────────────
/**
 * patchE2EEMentions(api, event)
 *
 * E2EE group message-এ mentions খালি থাকলে proxy দিয়ে
 * body থেকে নাম parse করে শুধু সেই participant(s) event.mentions-এ দেবে।
 */
async function patchE2EEMentions(api, event) {
  // Only for E2EE groups
  if (!isE2EEGroup(event)) return event;

  // ── Primary check ──────────────────────────────────────────────────────────
  const hasMentions =
    event.mentions &&
    typeof event.mentions === 'object' &&
    Object.keys(event.mentions).length > 0;

  if (hasMentions) {
    // E2EE primary method worked fine
    return event;
  }

  // body-তে @ না থাকলে proxy দরকার নেই
  if (!event.body || !event.body.includes('@')) return event;

  // ── Proxy fallback ─────────────────────────────────────────────────────────
  const info = await getThreadInfoCached(api, event.threadID);
  if (!info || !Array.isArray(info.participantIDs) || info.participantIDs.length === 0) {
    return event;
  }

  const botID = String(api.getCurrentUserID());

  // সব participant-এর uid→name map (bot বাদে)
  const allParticipants = {};
  for (const uid of info.participantIDs) {
    const suid = String(uid);
    if (suid === botID) continue;
    const userMeta = Array.isArray(info.userInfo)
      ? info.userInfo.find((u) => String(u.id) === suid)
      : null;
    allParticipants[suid] = (userMeta && userMeta.name) ? userMeta.name : '';
  }

  // body থেকে @mention করা নাম(গুলো) parse করে match খোঁজো
  const matched = matchMentionsFromBody(event.body, allParticipants);

  if (matched && Object.keys(matched).length > 0) {
    event.mentions = matched;
    event._mentionsFromProxy = true;
    event._proxyThreadInfo = info;
    try {
      rxLog.mentionsProxy(event.threadID, Object.keys(matched).length);
    } catch (_) {}
  }

  return event;
}

// ─── Warm cache ───────────────────────────────
async function warmCache(api, jid) {
  return getThreadInfoCached(api, jid);
}

// ─── Invalidate ───────────────────────
function invalidateCache(jid) {
  _cache.delete(toNumericID(jid));
}

// ─── Get cached info synchronously (if available) ─────────────────────────
function getCachedInfo(jid) {
  const entry = _cache.get(toNumericID(jid));
  if (!entry || Date.now() - entry.ts >= CACHE_TTL) return null;
  return entry.info;
}

module.exports = {
  patchE2EEMentions,
  getThreadInfoCached,
  warmCache,
  invalidateCache,
  getCachedInfo,
  toNumericID,
  isE2EEGroup,
};
