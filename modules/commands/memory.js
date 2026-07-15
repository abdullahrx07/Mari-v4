// ============================================================
// JARVIS — Memory Command  (!memory / !mem)
// View or clear JARVIS's memory about you
// ============================================================

const MemorySystem = require('../../includes/brain/MemorySystem');
const { clearHistory } = require('../../includes/brain/AIBrain');

module.exports.config = {
  name: 'memory',
  version: '1.0.0',
  hasPermssion: 0,
  credits: 'rX Abdullah × JARVIS Brain',
  description: 'View or clear what JARVIS remembers about you',
  commandCategory: 'AI',
  usages: 'memory [view|clear]',
  cooldowns: 5,
  aliases: ['mem', 'jmem'],
};

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID, senderID } = event;
  const sub = (args[0] || 'view').toLowerCase();
  const mem = new MemorySystem(senderID);

  if (sub === 'clear' || sub === 'reset') {
    clearHistory(senderID);
    // Clear from SQLite
    try {
      const db = mem._getDB();
      if (db) db.prepare('DELETE FROM jarvis_memory WHERE userId=?').run(String(senderID));
      mem._invalidateCache();
    } catch (_) {}
    return api.sendMessage('🗑️ All memory about you has been cleared. Starting fresh!', threadID, messageID);
  }

  // View memories
  const memories = mem.retrieve({ limit: 15, minImportance: 1 });

  if (!memories.length) {
    return api.sendMessage(
      '🧠 JARVIS Memory\n━━━━━━━━━━━━━━━\nNothing stored about you yet!\n\nJust chat naturally — I\'ll remember things you mention (name, location, interests, etc.)',
      threadID, messageID
    );
  }

  const lines = memories.map(m => `• [${m.type}] ${m.key_}: ${m.value}`).join('\n');
  const msg = `🧠 JARVIS Memory for you\n━━━━━━━━━━━━━━━━━━━━━━━\n${lines}\n\nUse !memory clear to wipe all memories.`;

  return api.sendMessage(msg, threadID, messageID);
};
