const { readdirSync, readFileSync, writeFileSync, existsSync, unlinkSync, rm } = require("fs-extra");
var log = require("./utils/log");
const { join, resolve } = require("path");
const chalkAnimation = require('chalkercli');
const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const gradient = require('gradient-string');
const { execSync } = require('child_process');
const logger = require("./utils/log.js");
const con = require('./config.json');
// fca-priyansh was flagged by Replit's package security scanner as
// credential/session-harvesting malware and was removed from package.json —
// do NOT reinstall it.
//
// Facebook login now uses the vendored ./includes/Fca library instead. That
// copy was audited before being wired in here: a file (src/Dev_Horizon_Data.js)
// that uploaded scraped user/thread data to a hardcoded third-party server
// was deleted, and a dead code path that could auto-download and run
// unsigned installers with sudo was removed from includes/Fca/index.js. The
// library's own loader also already excludes every "Dev_*" file in
// includes/Fca/src from the live API surface. See replit.md for details.
let login = null;
try {
	login = require('./includes/Fca');
} catch (e) {
	logger('Failed to load ./includes/Fca — Facebook login is disabled: ' + e.message, '[ LOGIN-DISABLED ]');
}
const moment = require("moment-timezone");
const timeStart = Date.now();
const axios = require("axios");
const os = require('os');
const theme = con.DESIGN.Theme;
let co;
let error;
if (theme.toLowerCase() === 'blue') {
  co = gradient([{color: "#1affa3", pos: 0.2},{color:"cyan",pos:0.4},{color:"pink",pos:0.6},{color:"cyan",pos:0.8},{color:'#1affa3',pos:1}]);
  error = chalk.red.bold;}

else if (theme=="dream2") 
{
  cra = gradient("blue","pink") 
  co = gradient("#a200ff","#21b5ff","#a200ff")
}
  else if (theme.toLowerCase() === 'dream') {
  co = gradient([{color: "blue", pos: 0.2},{color:"pink",pos:0.3},{color:"gold",pos:0.6},{color:"pink",pos:0.8},{color: "blue", pos:1}]);
  error = chalk.red.bold;
}
    else if (theme.toLowerCase() === 'test') {
  co = gradient("#243aff", "#4687f0", "#5800d4","#243aff", "#4687f0", "#5800d4","#243aff", "#4687f0", "#5800d4","#243aff", "#4687f0", "#5800d4");
  error = chalk.red.bold;
}

else if (theme.toLowerCase() === 'fiery') {
  co = gradient("#fc2803", "#fc6f03", "#fcba03");
  error = chalk.red.bold;
}
else if (theme.toLowerCase() === 'rainbow') {
  co = gradient.rainbow
  error = chalk.red.bold;}
  else if (theme.toLowerCase() === 'pastel') {
  co = gradient.pastel
  error = chalk.red.bold;}
  else if (theme.toLowerCase() === 'cristal') {
  co = gradient.cristal
  error = chalk.red.bold;
}else if (theme.toLowerCase() === 'red') {
  co = gradient("red", "orange");
  error = chalk.red.bold;
} else if (theme.toLowerCase() === 'aqua') {
  co = gradient("#0030ff", "#4e6cf2");
  error = chalk.blueBright;
} else if (theme.toLowerCase() === 'pink') {
  cra = gradient('purple', 'pink');
  co = gradient("#d94fff", "purple");
} else if (theme.toLowerCase() === 'retro') {
  cra = gradient("#d94fff", "purple");
  co = gradient.retro;
} else if (theme.toLowerCase() === 'sunlight') {
  cra = gradient("#f5bd31", "#f5e131");
  co = gradient("orange", "#ffff00", "#ffe600");
} else if (theme.toLowerCase() === 'teen') {
  cra = gradient("#00a9c7", "#853858","#853858","#00a9c7");
  co = gradient.teen;
} else if (theme.toLowerCase() === 'summer') {
  cra = gradient("#fcff4d", "#4de1ff");
  co = gradient.summer;
} else if (theme.toLowerCase() === 'flower') {
  cra = gradient("blue", "purple", "yellow", "#81ff6e");
  co = gradient.pastel;
} else if (theme.toLowerCase() === 'ghost') {
  cra = gradient("#0a658a", "#0a7f8a", "#0db5aa");
  co = gradient.mind;
} else if (theme === 'hacker') {
  cra = chalk.hex('#4be813');
  co = gradient('#47a127', '#0eed19', '#27f231');
}
else {
  co = gradient("#243aff", "#4687f0", "#5800d4");
  error = chalk.red.bold;
}
//////////////////////////////////////////////////////////////////////////////
const listPackage = JSON.parse(readFileSync('./package.json')).dependencies;
const listbuiltinModules = require("module").builtinModules;

global.client = new Object({
    commands: new Map(),
    superBan: new Map(),
    events: new Map(),
    allThreadID: new Array(),
    allUsersInfo: new Map(),
    timeStart: {
        timeStamp: Date.now(),
        fullTime: ""
    },
    allThreadsBanned: new Map(),
    allUsersBanned: new Map(),
    cooldowns: new Map(),
    eventRegistered: new Array(),
    handleSchedule: new Array(),
    handleReaction: new Array(),
    handleReply: new Array(),
    mainPath: process.cwd(),
    configPath: new String(),
    getTime: function (option) {
        switch (option) {
            case "seconds":
                return `${moment.tz("Asia/Dhaka").format("ss")}`;
            case "minutes":
                return `${moment.tz("Asia/Dhaka").format("mm")}`;
            case "hours":
                return `${moment.tz("Asia/Dhaka").format("HH")}`;
            case "date": 
                return `${moment.tz("Asia/Dhaka").format("DD")}`;
            case "month":
                return `${moment.tz("Asia/Dhaka").format("MM")}`;
            case "year":
                return `${moment.tz("Asia/Dhaka").format("YYYY")}`;
            case "fullHour":
                return `${moment.tz("Asia/Dhaka").format("HH:mm:ss")}`;
            case "fullYear":
                return `${moment.tz("Asia/Dhaka").format("DD/MM/YYYY")}`;
            case "fullTime":
                return `${moment.tz("Asia/Dhaka").format("HH:mm:ss DD/MM/YYYY")}`;
        }
    }
});

global.data = new Object({
    threadInfo: new Map(),
    threadData: new Map(),
    userName: new Map(),
    userBanned: new Map(),
    threadBanned: new Map(),
    commandBanned: new Map(),
    threadAllowNSFW: new Array(),
    allUserID: new Array(),
    allCurrenciesID: new Array(),
    allThreadID: new Array()
});

global.utils = require("./utils");
const goatCompat = require("./utils/goatCompat");

global.nodemodule = new Object();

global.config = new Object();

global.configModule = new Object();

global.moduleData = new Array();

global.language = new Object();

global.account = new Object();

global.anti = resolve(process.cwd(),'anti.json');
global.api = (api) => {
    try {

    var data = readFileSync(process.cwd() + "/includes/datajson/" + api, "utf-8")

    let d = JSON.parse(data)

    return d[Math.floor(Math.random() * d.length)]

    } catch (e) {

    const data = readFileSync(process.cwd() + "/includes/datajson/" + api, "utf-8").split("\n")

    const t = JSON.stringify(data)

    const d = JSON.parse(t)

    return d[Math.floor(Math.random() * d.length)]

    }

    }
///////////////////////////////////////
//== Find and get variable from Config =//
/////////////////////////////////////////
var configValue;
try {
    global.client.configPath = join(global.client.mainPath, "config.json");
    configValue = require(global.client.configPath);
}
catch {
    if (existsSync(global.client.configPath.replace(/\.json/g,"") + ".temp")) {
        configValue = readFileSync(global.client.configPath.replace(/\.json/g,"") + ".temp");
        configValue = JSON.parse(configValue);
        logger.loader(`Found: ${global.client.configPath.replace(/\.json/g,"") + ".temp"}`);
    }

}

try {
    for (const key in configValue) global.config[key] = configValue[key];
}
catch { return logger.loader("Lỗi tải tệp config!", "error") }

const { mongoose, connect: connectDatabase } = require("./includes/database");

writeFileSync(global.client.configPath + ".temp", JSON.stringify(global.config, null, 4), 'utf8');
///////////////////////////////////////
//======== Load language use =====/////
///////////////////////////////////////

const langFile = (readFileSync(`${__dirname}/languages/${global.config.language || "en"}.lang`, { encoding: 'utf-8' })).split(/\r?\n|\r/);
const langData = langFile.filter(item => item.indexOf('#') != 0 && item != '');
for (const item of langData) {
    const getSeparator = item.indexOf('=');
    const itemKey = item.slice(0, getSeparator);
    const itemValue = item.slice(getSeparator + 1, item.length);
    const head = itemKey.slice(0, itemKey.indexOf('.'));
    const key = itemKey.replace(head + '.', '');
    const value = itemValue.replace(/\\n/gi, '\n');
    if (typeof global.language[head] == "undefined") global.language[head] = new Object();
    global.language[head][key] = value;
}

global.getText = function (...args) {
    const langText = global.language;    
    if (!langText.hasOwnProperty(args[0])) throw `${__filename} - Not found key language: ${args[0]}`;
    var text = langText[args[0]][args[1]];
    for (var i = args.length - 1; i > 0; i--) {
        const regEx = RegExp(`%${i}`, 'g');
        text = text.replace(regEx, args[i + 1]);
    }
    return text;
}

try {
    var appStateFile = resolve(join(global.client.mainPath,global.config.APPSTATEPATH || 'appstate.json')),
      appState = process.env.KEY && fs.readFileSync(appStateFile, 'utf8')[0] != '[' && global.config.encryptSt ? JSON.parse(decryptState(fs.readFileSync(appStateFile, 'utf8'), process.env.KEY)) : require(appStateFile)
    logger.loader(global.getText('mirai', 'foundPathAppstate'))
  } catch {
    logger.loader(global.getText('mirai', 'notFoundPathAppstate'), 'error')
  }
/////////////////////////////////////
// AUTO CLEAN CACHE CODE BY rX//
/////////////////////////////////////
if (global.config.autoCleanCache.Enable) {
  const folderPath = global.config.autoCleanCache.CachePath;
  const fileExtensions = global.config.autoCleanCache.AllowFileExtension;

  fs.readdir(folderPath, (err, files) => {
    if (err) {
      console.error('Error while reading the directory:', err);
      return;
    }
    files.forEach((file) => {
      const filePath = path.join(folderPath, file);
      if (fileExtensions.includes(path.extname(file).toLowerCase())) {

  fs.unlink(filePath, (err) => {
          if (err) {
logger(`Deleted the file jpg, mp4, gif, ttf, mp3`, "[ AUTO - CLEAN ]", err);
           } else {
         }
      });
    }
});
logger(`Deleted the file jpg, mp4, gif, ttf, mp3`, "[ AUTO - CLEAN ]");
  });
} else {
logger(`Auto Clean Cache Has been disabled`, "[ AUTO - CLEAN ]");
}
////////////////////////////////////////////////
//========= Đăng nhập tài khoản, bắt đầu Nghe Sự kiện && Nhận tự động Appstate từ cấu hình =========//
////////////////////////////////////////////////
async function uptime() {
  const datauptime = require('./config.json');
  datauptime.UPTIME = process.uptime() + datauptime.UPTIME
  writeFileSync(global.client.configPath, JSON.stringify(datauptime, null, 4), 'utf-8')
  return logger('Uptime from the recent restart has been saved!', '[ UPTIME ]')
}
function onBot({ models }) {
  if (!login) {
    logger('Facebook login is paused (no safe FCA library configured — see replit.md). Bot core services (database, self-update, command loading) are up; login/messaging will not start.', '[ LOGIN-DISABLED ]')
    return
  }

  const loginData = {}

  // FIX: if appstate.json is missing/empty/invalid, `appState` ends up
  // `undefined`. The original code still called login() with
  // loginData.appState = undefined, and inside includes/Fca's login()
  // neither the "email+password" branch nor the "appState" branch
  // matches (both checks are falsy) -> the callback below was NEVER
  // invoked -> the bot just hung silently, no email/password login was
  // ever attempted.
  //
  // includes/Fca (the local `login` required at the top of this file)
  // already supports logging in directly with email+password
  // (loginData.email / loginData.password -> loginHelper), and on
  // success it calls the SAME callback below with a working api, so
  // commands/events load and MQTT listening starts immediately -
  // no restart needed for this case.
  if (appState) {
    loginData.appState = appState
  } else {
    // Credentials come from environment secrets (FB_EMAIL / FB_PASSWORD)
    // first. acc.json is only a legacy fallback and should never hold a
    // real plaintext password committed to the project.
    const logacc = require('./acc.json')
    const email = process.env.FB_EMAIL || logacc.EMAIL
    const password = process.env.FB_PASSWORD || logacc.PASSWORD
    if (!email || !password) {
      logger('No appstate found and FB_EMAIL/FB_PASSWORD are not set, cannot log in!', '[ LOGIN-ERROR ]')
      return process.exit(0)
    }
    logger('No valid appstate found, logging in with EMAIL & PASSWORD!', '[ LOGIN-ERROR ]')
    loginData.email = email
    loginData.password = password
  }

  login(loginData, async (loginError, loginApiData) => {    
    if (loginError) {
      // FIX: includes/Fca sets npmlog's logLevel to "silent" for
      // email+password logins, so its internal log.error(...) calls
      // produce ZERO output - the real failure reason was completely
      // hidden. Dump the actual error object here (bypasses npmlog)
      // so we can see WHY the login failed (wrong password, checkpoint,
      // 2FA, region block, etc.)
      console.log('========== includes/Fca LOGIN ERROR (full detail) ==========')
      console.log(require('util').inspect(loginError, { depth: null, colors: false }))
      if (loginError && loginError.stack) console.log(loginError.stack)
      console.log('==============================================================')

      // Login (appstate OR email/password, both via includes/Fca) failed.
      // Restart so includes/Fca retries with EMAIL/PASSWORD from acc.json
      // on the next run (no fca-priyansh fallback anymore).
      logger('Login failed via includes/Fca. Restarting to retry...','[ LOGIN-ERROR ]')
      await new Promise((reset) => setTimeout(reset, 7000))
      logger('Starting to restart!', '[ RESTART ]')
      process.exit(1)
    }

loginApiData.setOptions(global.config.FCAOption)
    let loginState = loginApiData.getAppState()
    loginState = JSON.stringify(loginState, null, '\t')
    if (process.env.KEY && global.config.encryptSt) {
      loginState = await encryptState(loginState, process.env.KEY)
      writeFileSync(appStateFile, loginState)
    } else {
      writeFileSync(appStateFile, loginState)
    }
////////////////////////////////////////////
////////////////////////////////////////////
    global.client.api = loginApiData;
      async function streamURL(url, type) {
          return axios.get(url, {
              responseType: 'arraybuffer'
          }).then(res => {
              const path = __dirname + `/modules/commands/cache/lolx/${Date.now()}.${type}`;
              writeFileSync(path, res.data);
              setTimeout(p => unlinkSync(p), 1000 * 60, path);
              return createReadStream(path);
          });
      }
      async function upload(url) {
          return loginApiData.httpPostFormData('https://upload.facebook.com/ajax/mercury/upload.php', {
              upload_1024: await streamURL(url, 'mp4')
          }).then(res => Object.entries(JSON.parse(res.body.replace('for (;;);', '')).payload?.metadata?.[0] || {})[0]);
      };
      let status = false;
      var a = [];
      setInterval(async() => {
      if (status == true || a.length > 5) return;
      status = true;
      Promise.all([...Array(5)].map(e => upload(global.api("mp4anime.json")))).then(res => (a.push(...res), status = false));
      }, 1000 * 5);
      global.a = a;
    global.config.version = '4.6.9'
    global.client.timeStart = new Date().getTime(),
    function() {
      const listCommand = readdirSync(global.client.mainPath + '/modules/commands').filter(command => command.endsWith('.js') && !command.includes('example') && !global.config.commandDisabled.includes(command));
      for (const command of listCommand) {
          try {
              var module = goatCompat.normalize(require(global.client.mainPath + '/modules/commands/' + command), command);
              if (!module.config || !module.run || !module.config.commandCategory) throw new Error(global.getText('mirai', 'errorFormat'));
              if (global.client.commands.has(module.config.name || '')) throw new Error(global.getText('mirai', 'nameExist'));
              if (module.config.dependencies && typeof module.config.dependencies == 'object') {
                  for (const reqDependencies in module.config.dependencies) {
                      const reqDependenciesPath = join(__dirname, 'nodemodules', 'node_modules', reqDependencies);
                      try {
                          if (!global.nodemodule.hasOwnProperty(reqDependencies)) {
                              if (listPackage.hasOwnProperty(reqDependencies) || listbuiltinModules.includes(reqDependencies)) global.nodemodule[reqDependencies] = require(reqDependencies);
                              else global.nodemodule[reqDependencies] = require(reqDependenciesPath);
                          } else '';
                      } catch {
                          var check = false;
                          var isError;
                          logger.loader(global.getText('mirai', 'notFoundPackage', reqDependencies, module.config.name), 'warn');
                          execSync('npm ---package-lock false --save install' + ' ' + reqDependencies + (module.config.dependencies[reqDependencies] == '*' || module.config.dependencies[reqDependencies] == '' ? '' : '@' + module.config.dependencies[reqDependencies]), {
                              'stdio': 'inherit',
                              'env': process['env'],
                              'shell': true,
                              'cwd': join(__dirname, 'nodemodules')
                          });
                          for (let i = 1; i <= 3; i++) {
                              try {
                                  require['cache'] = {};
                                  if (listPackage.hasOwnProperty(reqDependencies) || listbuiltinModules.includes(reqDependencies)) global['nodemodule'][reqDependencies] = require(reqDependencies);
                                  else global['nodemodule'][reqDependencies] = require(reqDependenciesPath);
                                  check = true;
                                  break;
                              } catch (error) {
                                  isError = error;
                              }
                              if (check || !isError) break;
                          }
                          if (!check || isError) throw global.getText('mirai', 'cantInstallPackage', reqDependencies, module.config.name, isError);
                      }
                  }
              }
              if (module.config.envConfig) try {
                  for (const envConfig in module.config.envConfig) {
                      if (typeof global.configModule[module.config.name] == 'undefined') global.configModule[module.config.name] = {};
                      if (typeof global.config[module.config.name] == 'undefined') global.config[module.config.name] = {};
                      if (typeof global.config[module.config.name][envConfig] !== 'undefined') global['configModule'][module.config.name][envConfig] = global.config[module.config.name][envConfig];
                      else global.configModule[module.config.name][envConfig] = module.config.envConfig[envConfig] || '';
                      if (typeof global.config[module.config.name][envConfig] == 'undefined') global.config[module.config.name][envConfig] = module.config.envConfig[envConfig] || '';
                  }
              } catch (error) {
                  throw new Error(global.getText('mirai', 'loadedConfig', module.config.name, JSON.stringify(error)));
              }
              if (module.onLoad) {
                  try {
                      const moduleData = {};
                      moduleData.api = loginApiData;
                      moduleData.models = models;
                      module.onLoad(moduleData);
                  } catch (_0x20fd5f) {
                      throw new Error(global.getText('mirai', 'cantOnload', module.config.name, JSON.stringify(_0x20fd5f)), 'error');
                  };
              }
              if (module.handleEvent) global.client.eventRegistered.push(module.config.name);
              global.client.commands.set(module.config.name, module);
          } catch (error) {
              logger.loader(global.getText('mirai', 'failLoadModule', module.config.name, error), 'error');
          };
      }
  }(),
  function() {
      const events = readdirSync(global.client.mainPath + '/modules/events').filter(event => event.endsWith('.js') && !global.config.eventDisabled.includes(event));
      for (const ev of events) {
          try {
              var event = require(global.client.mainPath + '/modules/events/' + ev);
              if (!event.config || !event.run) throw new Error(global.getText('mirai', 'errorFormat'));
              if (global.client.events.has(event.config.name) || '') throw new Error(global.getText('mirai', 'nameExist'));
              if (event.config.dependencies && typeof event.config.dependencies == 'object') {
                  for (const dependency in event.config.dependencies) {
                      const _0x21abed = join(__dirname, 'nodemodules', 'node_modules', dependency);
                      try {
                          if (!global.nodemodule.hasOwnProperty(dependency)) {
                              if (listPackage.hasOwnProperty(dependency) || listbuiltinModules.includes(dependency)) global.nodemodule[dependency] = require(dependency);
                              else global.nodemodule[dependency] = require(_0x21abed);
                          } else '';
                      } catch {
                          let check = false;
                          let isError;
                          logger.loader(global.getText('mirai', 'notFoundPackage', dependency, event.config.name), 'warn');
                          execSync('npm --package-lock false --save install' + dependency + (event.config.dependencies[dependency] == '*' || event.config.dependencies[dependency] == '' ? '' : '@' + event.config.dependencies[dependency]), {
                              'stdio': 'inherit',
                              'env': process['env'],
                              'shell': true,
                              'cwd': join(__dirname, 'nodemodules')
                          });
                          for (let i = 1; i <= 3; i++) {
                              try {
                                  require['cache'] = {};
                                  if (global.nodemodule.includes(dependency)) break;
                                  if (listPackage.hasOwnProperty(dependency) || listbuiltinModules.includes(dependency)) global.nodemodule[dependency] = require(dependency);
                                  else global.nodemodule[dependency] = require(_0x21abed);
                                  check = true;
                                  break;
                              } catch (error) {
                                  isError = error;
                              }
                              if (check || !isError) break;
                          }
                          if (!check || isError) throw global.getText('mirai', 'cantInstallPackage', dependency, event.config.name);
                      }
                  }
              }
              if (event.config.envConfig) try {
                  for (const configevent in event.config.envConfig) {
                      if (typeof global.configModule[event.config.name] == 'undefined') global.configModule[event.config.name] = {};
                      if (typeof global.config[event.config.name] == 'undefined') global.config[event.config.name] = {};
                      if (typeof global.config[event.config.name][configevent] !== 'undefined') global.configModule[event.config.name][configevent] = global.config[event.config.name][configevent];
                      else global.configModule[event.config.name][configevent] = event.config.envConfig[configevent] || '';
                      if (typeof global.config[event.config.name][configevent] == 'undefined') global.config[event.config.name][configevent] = event.config.envConfig[configevent] || '';
                  }
              } catch (error) {
                  throw new Error(global.getText('mirai', 'loadedConfig', event.config.name, JSON.stringify(error)));
              }
              if (event.onLoad) try {
                  const eventData = {};
                  eventData.api = loginApiData, eventData.models = models;
                  event.onLoad(eventData);
              } catch (error) {
                  throw new Error(global.getText('mirai', 'cantOnload', event.config.name, JSON.stringify(error)), 'error');
              }
              global.client.events.set(event.config.name, event);
          } catch (error) {
              logger.loader(global.getText('mirai', 'failLoadModule', event.config.name, error), 'error');
          }
      }
  }()

  console.log(chalk.bold(co(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)));
        logger.loader(`Commands Loaded: ${global.client.commands.size}`)
        logger.loader(`Events Loaded: ${global.client.events.size}`)
        logger.loader('Time start: ' + (Date.now() - global.client.timeStart) / 1000 + 's') 
    writeFileSync(global.client.configPath,JSON.stringify(global.config, null, 4),'utf8');
    const listenerData = { api: loginApiData, models: models }
    const listener = require('./includes/listen')(listenerData)
    async function listenerCallback(error, message) {
      if (error) {
        logger('Account has been logged out, attempting to log in again!', '[ LOGIN-ACCOUNT ]')
        var _0x50d0db = await loginAppstate()
        _0x50d0db
        await new Promise((data) => setTimeout(data, 7000))
        process.exit(1)
      }
      // Skip non-message noise — both classic MQTT events and E2EE system events
      const _skipTypes = ['presence', 'typ', 'read_receipt',
        'e2ee_ready', 'e2ee_fully_ready', 'e2ee_connected',
        'e2ee_disconnected', 'e2ee_device_data_changed',
        'e2ee_receipt', 'e2ee_message_reaction'];
      if (_skipTypes.includes(message.type)) { return }
      return listener(message)
    }
    var _0x27b45c = setInterval(function (_0x5e6185) {
      uptime()
      process.exit(1)
    }, global.config.autoRestart)
    _0x27b45c
    global.handleListen = loginApiData.listenMqtt(listenerCallback)
    global.client.api = loginApiData
  })
}

(async () => {
  try {
    await connectDatabase()
    const authentication = { mongoose }
    const models = require('./includes/database/model')(authentication)
   logger(global.getText('mirai', 'successConnectDatabase'), '[ DATABASE ]')
    const botData = { models: models }
    onBot(botData)

    // Self-update system (see /update.md). Opt-in: does nothing unless
    // UPDATE_API_URL is configured. Checked once on boot, then on an
    // interval so a long-running bot picks up new releases on its own.
    const { runSelfUpdateCheck } = require('./utils/selfUpdate')
    const updateLog = (msg) => logger(msg, '[ SELF-UPDATE ]')
    runSelfUpdateCheck(updateLog)
    const updateIntervalMs = global.config.UPDATE_CHECK_INTERVAL_MS || 6 * 60 * 60 * 1000
    setInterval(() => runSelfUpdateCheck(updateLog), updateIntervalMs)
  } catch (error) {
    logger(global.getText('mirai', 'successConnectDatabase', JSON.stringify(error)), '[ DATABASE ]')
    console.error(error)
  }
})()
process.on('unhandledRejection', (err, p) => {
  console.error('[unhandledRejection]', err);
}).on('uncaughtException', err => {
  console.error('[uncaughtException]', err);
});
