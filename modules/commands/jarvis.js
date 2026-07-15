// ============================================================
// JARVIS — Agent Command v5.0  (!jarvis / !ai / !j / !gpt)
// ✅ Agent mode: command file = JARVIS এর memory
// ✅ User এর কথামতো command install/uninstall/load/unload করে
// ✅ Command code modify, bugfix, নতুন command লেখে
// ✅ CommandScanner: natural language → command execute
// ✅ Full AI brain fallback
// ✅ Memory-based: JARVIS জানে সব command কী করে, কেমন লেখা
// ============================================================

const { brain, clearHistory }          = require('../../includes/brain/AIBrain');
const { scanAndDecide, executeCommand } = require('../../includes/brain/CommandScanner');
const { complete }                      = require('../../includes/brain/AIClient');
const {
  buildCommandContext,
  buildCommandSourceCache,
  getCommandSource,
  writeCommand,
  loadCommandIntoRuntime,
  unloadCommandFromRuntime,
  deleteCommandFile,
  validateCode,
  getLoadedCommandsSummary,
  reloadCommand,
} = require('../../includes/brain/CommandMemory');

module.exports.config = {
  name:            'jarvis',
  version:         '5.0.0',
  hasPermssion:    0,
  credits:         'rX Abdullah × JARVIS Agent Brain',
  description:     'JARVIS AI Agent — command memory, install, modify, bugfix, full control',
  commandCategory: 'AI',
  usages:          'jarvis [anything] | jarvis reset | jarvis install <url> | jarvis uninstall <name> | jarvis load <name> | jarvis unload <name> | jarvis fix <name> | jarvis modify <name> <instruction> | jarvis write <what> | jarvis list',
  cooldowns:       2,
  aliases:         ['ai', 'j', 'gpt', 'ask'],
};

function isAdminUser(senderID) {
  const ADMINBOT = global.config?.ADMINBOT || [];
  const NDH      = global.config?.NDH || [];
  return ADMINBOT.includes(String(senderID)) || NDH.includes(String(senderID));
}

function detectAgentIntent(message) {
  const m = message.toLowerCase().trim();
  if (/^(install|add command|command add|install command)/i.test(m) || /command\s+(install|add|dao|দাও)/i.test(m)) return 'install';
  if (/^(uninstall|delete command|remove command|command delete)/i.test(m) || /command\s+(uninstall|delete|remove|mecho|মুছে)/i.test(m)) return 'uninstall';
  if (/^(load|enable command|command load|command on)/i.test(m) || /command\s+(load|on|chalu|চালু)/i.test(m)) return 'load';
  if (/^(unload|disable command|command off|command unload)/i.test(m) || /command\s+(unload|off|bondho|বন্ধ)/i.test(m)) return 'unload';
  if (/^(reload|restart command|command reload)/i.test(m) || /command\s+(reload|restart|refresh)/i.test(m)) return 'reload';
  if (/^(fix|bugfix|debug|command fix|fix command)/i.test(m) || /command\s+(fix|debug|bugfix|thik|ঠিক)/i.test(m) || /^(thik kor|ঠিক কর|bug fix)/i.test(m)) return 'fix';
  if (/^(modify|edit command|command edit|change command|update command)/i.test(m) || /command\s+(modify|edit|change|update|badlao|বদলাও)/i.test(m)) return 'modify';
  if (/^(show command|read command|command code|view command)/i.test(m) || /command\s+(show|read|code|dekha|দেখা|source)/i.test(m)) return 'show_source';
  if (/^(list|command list|list command|sob command|সব command)/i.test(m) || /^(commands|cmd list)/i.test(m)) return 'list';
  if (/^(write|create|make|ban|bana|বানা|তৈরি)\s+.*(command|cmd)/i.test(m) || /(command|cmd)\s+(likho|write|create|bana|বানা|তৈরি)/i.test(m)) return 'write';
  return null;
}

function extractCommandName(message) {
  const quoted = message.match(/['"`]([a-zA-Z0-9_]+)['"`]/);
  if (quoted) return quoted[1].toLowerCase();
  const patterns = [
    /(?:install|uninstall|load|unload|fix|modify|reload|show|read|delete|remove)\s+([a-zA-Z0-9_]+)/i,
    /(?:command|cmd)\s+(?:name|named?|called?)?\s*:?\s*([a-zA-Z0-9_]+)/i,
    /([a-zA-Z0-9_]+)\s+(?:command|cmd)\s+(?:fix|modify|load|unload|delete)/i,
  ];
  for (const pat of patterns) {
    const m = message.match(pat);
    if (m?.[1] && !['command','cmd','the','a','an','this','that','fix','modify','load','unload','install','uninstall','reload','show','read','write','create','make'].includes(m[1].toLowerCase())) {
      return m[1].toLowerCase();
    }
  }
  return null;
}

function extractURL(message) {
  const match = message.match(/https?:\/\/[^\s]+/);
  return match ? match[0] : null;
}

async function fetchCode(url) {
  const axios = require('axios');
  const res = await axios.get(url, { timeout: 15000 });
  return typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
}

async function agentWriteOrModifyCommand({ instruction, existingSource = null }) {
  const sampleCtx = buildCommandContext('light').split('\n').slice(0, 25).join('\n');

  const systemPrompt = `You are JARVIS — expert Facebook Messenger bot developer (fca-based, GoatBot/MariaBot style).
Write or modify bot commands. Return ONLY complete .js file content. No markdown fences, no explanation.

COMMAND STRUCTURE:
module.exports.config = {
  name: 'commandname',
  version: '1.0.0',
  hasPermssion: 0,
  credits: 'rX Abdullah',
  description: 'Description',
  commandCategory: 'Category',
  usages: '[usage]',
  cooldowns: 5,
  dependencies: {},
};
module.exports.run = async function ({ api, event, args, models, Users, Threads, Currencies }) {
  const { threadID, messageID, senderID } = event;
  try {
    // code here
    return api.sendMessage('response', threadID, messageID);
  } catch (e) {
    return api.sendMessage('Error: ' + e.message, threadID, messageID);
  }
};

RULES: async/await, try/catch, working code only, axios for HTTP, Bangla UI if needed.
${existingSource ? `\nEXISTING CODE TO MODIFY:\n${existingSource}` : `\nREFERENCE COMMANDS:\n${sampleCtx}`}`;

  const result = await complete({
    messages: [{ role: 'user', content: instruction }],
    systemPrompt,
    complexity: 'complex',
  });
  return result.content.replace(/```(?:javascript|js)?\n?/g, '').replace(/```/g, '').trim();
}

async function agentFixCommand({ source, errorDescription = '' }) {
  const systemPrompt = `You are JARVIS — expert JavaScript developer for Facebook Messenger bots (fca-based).
Fix all bugs in this bot command. Return ONLY the complete fixed .js file. No markdown, no explanation.
Fix: missing try/catch, wrong api calls, async issues, logic errors, syntax errors, missing returns.`;

  const result = await complete({
    messages: [{ role: 'user', content: `Fix this command:\n\n${source}\n\n${errorDescription ? `Problem: ${errorDescription}` : 'Find and fix all issues.'}` }],
    systemPrompt,
    complexity: 'complex',
  });
  return result.content.replace(/```(?:javascript|js)?\n?/g, '').replace(/```/g, '').trim();
}

// ─────────────────────────────────────────────────────────────
// MAIN RUN
// ─────────────────────────────────────────────────────────────
module.exports.run = async function ({ api, event, args, models, Users, Threads, Currencies }) {
  const { threadID, messageID, senderID } = event;
  const message = args.join(' ').trim();
  const isAdmin = isAdminUser(senderID);

  if (!message) {
    return api.sendMessage(
      `🤖 JARVIS Agent v5.0\n\n` +
      `💬 কথা বলো: ${global.config.PREFIX}jarvis [যা চাও]\n` +
      `🔄 Reset: ${global.config.PREFIX}jarvis reset\n\n` +
      `🛠️ Agent (Admin only):\n` +
      `• jarvis list — সব command তালিকা\n` +
      `• jarvis install <url/code> — install\n` +
      `• jarvis uninstall <name> — মুছে ফেলো\n` +
      `• jarvis load <name> — চালু করো\n` +
      `• jarvis unload <name> — বন্ধ করো\n` +
      `• jarvis reload <name> — restart\n` +
      `• jarvis fix <name> [error] — bug ঠিক\n` +
      `• jarvis modify <name> <কী করতে হবে> — edit\n` +
      `• jarvis write <কী লিখতে হবে> — নতুন command`,
      threadID, messageID
    );
  }

  if (/^reset|^clear$/i.test(message)) {
    clearHistory(senderID);
    return api.sendMessage('🔄 Memory cleared!', threadID, messageID);
  }

  try { api.sendTypingIndicator(threadID); } catch (_) {}

  const agentIntent = detectAgentIntent(message);

  // ── AGENT ACTIONS (Admin only) ────────────────────────────
  if (agentIntent && isAdmin) {

    // LIST
    if (agentIntent === 'list') {
      const s = getLoadedCommandsSummary();
      return api.sendMessage(
        `📋 Command তালিকা\n\n✅ Active: ${s.loaded}\n📁 Total files: ${s.total}\n` +
        `${s.unloaded.length ? `⛔ Unloaded: ${s.unloaded.join(', ')}\n` : ''}` +
        `\nLoaded: ${s.loadedNames.join(', ')}`,
        threadID, messageID
      );
    }

    // SHOW SOURCE
    if (agentIntent === 'show_source') {
      const cmdName = extractCommandName(message);
      if (!cmdName) return api.sendMessage('❌ Command name বলো। যেমন: jarvis show help', threadID, messageID);
      const cmdData = getCommandSource(cmdName);
      if (!cmdData) return api.sendMessage(`❌ "${cmdName}" পাওয়া গেল না`, threadID, messageID);
      const preview = cmdData.source.slice(0, 1800);
      return api.sendMessage(
        `📄 ${cmdData.name}.js (${cmdData.size} bytes):\n\n${preview}${cmdData.source.length > 1800 ? '\n\n[বাকি কাটা হয়েছে]' : ''}`,
        threadID, messageID
      );
    }

    // LOAD
    if (agentIntent === 'load') {
      const cmdName = extractCommandName(message);
      if (!cmdName) return api.sendMessage('❌ Command name বলো।', threadID, messageID);
      return loadCommandIntoRuntime(cmdName, api, threadID, messageID);
    }

    // UNLOAD
    if (agentIntent === 'unload') {
      const cmdName = extractCommandName(message);
      if (!cmdName) return api.sendMessage('❌ Command name বলো।', threadID, messageID);
      return unloadCommandFromRuntime(cmdName, api, threadID, messageID);
    }

    // RELOAD
    if (agentIntent === 'reload') {
      const cmdName = extractCommandName(message);
      if (!cmdName) return api.sendMessage('❌ Command name বলো।', threadID, messageID);
      api.sendMessage(`🔄 Reloading ${cmdName}...`, threadID, messageID);
      return reloadCommand(cmdName, api, threadID, messageID);
    }

    // UNINSTALL
    if (agentIntent === 'uninstall') {
      const cmdName = extractCommandName(message);
      if (!cmdName) return api.sendMessage('❌ Command name বলো।', threadID, messageID);
      try {
        deleteCommandFile(cmdName);
        return api.sendMessage(`✅ "${cmdName}" মুছে ফেলা হয়েছে!`, threadID, messageID);
      } catch (e) {
        return api.sendMessage(`❌ Delete failed: ${e.message}`, threadID, messageID);
      }
    }

    // INSTALL
    if (agentIntent === 'install') {
      const url       = extractURL(message);
      const replyCode = event.messageReply?.body || '';
      let code = null;
      let filename = null;

      if (url) {
        api.sendMessage(`⬇️ Downloading...`, threadID, messageID);
        try {
          code = await fetchCode(url);
          const urlFile = url.split('/').pop().split('?')[0];
          if (urlFile.endsWith('.js')) filename = urlFile;
        } catch (e) {
          return api.sendMessage(`❌ Download failed: ${e.message}`, threadID, messageID);
        }
      } else if (replyCode && replyCode.includes('module.exports')) {
        code = replyCode;
      } else if (message.includes('module.exports')) {
        code = args.slice(1).join(' ');
      } else {
        return api.sendMessage(
          '❌ কোড বা URL দাও!\n\n• Code reply করে: jarvis install\n• URL দাও: jarvis install https://...',
          threadID, messageID
        );
      }

      const validation = validateCode(code);
      if (!validation.valid) return api.sendMessage(`❌ Syntax Error:\n${validation.error}`, threadID, messageID);

      if (!filename) {
        const nameMatch = code.match(/name\s*:\s*['"]([^'"]+)['"]/);
        filename = nameMatch ? `${nameMatch[1]}.js` : `cmd_${Date.now()}.js`;
      }

      try {
        writeCommand(filename, code);
        return loadCommandIntoRuntime(filename.replace('.js', ''), api, threadID, messageID);
      } catch (e) {
        return api.sendMessage(`❌ Install failed: ${e.message}`, threadID, messageID);
      }
    }

    // FIX
    if (agentIntent === 'fix') {
      const cmdName = extractCommandName(message);
      if (!cmdName) return api.sendMessage('❌ Command name বলো। যেমন: jarvis fix help', threadID, messageID);
      const cmdData = getCommandSource(cmdName);
      if (!cmdData) return api.sendMessage(`❌ "${cmdName}" পাওয়া গেল না`, threadID, messageID);

      const errorDesc = message
        .replace(/fix|bugfix|debug|thik kor|ঠিক কর/gi, '')
        .replace(new RegExp(cmdName, 'gi'), '')
        .trim();

      api.sendMessage(`🔧 ${cmdName} এর bug ঠিক করছি...`, threadID, messageID);
      try {
        const fixedCode = await agentFixCommand({ source: cmdData.source, errorDescription: errorDesc });
        const check = validateCode(fixedCode);
        if (!check.valid) return api.sendMessage(`❌ Fixed code এও syntax error:\n${check.error}`, threadID, messageID);

        writeCommand(`${cmdName}.bak_${Date.now()}.js`, cmdData.source);
        writeCommand(cmdData.file, fixedCode);
        reloadCommand(cmdName, null, null, null);

        return api.sendMessage(`✅ ${cmdName} fixed & reloaded!\n💾 Backup saved.`, threadID, messageID);
      } catch (e) {
        return api.sendMessage(`❌ Fix failed: ${e.message}`, threadID, messageID);
      }
    }

    // MODIFY
    if (agentIntent === 'modify') {
      const cmdName = extractCommandName(message);
      if (!cmdName) return api.sendMessage('❌ Command name + instruction বলো।\nযেমন: jarvis modify help এ emoji যোগ করো', threadID, messageID);
      const cmdData = getCommandSource(cmdName);
      if (!cmdData) return api.sendMessage(`❌ "${cmdName}" পাওয়া গেল না`, threadID, messageID);

      const instruction = message
        .replace(/modify|edit|change|update/gi, '')
        .replace(new RegExp(cmdName, 'gi'), '')
        .trim() || event.messageReply?.body || '';

      if (!instruction) return api.sendMessage('❌ কী করতে হবে বলো।', threadID, messageID);

      api.sendMessage(`✏️ ${cmdName} modify করছি...`, threadID, messageID);
      try {
        const modifiedCode = await agentWriteOrModifyCommand({ instruction, existingSource: cmdData.source });
        const check = validateCode(modifiedCode);
        if (!check.valid) return api.sendMessage(`❌ Modified code এ syntax error:\n${check.error}`, threadID, messageID);

        writeCommand(`${cmdName}.bak_${Date.now()}.js`, cmdData.source);
        writeCommand(cmdData.file, modifiedCode);
        reloadCommand(cmdName, null, null, null);

        return api.sendMessage(`✅ ${cmdName} modified & reloaded!\n📝 ${instruction}`, threadID, messageID);
      } catch (e) {
        return api.sendMessage(`❌ Modify failed: ${e.message}`, threadID, messageID);
      }
    }

    // WRITE (new command)
    if (agentIntent === 'write') {
      const instruction = message.replace(/^(write|create|make|ban|bana|বানা|তৈরি)\s+/i, '').trim();
      if (!instruction || instruction.length < 5) {
        return api.sendMessage('❌ কী command বানাতে চাও বলো।\nযেমন: jarvis write একটা random joke command', threadID, messageID);
      }

      api.sendMessage(`✍️ Command লিখছি...`, threadID, messageID);
      try {
        const newCode = await agentWriteOrModifyCommand({ instruction });
        const check = validateCode(newCode);
        if (!check.valid) return api.sendMessage(`❌ Generated code এ syntax error:\n${check.error}`, threadID, messageID);

        const nameMatch = newCode.match(/name\s*:\s*['"]([^'"]+)['"]/);
        const filename  = nameMatch ? `${nameMatch[1]}.js` : `newcmd_${Date.now()}.js`;

        writeCommand(filename, newCode);
        return loadCommandIntoRuntime(filename.replace('.js', ''), api, threadID, messageID);
      } catch (e) {
        return api.sendMessage(`❌ Write failed: ${e.message}`, threadID, messageID);
      }
    }
  }

  // ── CommandScanner ────────────────────────────────────────
  let decision = { action: 'ai_reply', command: null, args: [] };
  try {
    decision = await scanAndDecide({ message, userId: senderID, isAdmin, prefix: global.config?.PREFIX || '!', event });
  } catch (_) {}

  if (decision.action === 'run_command' && decision.command) {
    try {
      api.sendTypingIndicator(threadID);
      const ok = await executeCommand({ commandName: decision.command, args: decision.args, api, event, models, Users, Threads, Currencies });
      if (ok) return;
    } catch (_) {}
  }

  // ── AI Brain ─────────────────────────────────────────────
  let userName = null;
  try {
    const info = await new Promise((res, rej) => api.getUserInfo(senderID, (err, d) => err ? rej(err) : res(d)));
    userName = info?.[senderID]?.name?.split(' ')?.[0] || null;
  } catch (_) {}

  let threadInfo = '';
  try {
    const tInfo = await new Promise((res, rej) => api.getThreadInfo(threadID, (err, d) => err ? rej(err) : res(d)));
    if (tInfo) threadInfo = `Group: "${tInfo.threadName || 'this chat'}" | Members: ${tInfo.participantIDs?.length || '?'} | TID: ${threadID}`;
  } catch (_) {}

  // Command context inject for command-related questions
  const cmdRelated = /command|cmd|install|load|unload|fix|modify|কমান্ড/i.test(message);
  const commandContext = cmdRelated ? buildCommandContext('light') : null;

  const result = await brain.process({ message, userId: senderID, userName, threadInfo, api, commandContext });

  let reply = result.response;
  if (result.suggestions?.length) reply += `\n\n💡 ${result.suggestions[0]}`;
  if (global.config?.DeveloperMode) reply += `\n\n[${result.model?.split('/').pop()} | ${result.latencyMs}ms | ${result.emotionEmoji}]`;

  return api.sendMessage(reply, threadID, messageID);
};
