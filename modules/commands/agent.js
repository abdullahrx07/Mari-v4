/**
 * agent.js — AI-powered command manager for Maria Bot
 *
 * Commands (prefix: !agent):
 *   !agent ai <message>          — chat with the configured AI provider
 *   !agent install <url>         — download & install a command from a URL
 *   !agent unload <cmdname>      — unload a loaded command without deleting it
 *   !agent reload <cmdname>      — reload a command file from disk
 *   !agent fix <file> | <desc>   — ask AI to apply a described change to a file
 *   !agent provider <name>       — switch AI provider on the fly (admin only)
 *   !agent config                — show current agent config (admin only)
 *   !agent list                  — list installed commands
 *
 * AI Providers supported (configure in config.json > agent):
 *   openai   — OpenAI ChatCompletion (gpt-4o-mini, gpt-4o, etc.)
 *   gemini   — Google Gemini (gemini-1.5-flash, gemini-1.5-pro, etc.)
 *   groq     — Groq (llama3-8b-8192, mixtral-8x7b, etc.)
 *   mistral  — Mistral AI (mistral-small-latest, mistral-large-latest, etc.)
 */

const fs = require("fs");
const path = require("path");
const axios = require("axios");

module.exports.config = {
  name: "agent",
  version: "1.0.0",
  hasPermssion: 0,
  credits: "rX",
  description:
    "AI assistant + command manager. Chat with AI, install/unload/reload commands, and ask AI to fix files.",
  commandCategory: "system",
  usages:
    "ai <msg> | install <url> | unload <cmd> | reload <cmd> | fix <file> | <desc> | provider <name> | config | list",
  cooldowns: 3,
};

// ─── helpers ────────────────────────────────────────────────────────────────

function getAgentConfig() {
  const cfg = (global.config && global.config.agent) || {};
  return {
    aiProvider: cfg.aiProvider || "gemini",
    providers: cfg.providers || {},
    systemPrompt:
      cfg.systemPrompt || "You are a helpful bot assistant. Be concise and friendly.",
    maxTokens: cfg.maxTokens || 1024,
  };
}

function saveAgentProvider(providerName) {
  try {
    const cfgPath = path.join(process.cwd(), "config.json");
    const raw = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
    if (!raw.agent) raw.agent = {};
    raw.agent.aiProvider = providerName;
    fs.writeFileSync(cfgPath, JSON.stringify(raw, null, 4), "utf-8");
    if (global.config && global.config.agent) global.config.agent.aiProvider = providerName;
  } catch (e) {
    throw new Error("Failed to save provider: " + e.message);
  }
}

// ─── AI call ────────────────────────────────────────────────────────────────

async function callAI(prompt, systemPrompt) {
  const { aiProvider, providers, maxTokens } = getAgentConfig();
  const prov = providers[aiProvider] || {};

  if (aiProvider === "gemini") {
    const apiKey = prov.apiKey || process.env.GEMINI_API_KEY || "";
    if (!apiKey) throw new Error("Gemini API key not set in config.json > agent > providers > gemini > apiKey");
    const model = prov.model || "gemini-1.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const body = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens },
    };
    const res = await axios.post(url, body, { timeout: 30000 });
    const parts = res.data?.candidates?.[0]?.content?.parts;
    if (!parts || !parts[0]) throw new Error("Empty response from Gemini");
    return parts.map((p) => p.text || "").join("").trim();
  }

  // OpenAI-compatible (openai / groq / mistral)
  const apiKey = prov.apiKey || process.env[`${aiProvider.toUpperCase()}_API_KEY`] || "";
  if (!apiKey) throw new Error(`API key not set in config.json > agent > providers > ${aiProvider} > apiKey`);

  const defaults = {
    openai: "https://api.openai.com/v1",
    groq: "https://api.groq.com/openai/v1",
    mistral: "https://api.mistral.ai/v1",
  };
  const baseURL = prov.baseURL || defaults[aiProvider] || "https://api.openai.com/v1";
  const model = prov.model || "gpt-4o-mini";

  const res = await axios.post(
    `${baseURL}/chat/completions`,
    {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      max_tokens: maxTokens,
    },
    { headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, timeout: 30000 }
  );

  const text = res.data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Empty response from AI");
  return text.trim();
}

// ─── Command manager helpers ─────────────────────────────────────────────────

const COMMANDS_DIR = path.join(process.cwd(), "modules", "commands");

function unloadCommand(name) {
  const cmdName = name.toLowerCase();
  if (!global.client.commands.has(cmdName)) {
    throw new Error(`Command "${cmdName}" is not loaded.`);
  }
  global.client.commands.delete(cmdName);
  // Clear from require cache so next reload picks up changes
  const cmdPath = path.join(COMMANDS_DIR, cmdName + ".js");
  if (require.cache[require.resolve(cmdPath)]) {
    delete require.cache[require.resolve(cmdPath)];
  }
  return `✅ Unloaded command: ${cmdName}`;
}

function reloadCommand(name) {
  const cmdName = name.toLowerCase();
  const cmdPath = path.join(COMMANDS_DIR, cmdName + ".js");

  if (!fs.existsSync(cmdPath)) {
    throw new Error(`File not found: modules/commands/${cmdName}.js`);
  }

  // Remove from require cache
  if (require.cache[require.resolve(cmdPath)]) {
    delete require.cache[require.resolve(cmdPath)];
  }

  // Remove from commands map if loaded
  global.client.commands.delete(cmdName);

  // Re-load with goatCompat if available
  let mod;
  try {
    const goatCompat = require(path.join(process.cwd(), "utils", "goatCompat"));
    mod = goatCompat.normalize(require(cmdPath), cmdName + ".js");
  } catch {
    mod = require(cmdPath);
  }

  if (!mod || !mod.config || !mod.config.name) {
    throw new Error("Loaded file does not export a valid command config.");
  }

  global.client.commands.set(mod.config.name, mod);
  return `✅ Reloaded command: ${mod.config.name} (v${mod.config.version || "?"})`;
}

async function installCommand(urlOrName) {
  let downloadUrl = urlOrName;

  // If it looks like a raw GitHub URL or direct URL, use it as-is.
  // Otherwise treat as a file name and try to resolve from common sources.
  if (!downloadUrl.startsWith("http")) {
    throw new Error(
      "Please provide a direct download URL (e.g. a raw.githubusercontent.com link)."
    );
  }

  const res = await axios.get(downloadUrl, { timeout: 20000, responseType: "text" });
  const code = res.data;

  // Extract module name from the code
  const nameMatch = code.match(/["']name["']\s*:\s*["']([^"']+)["']/);
  if (!nameMatch) throw new Error("Could not find 'name' in command config — is this a valid command file?");
  const cmdName = nameMatch[1].toLowerCase();

  const destPath = path.join(COMMANDS_DIR, cmdName + ".js");
  fs.writeFileSync(destPath, code, "utf-8");

  // Load it
  return reloadCommand(cmdName);
}

// ─── AI file fix ─────────────────────────────────────────────────────────────

async function fixFile(filePath, description) {
  // Resolve relative to bot root
  const absPath = path.isAbsolute(filePath)
    ? filePath
    : path.join(process.cwd(), filePath);

  if (!fs.existsSync(absPath)) throw new Error(`File not found: ${filePath}`);

  const original = fs.readFileSync(absPath, "utf-8");
  if (original.length > 30000) throw new Error("File too large to send to AI (>30KB).");

  const prompt = `You are a code editor. Below is the contents of \`${filePath}\`.

Apply the following change: ${description}

Return ONLY the complete updated file contents, no explanation, no markdown code fences.

--- FILE START ---
${original}
--- FILE END ---`;

  const updated = await callAI(prompt, "You are a precise code editor. Return only the updated file content with no surrounding markdown or explanation.");

  // Strip markdown fences if AI wrapped them anyway
  const stripped = updated
    .replace(/^```[a-z]*\n?/i, "")
    .replace(/\n?```$/i, "")
    .trim();

  // Back up original
  fs.writeFileSync(absPath + ".bak", original, "utf-8");
  fs.writeFileSync(absPath, stripped, "utf-8");

  return `✅ File updated: ${filePath}\n(Backup saved as ${path.basename(absPath)}.bak)`;
}

// ─── Main run ─────────────────────────────────────────────────────────────────

module.exports.run = async function ({ api, event, args, permssion }) {
  const { threadID, messageID } = event;
  const isAdmin = permssion >= 3; // Bot admin only for sensitive ops

  const sub = (args[0] || "").toLowerCase();
  const rest = args.slice(1);

  const reply = (msg) =>
    api.sendMessage(msg, threadID, messageID);

  // ── !agent ai <message> ─────────────────────────────────────────────────
  if (sub === "ai" || sub === "chat") {
    if (!rest.length) return reply("❌ Usage: !agent ai <your message>");
    const { systemPrompt, aiProvider } = getAgentConfig();
    try {
      reply(`🤖 Thinking... (using ${aiProvider})`);
      const answer = await callAI(rest.join(" "), systemPrompt);
      return reply(`🤖 ${aiProvider}:\n\n${answer}`);
    } catch (e) {
      return reply(`❌ AI error: ${e.message}`);
    }
  }

  // ── !agent install <url> ────────────────────────────────────────────────
  if (sub === "install") {
    if (!isAdmin) return reply("❌ Only bot admins can install commands.");
    if (!rest.length) return reply("❌ Usage: !agent install <direct-download-url>");
    try {
      reply("📦 Installing command...");
      const result = await installCommand(rest[0]);
      return reply(result);
    } catch (e) {
      return reply(`❌ Install failed: ${e.message}`);
    }
  }

  // ── !agent unload <cmdname> ─────────────────────────────────────────────
  if (sub === "unload") {
    if (!isAdmin) return reply("❌ Only bot admins can unload commands.");
    if (!rest.length) return reply("❌ Usage: !agent unload <command name>");
    try {
      return reply(unloadCommand(rest[0]));
    } catch (e) {
      return reply(`❌ ${e.message}`);
    }
  }

  // ── !agent reload <cmdname> ─────────────────────────────────────────────
  if (sub === "reload") {
    if (!isAdmin) return reply("❌ Only bot admins can reload commands.");
    if (!rest.length) return reply("❌ Usage: !agent reload <command name>");
    try {
      return reply(reloadCommand(rest[0]));
    } catch (e) {
      return reply(`❌ Reload failed: ${e.message}`);
    }
  }

  // ── !agent fix <file> | <description> ──────────────────────────────────
  if (sub === "fix") {
    if (!isAdmin) return reply("❌ Only bot admins can modify files.");
    const combined = rest.join(" ");
    const sep = combined.indexOf("|");
    if (sep === -1) {
      return reply("❌ Usage: !agent fix <filepath> | <what to change>\nExample: !agent fix modules/commands/ping.js | Add a response time in ms");
    }
    const filePath = combined.slice(0, sep).trim();
    const desc = combined.slice(sep + 1).trim();
    if (!filePath || !desc) return reply("❌ Both file path and description are required.");
    try {
      reply(`🔧 Asking AI to fix ${filePath}...`);
      const result = await fixFile(filePath, desc);
      return reply(result);
    } catch (e) {
      return reply(`❌ Fix failed: ${e.message}`);
    }
  }

  // ── !agent provider <name> ──────────────────────────────────────────────
  if (sub === "provider") {
    if (!isAdmin) return reply("❌ Only bot admins can change the AI provider.");
    const name = (rest[0] || "").toLowerCase();
    const supported = ["openai", "gemini", "groq", "mistral"];
    if (!supported.includes(name)) {
      return reply(`❌ Unknown provider "${name}".\nSupported: ${supported.join(", ")}`);
    }
    try {
      saveAgentProvider(name);
      return reply(`✅ AI provider switched to: ${name}`);
    } catch (e) {
      return reply(`❌ ${e.message}`);
    }
  }

  // ── !agent config ───────────────────────────────────────────────────────
  if (sub === "config") {
    if (!isAdmin) return reply("❌ Only bot admins can view agent config.");
    const cfg = getAgentConfig();
    const prov = cfg.providers[cfg.aiProvider] || {};
    const keySet = !!(prov.apiKey && prov.apiKey.length > 0);
    let msg = `╭──❏ 𝐀𝐠𝐞𝐧𝐭 𝐂𝐨𝐧𝐟𝐢𝐠 ❏──╮\n`;
    msg += `│ ✧ Active Provider: ${cfg.aiProvider}\n`;
    msg += `│ ✧ Model: ${prov.model || "default"}\n`;
    msg += `│ ✧ API Key: ${keySet ? "✅ Set" : "❌ Not set"}\n`;
    msg += `│ ✧ Max Tokens: ${cfg.maxTokens}\n`;
    msg += `╰─────────────────────⭓\n`;
    msg += `Supported: openai, gemini, groq, mistral\n`;
    msg += `Switch with: !agent provider <name>`;
    return reply(msg);
  }

  // ── !agent list ─────────────────────────────────────────────────────────
  if (sub === "list") {
    const cmds = Array.from(global.client.commands.keys()).sort();
    const chunks = [];
    for (let i = 0; i < cmds.length; i += 30) {
      chunks.push(cmds.slice(i, i + 30).join(", "));
    }
    let msg = `📋 Loaded commands (${cmds.length}):\n\n`;
    msg += chunks.join("\n");
    return reply(msg);
  }

  // ── Help ────────────────────────────────────────────────────────────────
  let helpMsg = `╭──❏ 𝐀𝐠𝐞𝐧𝐭 𝐂𝐨𝐦𝐦𝐚𝐧𝐝𝐬 ❏──╮\n`;
  helpMsg += `│ !agent ai <msg>           — chat with AI\n`;
  helpMsg += `│ !agent list               — list loaded commands\n`;
  helpMsg += `│\n`;
  helpMsg += `│ [Admin only]\n`;
  helpMsg += `│ !agent install <url>      — install from URL\n`;
  helpMsg += `│ !agent unload <cmd>       — unload a command\n`;
  helpMsg += `│ !agent reload <cmd>       — reload from disk\n`;
  helpMsg += `│ !agent fix <file>|<desc>  — AI edits a file\n`;
  helpMsg += `│ !agent provider <name>    — switch AI provider\n`;
  helpMsg += `│ !agent config             — show AI config\n`;
  helpMsg += `╰─────────────────────⭓`;
  return reply(helpMsg);
};
