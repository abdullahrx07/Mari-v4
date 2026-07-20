const logger = require("../../utils/log.js");
const moment = require("moment-timezone");

module.exports = function ({ api, models, Users, Threads, Currencies }) {
    return async function ({ event }) {
        const timeStart = Date.now();
        const time = moment.tz("Asia/Ho_Chi_Minh").format("HH:mm:ss L");

        const { userBanned, threadBanned } = global.data;
        const { events } = global.client;
        const { allowInbox, DeveloperMode } = global.config;

        let { senderID, threadID } = event;
        senderID = String(senderID);
        threadID = String(threadID);

        // ❌ skip banned
        if (
            userBanned.has(senderID) ||
            threadBanned.has(threadID) ||
            (allowInbox === false && senderID === threadID)
        ) {
            return;
        }

        // 🟢 get thread info — skip for E2EE JID threads (threadID contains "@")
        // api.getThreadInfo() only understands numeric Facebook thread IDs;
        // calling it with a JID throws, which previously caused an early return
        // that killed ALL events (including mention handling) for E2EE threads.
        const isE2EEThread = typeof threadID === "string" && threadID.includes("@");

        let threadInfo = {};
        if (!isE2EEThread) {
            try {
                threadInfo = await api.getThreadInfo(threadID);
            } catch (err) {
                // Log but don't return — events should still fire without threadInfo
                console.error("getThreadInfo error (non-E2EE):", err.message || err);
            }
        }

        // 🔥 OVERRIDE event.mentions for non-E2EE threads only.
        // For E2EE threads the FCA library already populates event.mentions
        // from the encrypted message payload — don't overwrite it with an
        // empty object or mention-based commands will break.
        if (!isE2EEThread) {
            event.mentions = {};
            if (Array.isArray(threadInfo && threadInfo.userInfo)) {
                for (const user of threadInfo.userInfo) {
                    if (user.id && user.name) {
                        event.mentions[user.id] = user.name;
                    }
                }
            }

            // 🧪 optional console log
            if (Object.keys(event.mentions).length > 0 && (global.config && global.config.DeveloperMode)) {
                console.log("===== event.mentions (FROM THREADINFO) =====");
                console.log(event.mentions);
                console.log("===========================================");
            }
        }

        // 🔹 run events
        for (const [key, value] of events.entries()) {
            if (value.config.eventType.includes(event.logMessageType)) {
                const eventRun = events.get(key);
                try {
                    eventRun.run({
                        api,
                        event,
                        models,
                        Users,
                        Threads,
                        Currencies
                    });

                    if (DeveloperMode === true) {
                        logger(
                            global.getText(
                                'handleEvent',
                                'executeEvent',
                                time,
                                eventRun.config.name,
                                threadID,
                                Date.now() - timeStart
                            ),
                            '[ Event ]'
                        );
                    }
                } catch (error) {
                    logger(
                        global.getText(
                            'handleEvent',
                            'eventError',
                            eventRun.config.name,
                            JSON.stringify(error)
                        ),
                        "error"
                    );
                }
            }
        }
    };
};
