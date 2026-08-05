const axios = require("axios");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

module.exports.config = {
 name: "install",
 version: "2.0.0",
 hasPermission: 2,
 credits: "rX Abdullah",
 description: "Install command or event via reply, code or URL with auto-load",
 usePrefix: true,
 commandCategory: "utility",
 usages: "install <code/url> | install event <code/url> | reply to code",
 cooldowns: 5
};

(function () {
 const d = s => Buffer.from(s, "base64").toString();
 const author = d("clggQWJkdWxsYWg=");
 if (module.exports.config.credits !== author)
 throw new Error("❌ Credit modification is not allowed!");
})();

// ===== LOADERS =====

const loadCommand = ({ filename, api, threadID, messageID }) => {
 const logger = require(global.client.mainPath + "/utils/log");
 const goatCompat = require(global.client.mainPath + "/utils/goatCompat");
 try {
 const filePath = path.join(__dirname, filename);
 delete require.cache[require.resolve(filePath)];
 const command = goatCompat.normalize(require(filePath), filename);

 if (!command.config || !command.run)
 throw new Error("Invalid command structure!");

 if (command.config.dependencies) {
 for (const dep in command.config.dependencies)
 global.nodemodule[dep] = require(dep);
 }

 if (command.handleEvent)
 global.client.eventRegistered.push(command.config.name);

 global.client.commands.set(command.config.name, command);
 logger.loader(`[ INSTALL ] Command loaded: ${command.config.name}`);
 api.sendMessage(`✅ Command installed: ${filename}`, threadID, messageID);
 } catch (e) {
 api.sendMessage(`❌ Command load failed:\n${e.message}`, threadID, messageID);
 }
};

const loadEvent = ({ filename, api, threadID, messageID }) => {
 const logger = require(global.client.mainPath + "/utils/log");
 // events folder সবসময় mainPath/modules/events/
 const eventsDir = path.join(global.client.mainPath, "modules", "events");
 try {
 const filePath = path.join(eventsDir, filename);
 delete require.cache[require.resolve(filePath)];
 const evt = require(filePath);

 if (!evt.config || !evt.config.name)
 throw new Error("Invalid event structure! (config.name missing)");
 if (!evt.handleEvent && !evt.run)
 throw new Error("Event must export handleEvent or run!");

 if (!global.client.eventRegistered.includes(evt.config.name))
 global.client.eventRegistered.push(evt.config.name);

 if (global.client.events)
 global.client.events.set(evt.config.name, evt);

 if (global.client.commands && !global.client.commands.has(evt.config.name))
 global.client.commands.set(evt.config.name, evt);

 logger.loader(`[ INSTALL ] Event loaded: ${evt.config.name}`);
 api.sendMessage(`✅ Event installed: ${filename}`, threadID, messageID);
 } catch (e) {
 api.sendMessage(`❌ Event load failed:\n${e.message}`, threadID, messageID);
 }
};

// ===== CORE =====

const doInstall = ({ filename, code, isEvent, api, threadID, messageID }) => {
 const eventsDir = path.join(global.client.mainPath, "modules", "events");
 const targetDir = isEvent ? eventsDir : __dirname;

 if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
 fs.writeFileSync(path.join(targetDir, filename), code, "utf-8");

 return isEvent
 ? loadEvent({ filename, api, threadID, messageID })
 : loadCommand({ filename, api, threadID, messageID });
};

// ===== RUN =====

module.exports.run = async ({ api, args, event }) => {
 try {
 // Syntax:
 // install event filename.js <code/url> → event
 // install filename.js <code/url> → command
 // reply করে install / install event → reply থেকে code

 let isEvent = false;
 let filename = null;
 let rest = "";

 if (args[0] && args[0].toLowerCase() === "event") {
 isEvent = true;
 filename = args[1];
 rest = args.slice(2).join(" ").trim();
 } else {
 filename = args[0];
 rest = args.slice(1).join(" ").trim();
 }

 // Reply থেকে code/url নেওয়া
 const replied = event.messageReply?.body?.trim();
 if (!rest && replied) rest = replied;

 // Filename না থাকলে URL বা reply থেকে বের করা
 if (!filename || !filename.endsWith(".js")) {
 const urlMatch = (rest || "").match(/(https?:\/\/[^\s]+\.js)/);
 if (urlMatch) filename = path.basename(urlMatch[0]);
 else if (!filename) filename = `cmd_${Date.now()}.js`;
 else filename = filename.replace(/[^a-zA-Z0-9_.-]/g, "_") + (filename.endsWith(".js") ? "" : ".js");
 }

 if (!rest) {
 return api.sendMessage(
 "⚠️ Usage:\n" +
 "• install filename.js <code/url>\n" +
 "• install event filename.js <code/url>\n" +
 "• reply করে: install filename.js\n" +
 "• reply করে: install event filename.js",
 event.threadID, event.messageID
 );
 }

 if (filename.includes("..") || path.isAbsolute(filename))
 return api.sendMessage("❌ Invalid filename!", event.threadID, event.messageID);

 // Fetch code
 let codeData;
 const isURL = /^(https?:\/\/[^\s]+)$/;
 if (isURL.test(rest)) {
 try {
 const res = await axios.get(rest);
 codeData = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
 } catch (e) {
 return api.sendMessage(`❌ URL থেকে code আনা গেলো না:\n${e.message}`, event.threadID, event.messageID);
 }
 } else {
 codeData = rest;
 }

 // Syntax check
 try { new vm.Script(codeData); }
 catch (e) {
 return api.sendMessage("❌ Syntax error:\n" + e.message, event.threadID, event.messageID);
 }

 const eventsDir = path.join(global.client.mainPath, "modules", "events");
 const savePath = path.join(isEvent ? eventsDir : __dirname, filename);

 // File exists → reaction দিয়ে replace
 if (fs.existsSync(savePath)) {
 return api.sendMessage(
 `⚠️ Already exists: ${filename}\nReact ✅ দিলে replace হবে।`,
 event.threadID,
 (err, info) => {
 if (err) return;
 global.client.handleReaction.push({
 name: "install",
 type: "replace",
 messageID: info.messageID,
 author: event.senderID,
 filename,
 code: codeData,
 isEvent
 });
 }
 );
 }

 return doInstall({ filename, code: codeData, isEvent, api, threadID: event.threadID, messageID: event.messageID });

 } catch (e) {
 console.error(e);
 api.sendMessage("❌ Install failed: " + e.message, event.threadID, event.messageID);
 }
};

// ===== REACTION =====

module.exports.handleReaction = async ({ api, event, handleReaction }) => {
 if (handleReaction.name !== "install") return;
 if (event.userID !== handleReaction.author) return;
 if (event.reaction !== "✅" && event.reaction !== "👍") return;

 try { api.unsendMessage(handleReaction.messageID); } catch {}

 return doInstall({
 filename: handleReaction.filename,
 code: handleReaction.code,
 isEvent: handleReaction.isEvent || false,
 api,
 threadID: event.threadID,
 messageID: event.messageID
 });
};