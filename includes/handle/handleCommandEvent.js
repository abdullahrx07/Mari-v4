module.exports = function ({ api, models, Users, Threads, Currencies }) {
    const logger = require("../../utils/log.js");
    const { buildCallArgs } = require("../../utils/goatCompat");
    return async function ({ event }) {
        const { allowInbox } = global.config;
        const { userBanned, threadBanned } = global.data;
        const { commands, eventRegistered } = global.client;
        var { senderID, threadID } = event;
        senderID = String(senderID);
        threadID = String(threadID);
        if (userBanned.has(senderID) || threadBanned.has(threadID) || (allowInbox == false && senderID == threadID)) return;

        // 🔒 GLOBAL ADMIN-ONLY MODE — when ON, silently block trigger commands
        // (e.g. baby.js/prefix.js handleEvent) for everyone except bot admins.
        const isAdminBot = (global.config.ADMINBOT || []).includes(senderID);
        const adminOnlyMode = await global.systemData.get("admin_only_mode", false);
        if (adminOnlyMode && !isAdminBot) return;

        // 🌟 VIP-ONLY MODE — when ON, silently block trigger commands for
        // everyone except bot admins and users in the VIP list.
        const vipMode = await global.systemData.get("vip_mode", false);
        if (vipMode) {
          const vipList = await global.systemData.get("vip_list", []);
          const isWhitelistedUser = vipList.includes(senderID) || isAdminBot;
          if (!isWhitelistedUser) return;
        }

        for (const eventReg of eventRegistered) {
            const cmd = commands.get(eventReg);
            var getText2;

            if (cmd.languages && typeof cmd.languages == 'object') {
                getText2 = (...values) => {
                    const commandModule = cmd.languages || {};
                    if (!commandModule.hasOwnProperty(global.config.language))
                        return api.sendMessage(global.getText('handleCommand','notFoundLanguage', cmd.config.name), threadID, threadID);
                    var lang = cmd.languages[global.config.language][values[0]] || '';
                    for (var i = values.length - 1; i >= 0; i--) {
                        const expReg = RegExp('%' + (i + 1), 'g');
                        lang = lang.replace(expReg, values[i]);
                    }
                    return lang;
                };
            } else {
                getText2 = () => {};
            }

            try {
                const nativeObj = {
                    event,
                    api,
                    models,
                    Users,
                    Threads,
                    Currencies,
                    getText: getText2,
                };
                const Obj = buildCallArgs(nativeObj, cmd.config.name);
                Obj.getText = getText2;
                if (cmd) cmd.handleEvent(Obj);
            } catch (error) {
                logger(global.getText('handleCommandEvent', 'moduleError', cmd.config.name), 'error');
            }
        }
    };
};
