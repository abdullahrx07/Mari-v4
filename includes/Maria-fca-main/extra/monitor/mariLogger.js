"use strict";

/**
 * mariLogger.js
 *
 * Shared `[ MARI -FCA ]` framed console logger. The frame is colored based on
 * the level while the message text stays uncolored, following the ANSI escape
 * code convention used in index.js and extra/connectionFrame.js.
 *
 * Used by the memory monitor (memoryUsage.js) and the duplicate-event guard
 * (eventGuard.js) so both print in a consistent style.
 */

const COLORS = {
    normal: '\x1b[92m', // bright green
    warn: '\x1b[93m',   // yellow
    over: '\x1b[91m',   // bright red (overload / over-capture)
    error: '\x1b[91m'   // bright red
};
const RESET = '\x1b[0m';
const FRAME = '[ MARI -FCA ]';

/**
 * Prints a `[ MARI -FCA ] <message>` line. Frame is colored per level,
 * message text is left uncolored.
 */
function log(message, level) {
    const color = COLORS[level] || COLORS.normal;
    console.log(color + FRAME + RESET + ' ' + message);
}

/**
 * Returns the current time formatted as `hh:mm:ss, d/m/yyyy`
 * (e.g. `12:05:02, 2/8/2024`).
 */
function timestamp() {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}, ${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;
}

/**
 * Logs a message prefixed with the current timestamp:
 * `[ MARI -FCA ] hh:mm:ss, d/m/yyyy - <message>`
 */
function logWithTime(message, level) {
    log(`${timestamp()} - ${message}`, level);
}

module.exports = {
    log,
    logWithTime,
    timestamp
};
