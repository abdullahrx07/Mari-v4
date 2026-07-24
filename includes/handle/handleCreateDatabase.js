module.exports = function ({ Users, Threads, Currencies, api }) {
  const rxLog = require("../../utils/rxLog.js");
  const { getThreadInfoCached, toNumericID } = require("../Fca/e2eeMentionsProxy");

  return async function ({ event }) {
    const { allUserID, allCurrenciesID, allThreadID, userName } = global.data;
    const { autoCreateDB } = global.config;

    if (!autoCreateDB) return;

    const { senderID, threadID, isGroup } = event;
    const stringSenderID = String(senderID);
    const stringThreadID = String(threadID);

    // ── E2EE JID check ─────────────────────────────────────────────────────────
    // E2EE thread JID contains "@" (e.g. "12345@g.us").
    // api.getThreadInfo("jid@g.us") returns only sender — so we use numericID instead.
    const isE2EEJid = stringThreadID.includes('@') || stringSenderID.includes('@');

    try {
      // ── Thread DB sync ─────────────────────────────────────────────────────
      if (!allThreadID.includes(stringThreadID) && isGroup) {
        let threadInfo = null;

        if (isE2EEJid) {
          // E2EE proxy: use numeric ID to get full participant list
          threadInfo = await getThreadInfoCached(api, stringThreadID);

          if (!threadInfo) {
            // getThreadInfoCached failed — just record the thread ID minimally
            allThreadID.push(stringThreadID);
            global.data.threadInfo.set(stringThreadID, { isE2EE: true });
            const setting2 = { threadInfo: { isE2EE: true, participantIDs: [] }, data: {} };
            await Threads.setData(stringThreadID, setting2);
            rxLog.thread(stringThreadID, '[E2EE – info unavailable]', 0, true);
          } else {
            const setting = {
              threadName     : threadInfo.threadName || stringThreadID,
              adminIDs       : threadInfo.adminIDs || [],
              nicknames      : threadInfo.nicknames || {},
              participantIDs : threadInfo.participantIDs || [],
              isE2EE         : true,
              e2eeJid        : stringThreadID,
            };

            allThreadID.push(stringThreadID);
            global.data.threadInfo.set(stringThreadID, setting);

            const setting2 = { threadInfo: setting, data: {} };
            await Threads.setData(stringThreadID, setting2);

            // Sync E2EE users
            for (const singleData of (threadInfo.userInfo || [])) {
              const uid = String(singleData.id);
              userName.set(uid, singleData.name || uid);
              try {
                if (allUserID.includes(uid)) {
                  await Users.setData(uid, { name: singleData.name || uid });
                } else {
                  await Users.createData(uid, { name: singleData.name || uid, data: {} });
                  allUserID.push(uid);
                  rxLog.user(uid, singleData.name || uid);
                }
              } catch (_) {}
            }

            rxLog.thread(stringThreadID, setting.threadName, (threadInfo.participantIDs || []).length, true);
          }

        } else {
          // Normal (non-E2EE) thread
          try {
            threadInfo = await Threads.getInfo(stringThreadID);
          } catch (e) {
            rxLog.warn(`getThreadInfo failed for ${stringThreadID}: ${e.message}`, '〘 DATABASE 〙');
            return;
          }

          const setting = {
            threadName : threadInfo.threadName,
            adminIDs   : threadInfo.adminIDs,
            nicknames  : threadInfo.nicknames,
            isE2EE     : false,
          };

          allThreadID.push(stringThreadID);
          global.data.threadInfo.set(stringThreadID, setting);

          const setting2 = { threadInfo: setting, data: {} };
          await Threads.setData(stringThreadID, setting2);

          for (const singleData of (threadInfo.userInfo || [])) {
            const uid = String(singleData.id);
            userName.set(uid, singleData.name);

            try {
              if (allUserID.includes(uid)) {
                await Users.setData(uid, { name: singleData.name });
              } else {
                await Users.createData(uid, { name: singleData.name, data: {} });
                allUserID.push(uid);
                rxLog.user(uid, singleData.name);
              }
            } catch (_) {}
          }

          rxLog.thread(stringThreadID, setting.threadName, (threadInfo.userInfo || []).length, false);
        }
      }

      // ── User DB sync ──────────────────────────────────────────────────────
      // E2EE sender ID may also be a JID — skip raw API call in that case
      if (!allUserID.includes(stringSenderID) || !userName.has(stringSenderID)) {
        if (!stringSenderID.includes('@')) {
          let name = stringSenderID;
          try {
            const infoUser = await Users.getInfo(stringSenderID);
            name = (infoUser && infoUser.name) ? infoUser.name : stringSenderID;
          } catch (_) {}

          try {
            await Users.createData(stringSenderID, { name, data: {} });
          } catch (_) {}

          if (!allUserID.includes(stringSenderID)) allUserID.push(stringSenderID);
          userName.set(stringSenderID, name);
          rxLog.user(stringSenderID, name);
        }
      }

      // ── Currencies DB sync ────────────────────────────────────────────────
      if (!allCurrenciesID.includes(stringSenderID) && !stringSenderID.includes('@')) {
        try {
          await Currencies.createData(stringSenderID, { data: {} });
          allCurrenciesID.push(stringSenderID);
        } catch (_) {}
      }

    } catch (err) {
      rxLog.error('handleCreateDatabase error: ' + (err && err.message || err), '〘 DATABASE 〙');
    }
  };
};
/////////// FIX and MODE BY RXABDULLAH — E2EE proxy support added ///////////
