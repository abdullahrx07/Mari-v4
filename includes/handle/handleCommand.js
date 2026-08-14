const fs = require("fs");
const path = require("path");
const stringSimilarity = require("string-similarity");
const moment = require("moment-timezone");
const logger = require("../../utils/log.js");
const axios = require("axios");


module.exports = function ({ api, models, Users, Threads, Currencies }) {

  // ===== PREMIUM SYSTEM =====
  const premiumPath = path.join(__dirname, "../../modules/commands/rx/premium.json");

  const loadpremium = () => {
    if (!fs.existsSync(premiumPath)) {
      const parentDir = path.dirname(premiumPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      fs.writeFileSync(premiumPath, JSON.stringify({ users: {} }, null, 2));
    }
    return JSON.parse(fs.readFileSync(premiumPath));
  };

  const savepremium = (data) => {
    fs.writeFileSync(premiumPath, JSON.stringify(data, null, 2));
  };

  return async function ({ event }) {
    const dateNow = Date.now();
    const time = moment.tz("Asia/Dhaka").format("HH:mm:ss DD/MM/YYYY");
    const { allowInbox, PREFIX, ADMINBOT, NDH, DeveloperMode } = global.config;
    const { userBanned, threadBanned, threadInfo, threadData, commandBanned } = global.data;
    const { commands, cooldowns } = global.client;

    let { body, senderID, threadID, messageID, mentions, type, messageReply } = event;
    senderID = String(senderID);
    threadID = String(threadID);
    body = body || "x";

    // 🚫 SILENT IGNORE FOR BANNED USER / THREAD
    if (
      (userBanned.has(senderID) || threadBanned.has(threadID)) &&
      !ADMINBOT.includes(senderID)
    ) {
      return;
    }

    const isAdminBot  = ADMINBOT.includes(senderID);

    // 🔒 GLOBAL ADMIN-ONLY MODE — when ON, silently block everyone except bot admins
    const adminOnlyMode = await global.systemData.get("admin_only_mode", false);
    if (adminOnlyMode && !isAdminBot) {
      return; // SILENT
    }

    const vipList = await global.systemData.get("vip_list", []);
    const vipMode = await global.systemData.get("vip_mode", false);

    if (vipMode) {
      const approvedThreads = await global.systemData.get("approved_threads", []);
      const isApprovedThread = approvedThreads.some($ => String($.t_id) === String(threadID));
      const isWhitelistedUser = vipList.includes(senderID) || isAdminBot;
      if (!isApprovedThread || !isWhitelistedUser) {
        return; // SILENT
      }
    }

    const threadSetting = threadData.get(threadID) || {};
    const threadPrefix  = threadSetting.PREFIX || PREFIX;
    const escapeRegex   = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // ===== OWN PREFIX CHECK =====
    const userPrefixData = await global.systemData.get("user_prefixes", {});
    const userOwnPrefix  = userPrefixData[senderID] || null;

    // ─── Personal Prefix Fix ───
    const effectivePrefix = userOwnPrefix || threadPrefix;

    const prefixAlternatives = [escapeRegex(effectivePrefix)];

    const prefixRegex = new RegExp(
      `^(<@!?${senderID}>|${prefixAlternatives.join("|")})\\s*`
    );

    let args = [];
    let commandName = "";

    const prefixUsed = body.startsWith(effectivePrefix);

    const isVIP   = vipList.includes(senderID);

    // ===== LOAD PREMIUM USER =====
    const premiumData = loadpremium();
    const premiumUser = premiumData.users[senderID];

    // 🔥 AUTO EXPIRE CHECK
    if (premiumUser && premiumUser.expire <= Date.now()) {
      delete premiumData.users[senderID];
      savepremium(premiumData);
    }

    const ispremium = premiumUser && premiumUser.expire > Date.now();

    if ((isAdminBot || isVIP) && !prefixUsed) {
      const temp = body.trim().split(/ +/);
      commandName = temp.shift()?.toLowerCase();
      args = temp;
    } else {
      const _isJarvisTrigger = /^jarvis\b/i.test(body.trim()) || /\bjarvis\b/i.test(body.trim());
      if (_isJarvisTrigger && !prefixRegex.test(body)) return;
      if (!prefixRegex.test(body)) return;
      const [matchedPrefix] = body.match(prefixRegex);
      const argsTemp = body.slice(matchedPrefix.length).trim().split(/ +/);
      commandName = argsTemp.shift()?.toLowerCase();
      args = argsTemp;
    }

    if (!commandName) {
      if (!prefixUsed) return;

      const isE2EEThreadA = typeof threadID === "string" && threadID.includes("@");
      let threadInfoo = {};
      if (!isE2EEThreadA) {
        try {
          threadInfoo = threadInfo.get(threadID) || (await Threads.getInfo(threadID)) || {};
        } catch (_e) {
          threadInfoo = {};
        }
      }
      const _adminIDsA = (threadInfoo && Array.isArray(threadInfoo.adminIDs)) ? threadInfoo.adminIDs : [];
      const isThreadAdmin = _adminIDsA.some((el) => el.id == senderID);
      const isAdmin = isAdminBot || NDH.includes(senderID) || isThreadAdmin;

      if (isAdmin) {
        return api.sendMessage(
          global.getText("handleCommand", "adminPrefix"),
          threadID,
          messageID
        );
      }

      return api.sendMessage(
        global.getText("handleCommand", "onlyprefix"),
        threadID,
        messageID
      );
    }

    for (const [cmdName, cmdObj] of commands) {
      if (cmdObj.config.aliases && cmdObj.config.aliases.includes(commandName)) {
        commandName = cmdName;
        break;
      }
    }

    let command = commands.get(commandName);
    if (!command && prefixUsed) {
      const allCommandName = Array.from(commands.keys());
      const checker = stringSimilarity.findBestMatch(commandName, allCommandName);
      if (checker.bestMatch.rating >= 0.5) {
        command = commands.get(checker.bestMatch.target);
      } else {
        return api.sendMessage(
          global.getText("handleCommand", "commandNotExist", checker.bestMatch.target),
          threadID,
          messageID
        );
      }
    }

    // ===== PREMIUM CHECK =====
    if (command && command.config && command.config.premium === true) {
      if (!isAdminBot && !ispremium) {
        return api.sendMessage(
          global.getText("handleCommand", "premiumOnly"),
          threadID,
          messageID
        );
      }
    }

    if (!command && !prefixUsed) return;
    if (!command) {
      const allCommandName = Array.from(commands.keys());
      const checker = stringSimilarity.findBestMatch(commandName, allCommandName);
      if (checker.bestMatch.rating >= 0.5) {
        command = commands.get(checker.bestMatch.target);
      } else {
        return api.sendMessage(
          global.getText("handleCommand", "commandNotExist", checker.bestMatch.target),
          threadID,
          messageID
        );
      }
    }

    // ===== PERMISSION SYSTEM =====
    // permssion levels:
    //   3 = Bot Admin   (ADMINBOT)
    //   2 = NDH
    //   1 = Group Admin
    //   0 = Regular user

    let permssion = 0;
    // E2EE threadIDs are JIDs (contain "@") — api.getThreadInfo() only understands
    // real Facebook thread IDs, so calling it with a JID throws. That throw was
    // unhandled here (no try/catch around this block), which silently killed
    // the whole command — including things like !inbox — before it ever ran.
    const isE2EEThread = typeof threadID === "string" && threadID.includes("@");
    // isInboxDM: true only for regular 1-to-1 DMs (senderID === threadID).
    // E2EE DMs: threadID is a JID but isGroup is false — treat the same as inbox DMs.
    // E2EE GROUP chats must NOT be blocked even when allowInbox === false, since
    // they are not direct-message threads.
    const isE2EEDM = isE2EEThread && !event.isGroup;
    const isInboxDM = senderID === threadID || isE2EEDM;
    if (isInboxDM && allowInbox === false) return; // respect config: allowInbox=false blocks DM commands

    let threadInfoo = {};
    if (!isE2EEThread) {
      try {
        threadInfoo = threadInfo.get(threadID) || (await Threads.getInfo(threadID)) || {};
      } catch (_e) {
        threadInfoo = {};
      }
    }
    const _adminIDs   = (threadInfoo && Array.isArray(threadInfoo.adminIDs)) ? threadInfoo.adminIDs : [];
    const find = _adminIDs.find((el) => el.id == senderID);

    if (isAdminBot)                  permssion = 3; // highest
    else if (NDH.includes(senderID)) permssion = 2;
    else if (find)                   permssion = 1; // group admin

    // ===== hasPermssion CHECK =====
    // hasPermssion: 1 → Bot Admin only
    // hasPermssion: 2 → Bot Admin + Group Admin
    // hasPermssion: 3 → Bot Admin + Group Admin + NDH  (all elevated)
    // hasPermssion: 0 → Everyone (default)

    const reqPerm = command.config.hasPermssion || 0;
    let hasAccess = false;

    if (reqPerm === 0) {
      hasAccess = true;                                                        // everyone
    } else if (reqPerm === 1) {
      hasAccess = permssion === 3;                                             // bot admin only
    } else if (reqPerm === 2) {
      hasAccess = permssion === 3 || permssion === 1;                         // bot admin + group admin
    } else if (reqPerm === 3) {
      hasAccess = permssion === 3 || permssion === 1 || permssion === 2;      // all elevated
    }

    if (!hasAccess) {
      return api.sendMessage(
        global.getText("handleCommand", "permissionNotEnough", command.config.name),
        threadID,
        messageID
      );
    }

    // ===== Cooldown Check =====
    if (!cooldowns.has(command.config.name)) {
      cooldowns.set(command.config.name, new Map());
    }

    const timestamps     = cooldowns.get(command.config.name);
    const expirationTime = (command.config.cooldowns || 1) * 1000;

    if (
      timestamps.has(senderID) &&
      dateNow < timestamps.get(senderID) + expirationTime
    ) {
      return api.sendMessage(
        `⏱ Please wait ${Math.ceil(
          (timestamps.get(senderID) + expirationTime - dateNow) / 1000
        )} seconds before using ${command.config.name}`,
        threadID,
        messageID
      );
    }

    // ===== Run Command =====
    let getText2;
    if (
      command.languages &&
      typeof command.languages == "object" &&
      command.languages.hasOwnProperty(global.config.language)
    ) {
      getText2 = (...values) => {
        let lang = command.languages[global.config.language][values[0]] || "";
        for (let i = values.length; i > 0; i--) {
          lang = lang.replace(new RegExp(`%${i}`, "g"), values[i]);
        }
        return lang;
      };
    } else getText2 = () => {};

    try {
      const Obj = {
        api,
        event,
        args,
        models,
        Users,
        Threads,
        Currencies,
        permssion,
        role: permssion,
        getText: getText2,
      };

      await Promise.resolve(command.run(Obj));
      timestamps.set(senderID, dateNow);

      if (DeveloperMode === true)
        logger(
          global.getText(
            "handleCommand",
            "executeCommand",
            time,
            commandName,
            senderID,
            threadID,
            args.join(" "),
            Date.now() - dateNow
          ),
          "[ DEV MODE ]"
        );

      return;
    } catch (e) {
      return api.sendMessage(
        global.getText("handleCommand", "commandError", commandName, e),
        threadID,
        messageID
      );
    }
  };
};
