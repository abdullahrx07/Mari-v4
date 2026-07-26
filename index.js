const { spawn } = require("child_process");
const fs = require("fs");
const axios = require("axios");
const deviceID = require('uuid');
const adid = require('uuid');
const { TOTP: _TOTP } = require('totp-generator');
// Wrap new totp-generator v1.x API to behave like the old v0.x function
const totp = (secret) => _TOTP.generate(secret.replace(/\s+/g, '').toUpperCase()).otp;
const logger = require("./utils/log");

const colors = ["FF9900","FFFF33","33FFFF","FF99FF","FF3366","FFFF66","FF00FF","66FF99"];
const randomColor = colors[Math.floor(Math.random() * colors.length)]

fs.readFile('package.json', 'utf8', (err, data) => {
  if (err) return;
  try {
    const packageJson = JSON.parse(data);
    const dependencies = packageJson.dependencies || {};
    const totalDependencies = Object.keys(dependencies).length;
    logger(`Total installed packages: ${totalDependencies}`, '[PACKAGE]');
  } catch {}
});

try {
  const files = fs.readdirSync('./modules/commands');
  files.forEach(file => {
    if (file.endsWith('.js')) require(`./modules/commands/${file}`);
  });
  logger('Performing module check...', '[AUTO-CHECK]');
  logger('All modules are working properly', '[AUTO-CHECK]');
} catch (error) {
  logger('Module error detected:', '[AUTO-CHECK]');
  console.log(error);
}

function startBot(message) {
  if(message) logger(message, "[START]");

  const child = spawn("node", ["--trace-warnings", "--async-stack-traces", "main.js"], {
      cwd: __dirname,
      stdio: "inherit",
      shell: true
  });

  child.on("close", (exitCode) => {
      if (exitCode !== 0 || (global.countRestart && global.countRestart < 5)) {
          startBot("Bot crashed, restarting...");
          global.countRestart = (global.countRestart || 0) + 1;
          return;
      }
  });

  child.on("error", (error) => {
      logger("Error occurred: " + JSON.stringify(error), "[START]");
  });
}
const logacc = require('./acc.json');
const config = require('./config.json');

async function login() {
  if (config.ACCESSTOKEN !== "") return;

  if (!logacc || !logacc.EMAIL || !logacc.PASSWORD) {
    return console.log('Missing account info in acc.json');
  }

  const form = {
      adid: adid.v4(),
      email: logacc.EMAIL,
      password: logacc.PASSWORD,
      format: 'json',
      device_id: deviceID.v4(),
      cpl: 'true',
      family_device_id: deviceID.v4(),
      locale: 'en_US',
      client_country_code: 'US',
      credentials_type: 'device_based_login_password',
      generate_session_cookies: '1',
      generate_analytics_claim: '1',
      generate_machine_id: '1',
      currently_logged_in_userid: '0',
      try_num: "1",
      enroll_misauth: "false",
      meta_inf_fbmeta: "NO_FILE",
      source: 'login',
      machine_id: randomString(24),
      fb_api_req_friendly_name: 'authenticate',
      fb_api_caller_class: 'com.facebook.account.login.protocol.Fb4aAuthHandler',
      api_key: '882a8490361da98702bf97a021ddc14d',
      access_token: '275254692598279|585aec5b4c27376758abb7ffcb9db2af'
  };

  form.sig = encodesig(sort(form));

  const options = {
      url: 'https://b-graph.facebook.com/auth/login',
      method: 'post',
      data: form,
      transformRequest: [(data) => require('querystring').stringify(data)],
      headers: {
          'content-type': 'application/x-www-form-urlencoded',
          "x-fb-friendly-name": form["fb_api_req_friendly_name"],
          'x-fb-http-engine': 'Liger',
          'user-agent': 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko)'
      }
  };

  try {
    const res = await axios(options);
    if(res.data.access_token){
      config.ACCESSTOKEN = res.data.access_token;
      saveConfig(config);
    }
  } catch (err) {
    const data = err.response?.data?.error?.error_data;
    if (!data) return console.log(err.response?.data || err);

    if (!logacc.OTPKEY || !logacc.OTPKEY.trim()) {
      console.log('2FA required but OTPKEY is not set in acc.json — cannot complete login');
      return;
    }
    form.twofactor_code = totp(logacc.OTPKEY.trim());
    form.encrypted_msisdn = "";
    form.userid = data.uid;
    form.machine_id = data.machine_id;
    form.first_factor = data.login_first_factor;
    form.credentials_type = "two_factor";
    delete form.sig;
    form.sig = encodesig(sort(form));

    const option_2fa = {...options, data: form};
    try {
      const res2fa = await axios(option_2fa);
      if(res2fa.data.access_token){
        config.ACCESSTOKEN = res2fa.data.access_token;
        saveConfig(config);
      }
    } catch (error2) {
      console.log(error2.response?.data || error2);
    }
  }
}

function saveConfig(data) {
  fs.writeFileSync(`./config.json`, JSON.stringify(data, null, 4));
}

function randomString(length = 10) {
  let str = 'abcdefghijklmnopqrstuvwxyz'.charAt(Math.floor(Math.random() * 26));
  for (let i = 0; i < length - 1; i++) {
      str += 'abcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 36));
  }
  return str;
}

function encodesig(obj) {
  const crypto = require('crypto');
  let data = '';
  Object.keys(obj).forEach(key => data += key + '=' + obj[key]);
  return crypto.createHash('md5').update(data + '62f8ce9f74b12f84c123cc23437a4a32').digest('hex');
}

function sort(obj) {
  return Object.keys(obj).sort().reduce((res, key) => { res[key] = obj[key]; return res; }, {});
}

async function startb() {
  if(config.ACCESSTOKEN !== "") {
    startBot();
  } else {
    await login();
    setTimeout(() => startBot(), 7000);
  }
}

const express = require('express');
const app = express();
const PORT = process.env.PORT || 5000;

app.get('/', (req, res) => res.send('Maria v3 is running.'));

// Temporary convenience route: direct download link for the exported project
// zip. Safe to remove — serves only this one fixed file, nothing dynamic.
app.get('/download/mari-bot.zip', (req, res) => {
  const path = require('path');
  // Try new ST-FCA zip first, then legacy name
  const candidates = [
    path.join(__dirname, '..', 'exports', 'mari-bot-fca.zip'),
    path.join(__dirname, '..', 'exports', 'mari-bot.zip'),
    path.join(__dirname, '..', '..', 'mari-bot-fca.zip'),
  ];
  const zipPath = candidates.find(p => fs.existsSync(p));
  if (!zipPath) return res.status(404).send('Not found.');
  res.download(zipPath, 'mari-bot-stfca.zip');
});

app.listen(PORT, () => console.log(`[SERVER] Listening on port ${PORT}`));

startb();
