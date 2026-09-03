#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

async function importESM(specifier) {
  const dynamicImport = new Function("specifier", "return import(specifier)");
  return dynamicImport(specifier);
}

async function handleMessage(client, event) {
  const PREFIX = "!";
  const body = (event.body || "").trim();
  if (!body.startsWith(PREFIX)) return;

  const args = body.slice(PREFIX.length).trim().split(/\s+/);
  const cmd = (args.shift() || "").toLowerCase();

  console.log(`[command] /${cmd} args=${JSON.stringify(args)} from=${event.senderID} thread=${event.threadID}`);

  try {
    switch (cmd) {
      case "ping":
        await client.sendMessage(event.threadID, { body: "Pong! E2EE Bot is alive." });
        break;

      case "info":
        await client.sendMessage(event.threadID, {
          body: [
            `Message ID: ${event.messageID || "N/A"}`,
            `Sender: ${event.senderID}`,
            `Thread: ${event.threadID}`,
            `Type: ${event.isGroup ? "GROUP" : "DM"}`,
            `Time: ${new Date(event.timestamp || Date.now()).toLocaleString()}`,
          ].join("\n"),
        });
        break;

      case "echo":
        await client.sendMessage(event.threadID, { body: `Echo: ${args.join(" ") || "(nothing to echo)"}` });
        break;

      case "help":
        await client.sendMessage(event.threadID, {
          body: [
            "Commands:",
            "!ping - test bot response",
            "!info - show message info",
            "!echo <text> - echo text back",
            "!help - show this help",
          ].join("\n"),
        });
        break;

      default:
        await client.sendMessage(event.threadID, { body: `Unknown command: !${cmd}. Try !help` });
    }
  } catch (err) {
    console.error(`Error handling command /${cmd}: ${err.message}`);
  }
}

function loadCookies(cookiePath = "./cookie.txt") {
  if (!fs.existsSync(cookiePath)) throw new Error(`Cookie file not found: ${cookiePath}`);

  const raw = fs.readFileSync(cookiePath, "utf8").trim();
  const data = JSON.parse(raw);
  if (!Array.isArray(data) || data.length === 0) throw new Error(`Invalid cookie format in ${cookiePath}`);

  return data;
}

function convertCookiesToClientFormat(appStateCookies) {
  const cookieMap = {};
  for (const cookie of appStateCookies) {
    const key = cookie.key || cookie.name;
    const value = cookie.value;
    if (key && value) cookieMap[key] = value;
  }
  return cookieMap;
}

function loadConfig(configPath = "./config.json") {
  try {
    if (fs.existsSync(configPath)) return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (e) {
    console.warn(`Could not load config: ${e.message}`);
  }
  return {};
}

function loadDeviceData(deviceDataPath = "./e2ee_device.json") {
  try {
    if (fs.existsSync(deviceDataPath)) return JSON.parse(fs.readFileSync(deviceDataPath, "utf8"));
  } catch (e) {
    console.warn(`Could not load device data: ${e.message}`);
  }
  return null;
}

function saveDeviceData(deviceData, deviceDataPath = "./e2ee_device.json") {
  try {
    fs.writeFileSync(deviceDataPath, JSON.stringify(deviceData, null, 2), "utf8");
  } catch (e) {
    console.error(`Failed to save device data: ${e.message}`);
  }
}

async function main() {
  const appStateCookies = loadCookies(path.join(process.cwd(), "cookie.txt"));
  const clientCookies = convertCookiesToClientFormat(appStateCookies);
  const deviceData = loadDeviceData(path.join(process.cwd(), "e2ee_device.json"));

  if (!clientCookies.c_user) throw new Error("Missing c_user cookie - login might have failed");
  if (!clientCookies.xs) throw new Error("Missing xs cookie - login might have failed");

  const libPath = path.join(__dirname, "..", "extra", "lib", "index.mjs");
  const libUrl = new (require("url").URL)("file:" + libPath).href;

  const mod = await importESM(libUrl);
  const ClientClass = mod.Client;
  if (!ClientClass) throw new Error("Client class not exported from lib/index.mjs");

  const clientOptions = {
    enableE2EE: true,
    autoReconnect: true,
    e2eeMemoryOnly: true,
    logLevel: "none",
    ...(deviceData && { deviceData }),
  };

  const client = new ClientClass(clientCookies, clientOptions);

  client.on("ready", () => console.log(`[ready] Connected as user ${client.currentUserId}`));
  client.on("fullyReady", () => console.log("[fullyReady] E2EE fully initialized"));
  client.on("e2eeConnected", () => console.log("[e2eeConnected] E2EE bridge connected"));

  client.on("e2eeMessage", (event) => {
    console.log("[e2eeMessage]", JSON.stringify(event));
    handleMessage(client, event);
  });

  client.on("e2eeReaction", (event) => {
    console.log("[e2eeReaction]", JSON.stringify(event));
  });

  client.on("deviceDataChanged", (eventData) => {
    if (eventData && eventData.deviceData) saveDeviceData(eventData.deviceData);
  });

  client.on("message", (event) => {
    console.log("[message]", JSON.stringify(event));
    handleMessage(client, event);
  });

  client.on("error", (err) => console.error("[error]", err.message || err));
  client.on("disconnected", (info) => console.warn("[disconnected]", info));

  const result = await client.connect();
  console.log(`Connected as: ${result.user.name} (${result.user.id})`);

  try {
    await client.connectE2EE();
  } catch (err) {
    console.warn(`E2EE connection warning: ${err.message}`);
  }

  try {
    const devData = await client.getDeviceData();
    if (devData) saveDeviceData(devData);
  } catch (err) {
    console.warn(`Could not get device data: ${err.message}`);
  }

  console.log("Bot is ready. Listening for messages...");
}

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(1));
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  process.exit(1);
});

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
