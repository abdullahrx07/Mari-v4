'use strict';
/**
 * cookieFresh.js — bot/utils/cookieFresh.js
 *
 * FCA appstate.json / cookie.txt cookie freshness check করে।
 * মূল cookies: c_user, xs, datr — এগুলো expire হলে login ভাঙবে।
 *
 * Usage:
 *   const checkCookieFresh = require('./utils/cookieFresh');
 *   checkCookieFresh('appstate.json');
 */

const fs   = require('fs');
const path = require('path');
const rxLog = require('./rxLog');

// Key cookies যেগুলো fresh থাকা দরকার
const CRITICAL_COOKIES = ['c_user', 'xs', 'datr', 'fr', 'sb'];

// কতদিন আগে expire হলে "expiring soon" warning দেবো (7 দিন)
const WARN_BEFORE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * checkCookieFresh(appstatePath)
 *
 * @param {string} appstatePath  — path to appstate.json (relative to cwd)
 * @returns {{ fresh: boolean, expiredKeys: string[], soonKeys: string[], detail: string }}
 */
function checkCookieFresh(appstatePath) {
  const absPath = path.isAbsolute(appstatePath)
    ? appstatePath
    : path.join(process.cwd(), appstatePath);

  if (!fs.existsSync(absPath)) {
    rxLog.warn(`Appstate file not found: ${absPath}`, '〘 COOKIE 〙');
    return { fresh: false, expiredKeys: [], soonKeys: [], detail: 'file not found' };
  }

  let cookies = [];
  try {
    const raw = fs.readFileSync(absPath, 'utf8').trim();
    // Could be JSON array of cookie objects or a raw cookie string
    if (raw.startsWith('[') || raw.startsWith('{')) {
      const parsed = JSON.parse(raw);
      cookies = Array.isArray(parsed) ? parsed : [parsed];
    } else {
      // plain string — can't check expiry
      rxLog.cookie(true, '(raw cookie string — expiry not checkable)');
      return { fresh: true, expiredKeys: [], soonKeys: [], detail: 'raw string' };
    }
  } catch (e) {
    rxLog.warn(`Failed to parse appstate: ${e.message}`, '〘 COOKIE 〙');
    return { fresh: false, expiredKeys: [], soonKeys: [], detail: e.message };
  }

  const now     = Date.now();
  const expired = [];
  const soon    = [];
  const checked = [];

  for (const cookie of cookies) {
    // Support both FCA format (key/value) and browser format (name/value)
    const name = cookie.key || cookie.name || '';
    if (!CRITICAL_COOKIES.includes(name)) continue;

    const expiry = cookie.expirationDate || cookie.expires;
    if (!expiry) continue;

    // expirationDate can be in seconds (unix) or ms
    const expiryMs = expiry > 1e10 ? expiry : expiry * 1000;
    const msLeft   = expiryMs - now;

    checked.push(name);

    if (msLeft <= 0) {
      expired.push(name);
    } else if (msLeft < WARN_BEFORE_MS) {
      const daysLeft = Math.floor(msLeft / (24 * 60 * 60 * 1000));
      soon.push(`${name}(${daysLeft}d)`);
    }
  }

  const isFresh = expired.length === 0;
  const detail  = checked.length === 0
    ? 'no expiry data in cookies'
    : expired.length > 0
      ? `EXPIRED: ${expired.join(', ')}`
      : soon.length > 0
        ? `Expiring soon: ${soon.join(', ')}`
        : `All ${checked.length} key cookies valid`;

  // ── Log result ──────────────────────────────────────────────────────────────
  if (!isFresh) {
    rxLog.cookie(false, `❌ ${detail}`);
    rxLog.warn(
      'Cookie expired! Bot may fail to login. Update your appstate.json.',
      '〘 COOKIE 〙'
    );
  } else if (soon.length > 0) {
    rxLog.cookie(false, `⚠ ${detail}`);
  } else {
    rxLog.cookie(true, `✓ ${detail}`);
  }

  return { fresh: isFresh, expiredKeys: expired, soonKeys: soon, detail };
}

module.exports = checkCookieFresh;
