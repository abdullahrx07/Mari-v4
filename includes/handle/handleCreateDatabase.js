module.exports = function ({ Users, Threads, Currencies, api }) {
  const rxLog = require("../../utils/rxLog.js");
  const { getThreadInfoCached, toNumericID } = require("../Fca/e2eeMentionsProxy");

  return async function ({ event }) {
    if (!event) return;
    const { allUserID, allCurrenciesID, allThreadID, userName } = global.data;
    const { autoCreateDB } = global.config;

    if (!autoCreateDB) return;

    const senderID = event.senderID || event.author || event.userID;
    const threadID = event.threadID;

    if (!threadID) return;

    const stringSenderID = senderID ? String(senderID) : null;
    const stringThreadID = String(threadID);

    // ── E2EE JID check ─────────────────────────────────────────────────────────
    // E2EE thread JID contains "@" (e.g. "12345@g.us").
    const isE2EEJid = stringThreadID.includes('@') || (stringSenderID && stringSenderID.includes('@'));
    const isGroup = event.isGroup === true || event.isGroup === "true" || (stringThreadID && !stringThreadID.includes("@") && stringSenderID !== stringThreadID);

    try {
      // ── Thread DB sync / Dynamic load on demand ─────────────────────────────
      if (isGroup) {
        if (!allThreadID.includes(stringThreadID)) {
          // 1. Try to load from database first to avoid API spam
          let threadDoc = null;
          try {
            threadDoc = await Threads.getData(stringThreadID);
          } catch (e) {
            rxLog.error(`Error querying thread ${stringThreadID}: ${e.message}`, '〘 DATABASE 〙');
          }

          if (threadDoc) {
            // Found in DB! Load it into memory cache
            allThreadID.push(stringThreadID);
            global.data.threadData.set(stringThreadID, threadDoc.data || {});
            global.data.threadInfo.set(stringThreadID, threadDoc.threadInfo || {});

            if (threadDoc.data) {
              if (threadDoc.data.banned === true) {
                global.data.threadBanned.set(stringThreadID, {
                  reason: threadDoc.data.reason || '',
                  dateAdded: threadDoc.data.dateAdded || ''
                });
              }
              if (threadDoc.data.commandBanned && threadDoc.data.commandBanned.length !== 0) {
                global.data.commandBanned.set(stringThreadID, threadDoc.data.commandBanned);
              }
              if (threadDoc.data.NSFW) {
                if (!global.data.threadAllowNSFW.includes(stringThreadID)) {
                  global.data.threadAllowNSFW.push(stringThreadID);
                }
              }
            }
          } else {
            // Not in DB! Create dynamically using Facebook API / E2EE Mentions Proxy
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
        }
      }

      // ── User DB sync / Dynamic load on demand ──────────────────────────────
      if (stringSenderID && !stringSenderID.includes('@')) {
        if (!allUserID.includes(stringSenderID) || !userName.has(stringSenderID)) {
          // 1. Try to load from database first to avoid API spam
          let userDoc = null;
          try {
            userDoc = await Users.getData(stringSenderID);
          } catch (e) {
            rxLog.error(`Error querying user ${stringSenderID}: ${e.message}`, '〘 DATABASE 〙');
          }

          if (userDoc) {
            // Found in DB! Load it into memory cache
            if (!allUserID.includes(stringSenderID)) allUserID.push(stringSenderID);
            if (userDoc.name) {
              userName.set(stringSenderID, userDoc.name);
            }
            if (userDoc.data && userDoc.data.banned == 1) {
              global.data.userBanned.set(stringSenderID, {
                reason: userDoc.data.reason || '',
                dateAdded: userDoc.data.dateAdded || ''
              });
            }
            if (userDoc.data && userDoc.data.commandBanned && userDoc.data.commandBanned.length !== 0) {
              global.data.commandBanned.set(stringSenderID, userDoc.data.commandBanned);
            }
          } else {
            // Not in DB! Fetch and create dynamically
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
      }

      // ── Currencies DB sync / Dynamic load on demand ───────────────────────────
      if (stringSenderID && !stringSenderID.includes('@')) {
        if (!allCurrenciesID.includes(stringSenderID)) {
          // Try to load from database first to verify it exists
          let currencyDoc = null;
          try {
            currencyDoc = await Currencies.getData(stringSenderID);
          } catch (e) {
            rxLog.error(`Error querying currency for ${stringSenderID}: ${e.message}`, '〘 DATABASE 〙');
          }

          if (currencyDoc) {
            allCurrenciesID.push(stringSenderID);
          } else {
            try {
              await Currencies.createData(stringSenderID, { data: {} });
              allCurrenciesID.push(stringSenderID);
            } catch (_) {}
          }
        }
      }

    } catch (err) {
      rxLog.error('handleCreateDatabase error: ' + (err && err.message || err), '〘 DATABASE 〙');
    }
  };
};
/////////// FIX and MODE BY RXABDULLAH — E2EE proxy support & Dynamic Load on demand added ///////////
