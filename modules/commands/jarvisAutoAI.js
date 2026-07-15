// ============================================================
// JARVIS — Auto AI Handler v5.0
// ✅ Agent mode: command install/uninstall/load/unload/fix/modify
// ✅ CommandScanner → AI Brain fallback
// ✅ Command memory context inject
// ✅ Reply-chain, cooldown, DM/group support
// ============================================================

const { brain, clearHistory }          = require('../../includes/brain/AIBrain');
const { scanAndDecide, executeCommand } = require('../../includes/brain/CommandScanner');
const { complete }                      = require('../../includes/brain/AIClient');
const {
  buildCommandContext,
  getCommandSource,
  writeCommand,
  loadCommandIntoRuntime,
  unloadCommandFromRuntime,
  deleteCommandFile,
  validateCode,
  getLoadedCommandsSummary,
  reloadCommand,
} = require('../../includes/brain/CommandMemory');

const disabledThreads = new Set();
const cooldowns       = new Map();
const COOLDOWN_MS     = 2000;
const lastBotMsg      = new Map();

module.exports.config = {
  name:            'jarvisAutoAI',
  version:         '5.0.0',
  hasPermssion:    0,
  credits:         'rX Abdullah × JARVIS Agent',
  description:     'JARVIS Auto AI — agent mode, command memory, full brain',
  commandCategory: 'AI',
  usages:          'just talk to me',
  cooldowns:       0,
};

// ── Prefix command: !jarvisautoai [on|off|status] ─────────────
module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID } = event;
  const sub = (args[0] || 'status').toLowerCase();
  if (sub === 'on')  { disabledThreads.delete(threadID); return api.sendMessage('✅ JARVIS Auto-AI → ON', threadID, messageID); }
  if (sub === 'off') { disabledThreads.add(threadID);    return api.sendMessage('🔴 JARVIS Auto-AI → OFF', threadID, messageID); }
  const status = disabledThreads.has(threadID) ? '🔴 OFF' : '✅ ON';
  return api.sendMessage(`JARVIS Auto-AI: ${status}\nUse !jarvisautoai on/off`, threadID, messageID);
};

// ── Helper: admin check ───────────────────────────────────────
function isAdminUser(senderID) {
  const ADMINBOT = global.config?.ADMINBOT || [];
  const NDH      = global.config?.NDH || [];
  return ADMINBOT.includes(String(senderID)) || NDH.includes(String(senderID));
}

// ── Agent intent detection (same as jarvis.js) ────────────────
function detectAgentIntent(message) {
  const m = message.toLowerCase().trim();
  // Strip "jarvis" prefix if present
  const clean = m.replace(/^jarvis\s+/i, '');
  if (/^(install|add command|command add)/i.test(clean) || /command\s+(install|add|dao)/i.test(clean)) return 'install';
  if (/^(uninstall|delete command|remove command)/i.test(clean) || /command\s+(uninstall|delete|remove|mecho)/i.test(clean)) return 'uninstall';
  if (/^(load|enable command|command load|command on)/i.test(clean) || /command\s+(load|on|chalu|চালু)/i.test(clean)) return 'load';
  if (/^(unload|disable command|command off)/i.test(clean) || /command\s+(unload|off|bondho|বন্ধ)/i.test(clean)) return 'unload';
  if (/^(reload|restart command)/i.test(clean) || /command\s+(reload|restart)/i.test(clean)) return 'reload';
  if (/^(fix|bugfix|debug|command fix|fix command|thik kor|ঠিক কর)/i.test(clean) || /command\s+(fix|debug|thik|ঠিক)/i.test(clean)) return 'fix';
  if (/^(modify|edit command|change command)/i.test(clean) || /command\s+(modify|edit|change|badlao)/i.test(clean)) return 'modify';
  if (/^(list|command list|sob command|সব command)/i.test(clean)) return 'list';
  if (/^(write|create|make|bana|বানা|তৈরি)\s+.*(command|cmd)/i.test(clean)) return 'write';
  return null;
}

function extractCommandName(message) {
  const clean = message.replace(/^jarvis\s+/i, '');
  const quoted = clean.match(/['"`]([a-zA-Z0-9_]+)['"`]/);
  if (quoted) return quoted[1].toLowerCase();
  const patterns = [
    /(?:install|uninstall|load|unload|fix|modify|reload|show|read|delete|remove)\s+([a-zA-Z0-9_]+)/i,
    /(?:command|cmd)\s+:?\s*([a-zA-Z0-9_]+)/i,
  ];
  const skipWords = ['command','cmd','the','a','an','this','that','fix','modify','load','unload','install','uninstall','reload','show','write','create','make'];
  for (const pat of patterns) {
    const m = clean.match(pat);
    if (m?.[1] && !skipWords.includes(m[1].toLowerCase())) return m[1].toLowerCase();
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

async function agentWriteOrModify({ instruction, existingSource = null }) {
  const sampleCtx = buildCommandContext('light').split('\n').slice(0, 25).join('\n');
  const systemPrompt = `You are JARVIS — expert Facebook Messenger bot developer (fca/GoatBot style).
${existingSource ? 'Modify the existing command per instruction.' : 'Write a new bot command.'}
Return ONLY complete .js file content. No markdown fences, no explanation.
Structure: module.exports.config = {...}; module.exports.run = async ({ api, event, args, ... }) => {...};
Rules: async/await, try/catch, working code, axios for HTTP.
${existingSource ? `\nEXISTING CODE:\n${existingSource}` : `\nREFERENCE:\n${sampleCtx}`}`;

  const result = await complete({
    messages: [{ role: 'user', content: instruction }],
    systemPrompt,
    complexity: 'complex',
  });
  return result.content.replace(/```(?:javascript|js)?\n?/g, '').replace(/```/g, '').trim();
}

async function agentFix({ source, errorDesc = '' }) {
  const systemPrompt = `You are JARVIS — expert JS developer for Facebook Messenger bots.
Fix all bugs. Return ONLY the complete fixed .js file. No markdown, no explanation.`;
  const result = await complete({
    messages: [{ role: 'user', content: `Fix:\n\n${source}\n\n${errorDesc ? `Problem: ${errorDesc}` : 'Find and fix all issues.'}` }],
    systemPrompt,
    complexity: 'complex',
  });
  return result.content.replace(/```(?:javascript|js)?\n?/g, '').replace(/```/g, '').trim();
}

// ── Handle agent action ───────────────────────────────────────
async function handleAgentAction({ intent, message, event, api }) {
  const { threadID, messageID } = event;

  if (intent === 'list') {
    const s = getLoadedCommandsSummary();
    return api.sendMessage(
      `📋 Commands\n✅ Active: ${s.loaded} | 📁 Total: ${s.total}\n` +
      `${s.unloaded.length ? `⛔ Unloaded: ${s.unloaded.join(', ')}\n` : ''}` +
      `Active: ${s.loadedNames.join(', ')}`,
      threadID, messageID
    );
  }

  if (intent === 'load') {
    const name = extractCommandName(message);
    if (!name) return api.sendMessage('❌ Command name বলো।', threadID, messageID);
    return loadCommandIntoRuntime(name, api, threadID, messageID);
  }

  if (intent === 'unload') {
    const name = extractCommandName(message);
    if (!name) return api.sendMessage('❌ Command name বলো।', threadID, messageID);
    return unloadCommandFromRuntime(name, api, threadID, messageID);
  }

  if (intent === 'reload') {
    const name = extractCommandName(message);
    if (!name) return api.sendMessage('❌ Command name বলো।', threadID, messageID);
    api.sendMessage(`🔄 Reloading ${name}...`, threadID, messageID);
    return reloadCommand(name, api, threadID, messageID);
  }

  if (intent === 'uninstall') {
    const name = extractCommandName(message);
    if (!name) return api.sendMessage('❌ Command name বলো।', threadID, messageID);
    try { deleteCommandFile(name); return api.sendMessage(`✅ "${name}" মুছে ফেলা হয়েছে!`, threadID, messageID); }
    catch (e) { return api.sendMessage(`❌ Delete failed: ${e.message}`, threadID, messageID); }
  }

  if (intent === 'install') {
    const url       = extractURL(message);
    const replyCode = event.messageReply?.body || '';
    let code = null, filename = null;

    if (url) {
      api.sendMessage(`⬇️ Downloading...`, threadID, messageID);
      try {
        code = await fetchCode(url);
        const uf = url.split('/').pop().split('?')[0];
        if (uf.endsWith('.js')) filename = uf;
      } catch (e) { return api.sendMessage(`❌ Download failed: ${e.message}`, threadID, messageID); }
    } else if (replyCode && replyCode.includes('module.exports')) {
      code = replyCode;
    } else {
      return api.sendMessage('❌ URL বা code reply করো।', threadID, messageID);
    }

    const check = validateCode(code);
    if (!check.valid) return api.sendMessage(`❌ Syntax Error:\n${check.error}`, threadID, messageID);
    if (!filename) {
      const nm = code.match(/name\s*:\s*['"]([^'"]+)['"]/);
      filename = nm ? `${nm[1]}.js` : `cmd_${Date.now()}.js`;
    }
    try {
      writeCommand(filename, code);
      return loadCommandIntoRuntime(filename.replace('.js', ''), api, threadID, messageID);
    } catch (e) { return api.sendMessage(`❌ Install failed: ${e.message}`, threadID, messageID); }
  }

  if (intent === 'fix') {
    const name = extractCommandName(message);
    if (!name) return api.sendMessage('❌ Command name বলো।', threadID, messageID);
    const cmdData = getCommandSource(name);
    if (!cmdData) return api.sendMessage(`❌ "${name}" পাওয়া গেল না`, threadID, messageID);
    const errorDesc = message.replace(/fix|bugfix|debug|thik kor|ঠিক কর/gi, '').replace(new RegExp(name, 'gi'), '').trim();
    api.sendMessage(`🔧 ${name} fix করছি...`, threadID, messageID);
    try {
      const fixed = await agentFix({ source: cmdData.source, errorDesc });
      const check = validateCode(fixed);
      if (!check.valid) return api.sendMessage(`❌ Fixed code এও syntax error:\n${check.error}`, threadID, messageID);
      writeCommand(`${name}.bak_${Date.now()}.js`, cmdData.source);
      writeCommand(cmdData.file, fixed);
      reloadCommand(name, null, null, null);
      return api.sendMessage(`✅ ${name} fixed & reloaded!`, threadID, messageID);
    } catch (e) { return api.sendMessage(`❌ Fix failed: ${e.message}`, threadID, messageID); }
  }

  if (intent === 'modify') {
    const name = extractCommandName(message);
    if (!name) return api.sendMessage('❌ Command name + instruction বলো।', threadID, messageID);
    const cmdData = getCommandSource(name);
    if (!cmdData) return api.sendMessage(`❌ "${name}" পাওয়া গেল না`, threadID, messageID);
    const instruction = message.replace(/modify|edit|change|update/gi, '').replace(new RegExp(name, 'gi'), '').trim() || event.messageReply?.body || '';
    if (!instruction) return api.sendMessage('❌ কী করতে হবে বলো।', threadID, messageID);
    api.sendMessage(`✏️ ${name} modify করছি...`, threadID, messageID);
    try {
      const modified = await agentWriteOrModify({ instruction, existingSource: cmdData.source });
      const check = validateCode(modified);
      if (!check.valid) return api.sendMessage(`❌ Modified code এ error:\n${check.error}`, threadID, messageID);
      writeCommand(`${name}.bak_${Date.now()}.js`, cmdData.source);
      writeCommand(cmdData.file, modified);
      reloadCommand(name, null, null, null);
      return api.sendMessage(`✅ ${name} modified & reloaded!\n📝 ${instruction}`, threadID, messageID);
    } catch (e) { return api.sendMessage(`❌ Modify failed: ${e.message}`, threadID, messageID); }
  }

  if (intent === 'write') {
    const instruction = message.replace(/^jarvis\s+/i, '').replace(/^(write|create|make|bana|বানা|তৈরি)\s+/i, '').trim();
    if (!instruction) return api.sendMessage('❌ কী command বানাতে চাও বলো।', threadID, messageID);
    api.sendMessage(`✍️ Command লিখছি...`, threadID, messageID);
    try {
      const code = await agentWriteOrModify({ instruction });
      const check = validateCode(code);
      if (!check.valid) return api.sendMessage(`❌ Syntax error:\n${check.error}`, threadID, messageID);
      const nm = code.match(/name\s*:\s*['"]([^'"]+)['"]/);
      const filename = nm ? `${nm[1]}.js` : `newcmd_${Date.now()}.js`;
      writeCommand(filename, code);
      return loadCommandIntoRuntime(filename.replace('.js', ''), api, threadID, messageID);
    } catch (e) { return api.sendMessage(`❌ Write failed: ${e.message}`, threadID, messageID); }
  }
}

// ── Main handleEvent ──────────────────────────────────────────
module.exports.handleEvent = async function ({ api, event, models, Users, Threads, Currencies }) {
  const { threadID, messageID, senderID, body, type, messageReply } = event;

  if (type === 'message_unsend') return;
  if (!body || body.trim().length === 0) return;

  const message = body.trim();
  const uid     = String(senderID);

  if (disabledThreads.has(threadID)) return;

  let botID = '';
  try { botID = String(api.getCurrentUserID()); } catch (_) {}
  if (botID && uid === botID) return;

  const prefix = global.config?.PREFIX || '!';
  if (message.startsWith(prefix)) return;

  const ADMINBOT     = global.config?.ADMINBOT || [];
  const isAdmin      = isAdminUser(uid);
  const isDM         = event.isGroup === false || (!event.isGroup && senderID === threadID);
  const isReplyToBot = !!(messageReply && botID && String(messageReply.senderID) === botID);

  const configBotName = (global.config?.BOTNAME || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const msgLower      = message.toLowerCase();

  const mentionBot = (
    msgLower.includes('jarvis') ||
    (configBotName.length > 2 && msgLower.includes(configBotName)) ||
    /^(j|hey bot|oi bot|bot)/i.test(message.trim())
  );

  const shouldRespond = isAdmin || isDM || mentionBot || isReplyToBot;
  if (!shouldRespond) return;

  const now = Date.now();
  if (now - (cooldowns.get(uid) || 0) < COOLDOWN_MS) return;
  cooldowns.set(uid, now);

  // Reset
  if (/^(jarvis\s+)?(reset|clear memory)$/i.test(message)) {
    clearHistory(uid);
    return api.sendMessage('🔄 Memory cleared!', threadID, messageID);
  }

  try { api.sendTypingIndicator(threadID); } catch (_) {}

  // ── Agent intent (admin only) ────────────────────────────
  const agentIntent = detectAgentIntent(message);
  if (agentIntent && isAdmin) {
    return handleAgentAction({ intent: agentIntent, message, event, api });
  }

  // ── CommandScanner ───────────────────────────────────────
  let decision = { action: 'ai_reply', command: null, args: [] };
  try {
    decision = await scanAndDecide({ message, userId: uid, isAdmin, prefix, event });
  } catch (_) {}

  if (decision.action === 'run_command' && decision.command) {
    try {
      api.sendTypingIndicator(threadID);
      const ackMessages = {
        ban:'🔨 Banning...', kick:'👢 Kicking...', rank:'📊 Fetching rank...',
        help:'📋 Loading help...', tns:'🌐 Translating...', youtube:'🎬 Searching...',
        pic:'🖼️ Searching image...', math:'🔢 Calculating...', balance:'💰 Checking...',
      };
      const ack = ackMessages[decision.command];
      if (ack) api.sendMessage(ack, threadID, messageID);

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
    if (tInfo) {
      threadInfo = `Group: "${tInfo.threadName || 'this chat'}" | Members: ${tInfo.participantIDs?.length || '?'} | TID: ${threadID} | Admins: ${(tInfo.adminIDs||[]).map(a=>a.id).join(',')||'?'}`;
    }
  } catch (_) {}

  // Inject command context if user is asking about commands
  const cmdRelated = /command|cmd|install|load|unload|fix|modify|কমান্ড/i.test(message);
  const commandContext = cmdRelated ? buildCommandContext('light') : null;

  try {
    const result = await brain.process({
      message,
      userId:       uid,
      userName,
      replyContext: isReplyToBot ? (messageReply?.body || null) : null,
      threadInfo,
      api,
      commandContext,
    });

    if (!result.success) return;

    let reply = result.response;
    if (result.suggestions?.length && Math.random() > 0.5) reply += `\n\n💡 ${result.suggestions[0]}`;
    if (global.config?.DeveloperMode) {
      reply += `\n\n[${result.model?.split('/').pop()} | ${result.latencyMs}ms | ${result.emotionEmoji}${result.realtime ? ` | 🔧${result.realtimeTool}` : ''}]`;
    }

    const sentInfo = await new Promise((res, rej) =>
      api.sendMessage(reply, threadID, (err, info) => err ? rej(err) : res(info), messageID)
    );
    if (sentInfo?.messageID) lastBotMsg.set(threadID, sentInfo.messageID);

  } catch (err) {
    if (global.config?.DeveloperMode) console.error('[JARVIS AutoAI Error]', err.message);
  }
};

module.exports.disableThread = (tid) => disabledThreads.add(String(tid));
module.exports.enableThread  = (tid) => disabledThreads.delete(String(tid));
module.exports.isEnabled     = (tid) => !disabledThreads.has(String(tid));
