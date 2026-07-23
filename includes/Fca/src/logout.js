"use strict";

const utils = require("../utils");
const cheerio = require("cheerio");

module.exports = function (defaultFuncs, api, ctx) {
  return function logout(callback) {
    let resolveFunc = function () {};
    let rejectFunc = function () {};
    const returnPromise = new Promise(function (resolve, reject) {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    if (!callback) {
      callback = function (err) {
        if (err) return rejectFunc(err);
        resolveFunc();
      };
    }

    // Step 1: fetch the homepage and extract the logout link / h token
    defaultFuncs
      .get("https://www.facebook.com/", ctx.jar, null, ctx.globalOptions)
      .then(utils.saveCookies(ctx.jar))
      .then(function (res) {
        const html = res.body;
        const $ = cheerio.load(html);

        // Try to find the logout link directly in the page
        let logoutUrl = null;
        $("a[href]").each(function () {
          const href = $(this).attr("href");
          if (href && href.includes("/logout.php") && href.includes("h=")) {
            logoutUrl = href.startsWith("http") ? href : "https://www.facebook.com" + href;
          }
        });

        // Try script tags for logout link
        if (!logoutUrl) {
          const logoutMatch = html.match(/"([^"]*\/logout\.php\?[^"]*h=[^"]+)"/);
          if (logoutMatch) {
            let raw = logoutMatch[1].replace(/\\u0025/g, "%").replace(/\\/g, "");
            logoutUrl = raw.startsWith("http") ? raw : "https://www.facebook.com" + raw;
          }
        }

        if (logoutUrl) {
          return defaultFuncs
            .get(logoutUrl, ctx.jar, null, ctx.globalOptions)
            .then(utils.saveCookies(ctx.jar));
        }

        // Fallback: POST to logout.php using fb_dtsg and a basic h value
        // Extract h token from page if present
        let hToken = "";
        const hMatch = html.match(/"h":"([^"]+)"/);
        if (hMatch) hToken = hMatch[1];

        const fb_dtsg = ctx.fb_dtsg || utils.getFrom(html, '"token":"', '"');

        const form = {
          fb_dtsg: fb_dtsg,
          ref: "mb",
          h: hToken,
        };

        return defaultFuncs
          .post("https://www.facebook.com/logout.php", ctx.jar, form)
          .then(utils.saveCookies(ctx.jar));
      })
      .then(function (res) {
        ctx.loggedIn = false;
        // Stop MQTT if active
        try {
          if (ctx.mqttClient) {
            ctx.mqttClient.end();
            ctx.mqttClient = undefined;
          }
        } catch (_) {}
        callback();
      })
      .catch(function (err) {
        return callback(err);
      });

    return returnPromise;
  };
};
