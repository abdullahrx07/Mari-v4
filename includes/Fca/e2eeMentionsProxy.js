'use strict';

const rxLog = require('../../utils/rxLog');

const _cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

function toNumericID(jid) {
  return String(jid).split('@')[0];
}

function isE2EEGroup(event) {
  return (
    typeof event.threadID === 'string' &&
    event.threadID.includes('@') &&
    (event.isGroup === true || event.isGroup === 'true')
  );
}

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
    } catch {
      resolve(null);
    }
  });
}

function matchMentionsFromBody(body, allParticipants) {
  if (!body || !body.includes('@')) return null;

  const bodyLower = body.toLowerCase().replace(/\s+/g, ' ');
  const matched = {};

  for (const [uid, name] of Object.entries(allParticipants)) {
    if (!name) continue;

    const nameLower = name.trim().toLowerCase().replace(/\s+/g, ' ');

    if (bodyLower.includes('@' + nameLower)) {
      matched[uid] = name;
    }
  }

  return Object.keys(matched).length ? matched : null;
}

async function patchE2EEMentions(api, event) {
  if (!isE2EEGroup(event)) return event;

  const hasMentions =
    event.mentions &&
    typeof event.mentions === 'object' &&
    Object.keys(event.mentions).length > 0;

  if (hasMentions) {
    return event;
  }

  if (!event.body || !event.body.includes('@')) return event;

  const info = await getThreadInfoCached(api, event.threadID);

  if (
    !info ||
    !Array.isArray(info.participantIDs) ||
    info.participantIDs.length === 0
  ) {
    return event;
  }

  const botID = String(api.getCurrentUserID());
  const allParticipants = {};

  for (const uid of info.participantIDs) {
    const suid = String(uid);
    if (suid === botID) continue;

    const userMeta = Array.isArray(info.userInfo)
      ? info.userInfo.find((u) => String(u.id) === suid)
      : null;

    allParticipants[suid] =
      userMeta && userMeta.name ? userMeta.name : '';
  }

  const matched = matchMentionsFromBody(event.body, allParticipants);

  if (matched && Object.keys(matched).length) {
    event.mentions = matched;
    event._mentionsFromProxy = true;
    event._proxyThreadInfo = info;

    try {
      rxLog.mentionsProxy(event.threadID, Object.keys(matched).length);
    } catch {}
  }

  return event;
}

async function warmCache(api, jid) {
  return getThreadInfoCached(api, jid);
}

function invalidateCache(jid) {
  _cache.delete(toNumericID(jid));
}

function getCachedInfo(jid) {
  const entry = _cache.get(toNumericID(jid));

  if (!entry || Date.now() - entry.ts >= CACHE_TTL) {
    return null;
  }

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
