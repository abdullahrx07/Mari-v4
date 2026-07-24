'use strict';
/**
 * handleThreadSync — bot/includes/handle/handleThreadSync.js
 *
 * Bot চালু হওয়ার সাথে সাথে Facebook-এর সব thread (normal + E2EE)
 * MongoDB database-এ sync করে।
 *
 * Features:
 *  - api.getThreadList() দিয়ে সব thread আনে
 *  - Normal threads: getThreadInfo(threadID) 
 *  - E2EE threads (JID format): getThreadInfo(numericID) — @g.us ছাড়া
 *  - সব user info DB-তে save করে
 *  - [RX-FCA] prefix দিয়ে সুন্দর console log দেখায়
 */

const rxLog = require('../../utils/rxLog');

// ─── Helper: promisify api.getThreadInfo ─────────────────────────────────────
function fetchThreadInfo(api, id) {
  return new Promise((resolve) => {
    try {
      api.getThreadInfo(String(id), (err, result) => {
        resolve(err ? null : result);
      });
    } catch (_) {
      resolve(null);
    }
  });
}

// ─── Helper: promisify api.getThreadList ──────────────────────────────────────
function fetchThreadList(api, limit) {
  return new Promise((resolve) => {
    try {
      api.getThreadList(limit, null, [], (err, result) => {
        resolve(err ? [] : (result || []));
      });
    } catch (_) {
      resolve([]);
    }
  });
}

// ─── Main sync function ───────────────────────────────────────────────────────
module.exports = async function handleThreadSync({ api, Threads, Users }) {
  rxLog.divider('THREAD SYNC STARTING');
  rxLog.info('Fetching thread list from Facebook...', '〘 THREAD-SYNC 〙');

  const threadList = await fetchThreadList(api, 50);

  if (!threadList || threadList.length === 0) {
    rxLog.warn('No threads returned from API — skipping sync.', '〘 THREAD-SYNC 〙');
    return;
  }

  rxLog.info(`Found ${threadList.length} threads — syncing to database...`, '〘 THREAD-SYNC 〙');

  const stats = { synced: 0, e2ee: 0, skipped: 0, users: 0 };

  for (const thread of threadList) {
    const rawTID = String(thread.threadID || thread.id || '');
    if (!rawTID) { stats.skipped++; continue; }

    const isE2EE = rawTID.includes('@');
    // E2EE thread-এর জন্য @g.us ইত্যাদি ছাড়া numeric ID ব্যবহার করো
    const queryID = isE2EE ? rawTID.split('@')[0] : rawTID;

    let info = null;
    try {
      info = await fetchThreadInfo(api, queryID);
    } catch (_) { /* ignored */ }

    if (!info) {
      stats.skipped++;
      continue;
    }

    // ── Build threadInfo object to store ─────────────────────────────────────
    const threadInfoData = {
      threadName      : info.threadName || rawTID,
      adminIDs        : info.adminIDs || [],
      nicknames       : info.nicknames || {},
      participantIDs  : info.participantIDs || [],
      isE2EE          : isE2EE,
      e2eeJid         : isE2EE ? rawTID : null,
      syncedAt        : Date.now(),
    };

    // ── Save thread to MongoDB ────────────────────────────────────────────────
    try {
      await Threads.setData(rawTID, { threadInfo: threadInfoData, data: {} });

      // global memory update
      if (!global.data.allThreadID.includes(rawTID)) {
        global.data.allThreadID.push(rawTID);
      }
      global.data.threadInfo.set(rawTID, threadInfoData);
    } catch (e) {
      rxLog.warn(`DB write failed for ${rawTID}: ${e.message}`, '〘 THREAD-SYNC 〙');
      stats.skipped++;
      continue;
    }

    // ── Sync user info ────────────────────────────────────────────────────────
    const userList = Array.isArray(info.userInfo) ? info.userInfo : [];
    for (const u of userList) {
      const uid = String(u.id || '');
      if (!uid) continue;

      const name = u.name || uid;
      global.data.userName.set(uid, name);

      if (!global.data.allUserID.includes(uid)) {
        try {
          await Users.createData(uid, { name, data: {} });
          global.data.allUserID.push(uid);
          rxLog.user(uid, name);
          stats.users++;
        } catch (_) { /* user already exists — ignore */ }
      }
    }

    // ── Console log for this thread ───────────────────────────────────────────
    rxLog.thread(
      rawTID,
      threadInfoData.threadName,
      (info.participantIDs || []).length,
      isE2EE
    );

    stats.synced++;
    if (isE2EE) stats.e2ee++;
  }

  rxLog.divider('THREAD SYNC COMPLETE');
  rxLog.success(
    `Synced: ${stats.synced} threads (${stats.e2ee} E2EE) │ ` +
    `Users: ${stats.users} new │ Skipped: ${stats.skipped}`,
    '〘 THREAD-SYNC 〙'
  );
};
