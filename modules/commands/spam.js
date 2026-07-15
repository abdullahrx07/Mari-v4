module.exports.config = {
  name: "spam",
  version: "1.2.0",
  hasPermssion: 2,
  credits: "rX",
  description: "Start/stop spam messages in a thread. Usage: !spam <number> <custom message> | !spam off",
  commandCategory: "utility",
  usages: "!spam <number> <custom message> | !spam off",
  cooldowns: 5
};

if (typeof global._spamIntervals === 'undefined') global._spamIntervals = new Map();

module.exports.run = async ({ api, event, args }) => {
  const threadID = event.threadID;
  const senderID = event.senderID;

  const subcmd = (args[0] || '').toLowerCase();

  if (subcmd === 'off') {
    const intervalId = global._spamIntervals.get(threadID);
    if (!intervalId) return api.sendMessage('No active spam in this thread.', threadID);

    clearInterval(intervalId);
    global._spamIntervals.delete(threadID);
    return api.sendMessage('⏹️ Spam stopped by ' + senderID + '.', threadID);
  }

  if (args.length === 0) {
    return api.sendMessage('Usage: !spam <number> <custom message> | !spam off', threadID);
  }

  const amount = parseInt(args[0]);
  const message = args.slice(1).join(' ');

  if (isNaN(amount) || !message) {
    return api.sendMessage('Usage: !spam <number> <custom message> | !spam off', threadID);
  }

  const maxCount = Math.min(amount, 500);

  if (global._spamIntervals.has(threadID)) {
    return api.sendMessage('Spam already running in this thread. Use: !spam off to stop.', threadID);
  }

  let count = 0;
  const intervalMs = 500;

  api.sendMessage(`✅ Spam started by ${senderID}. Sending ${maxCount} messages (every ${intervalMs}ms). Use "!spam off" to stop early.`, threadID);

  const intervalId = setInterval(async () => {
    try {
      if (count >= maxCount) {
        clearInterval(intervalId);
        global._spamIntervals.delete(threadID);
        return api.sendMessage('🔔 Spam finished (sent ' + count + ' messages).', threadID);
      }

      const text = message + (count % 2 === 0 ? '' : ' ♡');
      await api.sendMessage(text, threadID);
      count += 1;
    } catch (err) {
      clearInterval(intervalId);
      global._spamIntervals.delete(threadID);
      api.sendMessage('❗ Stopped spam because of an error: ' + err.message, threadID);
    }
  }, intervalMs);

  global._spamIntervals.set(threadID, intervalId);
};
