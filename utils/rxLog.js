'use strict';

const chalk   = require('chalk');
const gradient = require('gradient-string');

const PREFIX = '[MARi-boT]';

// gradient color theme for the prefix label
const _grd = gradient('#0066ff', '#00ccff', '#0066ff');
const _grdSuccess = gradient('#00cc66', '#00ff99');
const _grdWarn = gradient('#ffaa00', '#ffdd00');

function _tag(tag, color) {
  const label = tag ? `${PREFIX} ${tag}` : PREFIX;
  if (color === 'success') return chalk.bold(_grdSuccess(label));
  if (color === 'warn')    return chalk.bold(_grdWarn(label));
  if (color === 'error')   return chalk.bold(chalk.red(label));
  return chalk.bold(_grd(label));
}

const rxLog = {
  /**
   * General info log
   * rxLog.info('message', '[ TAG ]')
   */
  info(msg, tag = '') {
    console.log(`${_tag(tag)} ${chalk.white(msg)}`);
  },

  /**
   * Success (green) log
   */
  success(msg, tag = '') {
    console.log(`${_tag(tag, 'success')} ${chalk.greenBright(msg)}`);
  },

  /**
   * Warning (yellow) log
   */
  warn(msg, tag = '') {
    console.log(`${_tag(tag, 'warn')} ${chalk.yellow(msg)}`);
  },

  /**
   * Error (red) log
   */
  error(msg, tag = '') {
    console.log(`${_tag(tag, 'error')} ${chalk.red(msg)}`);
  },

  /**
   * Database sync log — thread upload হলে এটা call হবে
   * rxLog.thread('TID', threadName, memberCount)
   */
  thread(threadID, threadName, memberCount, isE2EE = false) {
    const label = isE2EE ? '〘 E2EE-THREAD 〙' : '〘 THREAD-DB 〙';
    const typeTag = isE2EE
      ? chalk.magenta('[E2EE]')
      : chalk.cyan('[NORMAL]');
    console.log(
      `${_tag(label, 'success')} ${typeTag} ` +
      `${chalk.bold(chalk.white(threadName || threadID))} ` +
      chalk.dim(`│ TID: ${threadID} │ Members: ${memberCount}`)
    );
  },

  /**
   * User info log — user-name | user-id সুন্দরভাবে দেখাবে
   * rxLog.user(uid, name)
   */
  user(uid, name) {
    console.log(
      `${_tag('〘 USER-DB 〙', 'success')} ` +
      `${chalk.bold(chalk.white(name || 'Unknown'))} ` +
      chalk.dim(`│ ID: ${chalk.yellow(uid)}`)
    );
  },

  /**
   * Cookie freshness log
   * rxLog.cookie(isValid, expiresAt)
   */
  cookie(isValid, detail = '') {
    if (isValid) {
      console.log(
        `${_tag('〘 COOKIE 〙', 'success')} ${chalk.greenBright('✓ Cookie fresh')} ${chalk.dim(detail)}`
      );
    } else {
      console.log(
        `${_tag('〘 COOKIE 〙', 'warn')} ${chalk.yellow('⚠ Cookie expired or expiring soon!')} ${chalk.dim(detail)}`
      );
    }
  },

  /**
   * E2EE mentions proxy log — proxy কখন kick in করলো
   */
  mentionsProxy(threadID, memberCount) {
    console.log(
      `${_tag('〘 MENTIONS-PROXY 〙')} ` +
      chalk.cyan(`E2EE thread ${chalk.dim(threadID)} — `) +
      chalk.greenBright(`proxy filled ${memberCount} mentions`)
    );
  },

  /**
   * Real-time event capture logging with percentage activity rating
   */
  capture(event, count10s) {
    const rate = Math.min(100, Math.round((count10s / 5) * 100));
    const isHigh = count10s > 5;
    const tag = isHigh ? '〘 HIGH-CAPTURE 〙' : '〘 NORMAL-CAPTURE 〙';
    const color = isHigh ? 'warn' : 'success';

    let details = `Type: ${event.type || 'unknown'}`;
    if (event.threadID) details += ` │ TID: ${event.threadID}`;
    if (event.senderID) details += ` │ Sender: ${event.senderID}`;
    if (event.body) {
      const cleanBody = String(event.body).replace(/\n/g, ' ').substring(0, 50);
      details += ` │ Body: "${cleanBody}${cleanBody.length >= 50 ? '...' : ''}"`;
    }

    const label = `${PREFIX} ${tag}`;
    const formattedLabel = isHigh ? chalk.bold(_grdWarn(label)) : chalk.bold(_grdSuccess(label));

    console.log(`${formattedLabel} ${chalk.cyan(`[Rate: ${rate}%]`)} ${chalk.white(details)}`);
  },

  /**
   * Real-time bug/error logging
   */
  bug(err, context = '') {
    const label = `${PREFIX} 〘 BUG/ERROR 〙`;
    const formattedLabel = chalk.bold(chalk.red(label));
    const msg = err && err.stack ? err.stack : (err && err.message ? err.message : String(err));
    console.log(`${formattedLabel} ${chalk.red(`[Context: ${context}]`)} ${chalk.yellow(msg)}`);
  },

  /**
   * System log
   */
  system(msg, tag = '〘 SYSTEM-LOG 〙') {
    console.log(`${_tag(tag)} ${chalk.yellowBright(msg)}`);
  },

  /**
   * Divider / banner line
   */
  divider(text = '') {
    const line = '━'.repeat(32);
    if (text) {
      console.log(chalk.bold(_grd(`${PREFIX} ┌${line}┐`)));
      console.log(chalk.bold(_grd(`${PREFIX} │  ${text.padEnd(30)} │`)));
      console.log(chalk.bold(_grd(`${PREFIX} └${line}┘`)));
    } else {
      console.log(chalk.dim(`${PREFIX} ${'─'.repeat(40)}`));
    }
  },
};

module.exports = rxLog;
