// ============================================================
// JARVIS — AI Toggle  (!aitoggle / !jarvison / !jarvisoff)
// ============================================================
module.exports.config = {
  name: 'aitoggle',
  version: '1.0.0',
  hasPermssion: 1,
  credits: 'rX Abdullah × JARVIS Brain',
  description: 'Toggle JARVIS auto-AI on/off for this thread',
  commandCategory: 'AI',
  usages: 'aitoggle [on|off]',
  cooldowns: 5,
  aliases: ['jarvison', 'jarvisoff', 'aimode'],
};

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID } = event;
  let autoAI;
  try { autoAI = require('./jarvisAutoAI'); }
  catch (e) { return api.sendMessage('❌ JARVIS AutoAI module not found.', threadID, messageID); }

  const arg = (args[0] || '').toLowerCase();
  const isOn = autoAI.isEnabled(threadID);

  if (arg === 'on')  { autoAI.enableThread(threadID);  return api.sendMessage('✅ JARVIS Auto-AI → ON\nI\'ll respond to messages that mention me!', threadID, messageID); }
  if (arg === 'off') { autoAI.disableThread(threadID); return api.sendMessage('🔴 JARVIS Auto-AI → OFF\nUse !jarvis [message] for manual AI chat.', threadID, messageID); }

  // Toggle
  if (isOn) { autoAI.disableThread(threadID); return api.sendMessage('🔴 JARVIS Auto-AI toggled → OFF', threadID, messageID); }
  else       { autoAI.enableThread(threadID);  return api.sendMessage('✅ JARVIS Auto-AI toggled → ON', threadID, messageID); }
};
