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

        // 🟢 get thread info
        let threadInfo = {};
        try {
            threadInfo = await api.getThreadInfo(threadID);
        } catch (err) {
            console.error("getThreadInfo error:", err);
            return;
        }

        // 🔥 OVERRIDE event.mentions
        // id => name (from threadInfo.userInfo)
        event.mentions = {};

        if (Array.isArray(threadInfo.userInfo)) {
            for (const user of threadInfo.userInfo) {
                if (user.id && user.name) {
                    event.mentions[user.id] = user.name;
                }
            }
        }

        // 🧪 optional console log
        if (Object.keys(event.mentions).length > 0) {
            console.log("===== event.mentions (FROM THREADINFO) =====");
            console.log(event.mentions);
            console.log("===========================================");
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
