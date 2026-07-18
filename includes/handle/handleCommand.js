const fs = require("fs");
const path = require("path");
const stringSimilarity = require("string-similarity");
const moment = require("moment-timezone");
const logger = require("../../utils/log.js");
const axios = require("axios");


module.exports = function ({ api, models, Users, Threads, Currencies }) {

  const vipFilePath     = path.join(__dirname, "../../modules/commands/rx/vip.json");
  const vipModePath     = path.join(__dirname, "../../modules/commands/rx/vipMode.json");
  const userPrefixPath  = path.join(__dirname, "../../modules/commands/rx/userPrefix.json");

  // ===== WHITELIST PATHS =====
  const wltUserPath   = path.join(__dirname, "../../modules/commands/rx/wlt_users.json");
  const wltGroupPath  = path.join(__dirname, "../../modules/commands/rx/wlt_groups.json");
  const wltModePath   = path.join(__dirname, "../../modules/commands/rx/wlt_mode.json");

  // ===== LOADERS =====
  const loadVIP = () => {
    if (!fs.existsSync(vipFilePath)) return [];
    return JSON.parse(fs.readFileSync(vipFilePath, "utf-8"));
  };

  const loadVIPMode = () => {
    if (!fs.existsSync(vipModePath)) return false;
    const parsed = JSON.parse(fs.readFileSync(vipModePath, "utf-8"));
    return parsed.vipMode || false;
  };

  const loadUserPrefix = () => {
    if (!fs.existsSync(userPrefixPath)) {
      fs.writeFileSync(userPrefixPath, JSON.stringify({}, null, 2));
    }
    return JSON.parse(fs.readFileSync(userPrefixPath, "utf-8"));
  };

  // ===== WHITELIST LOADERS =====
  const loadWltUsers = () => {
    if (!fs.existsSync(wltUserPath)) {
      fs.writeFileSync(wltUserPath, JSON.stringify([], null, 2));
    }
    return JSON.parse(fs.readFileSync(wltUserPath, "utf-8"));
  };

  const loadWltGroups = () => {
    if (!fs.existsSync(wltGroupPath)) {
      fs.writeFileSync(wltGroupPath, JSON.stringify({}, null, 2));
    }
    return JSON.parse(fs.readFileSync(wltGroupPath, "utf-8"));
  };

  const loadWltMode = () => {
    if (!fs.existsSync(wltModePath)) return false;
    return JSON.parse(fs.readFileSync(wltModePath, "utf-8")).enabled || false;
  };

  // ===== PREMIUM SYSTEM =====
  const premiumPath = path.join(__dirname, "../../modules/commands/rx/premium.json");

  const loadpremium = () => {
    if (!fs.existsSync(premiumPath)) {
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

    // ===== WHITELIST CHECK =====
    const wltUsers    = loadWltUsers();   // array of userIDs
    const wltGroups   = loadWltGroups();  // { threadID: [uid1, uid2, ...] }
    const wltModeOn   = loadWltMode();    // global on/off switch

    const isAdminBot  = ADMINBOT.includes(senderID);
    const isWltUser   = wltUsers.includes(senderID);
    const groupWlt    = wltGroups[threadID];
    const groupHasWlt = groupWlt !== undefined;

    if (!isAdminBot) {
      if (wltModeOn) {
        // ── Global ON ──────────────────────────────────────────────
        const isGlobalWlt = wltUsers.includes(senderID);
        const isInGroupWlt = groupHasWlt && groupWlt.includes(senderID);
        if (!isGlobalWlt && !isInGroupWlt) return;
      } else {
        // ── Global OFF — group-level whitelist still enforced ──────
        if (groupHasWlt) {
          const allowedInGroup = wltUsers.includes(senderID) || groupWlt.includes(senderID);
          if (!allowedInGroup) return;
        }
      }
    }

    const threadSetting = threadData.get(threadID) || {};
    const threadPrefix  = threadSetting.PREFIX || PREFIX;
    const escapeRegex   = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // ===== OWN PREFIX CHECK =====
    const userPrefixData = loadUserPrefix();
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

    const vipList = loadVIP();
    const vipMode = loadVIPMode();
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

      const threadInfoo =
        threadInfo.get(threadID) || (await Threads.getInfo(threadID)) || {};
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

    if (!isAdminBot) {
      if (vipMode && !vipList.includes(senderID)) {
        return api.sendMessage(
          "> ❌\nOnly VIP users can use this command",
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
    // For inbox DMs (senderID === threadID), adminIDs doesn't exist — guard against crash.
    const isInboxDM = senderID === threadID;
    if (isInboxDM && allowInbox === false) return; // respect config: allowInbox=false blocks DM commands
    const threadInfoo = threadInfo.get(threadID) || (await Threads.getInfo(threadID)) || {};
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
