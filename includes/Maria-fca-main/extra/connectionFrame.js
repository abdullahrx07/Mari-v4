"use strict";

/**
 * connectionFrame.js
 *
 * Standalone console "frame" system for the connect sequence:
 *   1) MQTT spinner (shows region while connecting)
 *   2) MQTT connected banner (region + auto-reconnect status)
 *   3) E2EE bridge connecting / connected / error frames
 *
 * This used to be scattered inline inside plugins/listenMqtt.js (ANSI colour
 * table + spinner + banner + raw process.stdout.write calls for the E2EE
 * bridge all mixed into the MQTT connect handler). It's not an FB api
 * endpoint and it's not e2ee-specific logic either — it's a plain local
 * utility, so it lives in extra/ next to extra/monitor/ and antiSuspension.js.
 *
 * listenMqtt.js requires this and calls the exported functions instead of
 * building ANSI strings inline.
 */

// ─── ANSI colour helpers ───────────────────────────────────────────────────────
const C = {
    reset:   '\x1b[0m',
    bold:    '\x1b[1m',
    dim:     '\x1b[2m',
    // foregrounds
    black:   '\x1b[30m',
    red:     '\x1b[31m',
    green:   '\x1b[32m',
    yellow:  '\x1b[33m',
    blue:    '\x1b[34m',
    magenta: '\x1b[35m',
    cyan:    '\x1b[36m',
    white:   '\x1b[37m',
    // bright foregrounds
    bBlack:   '\x1b[90m',
    bRed:     '\x1b[91m',
    bGreen:   '\x1b[92m',
    bYellow:  '\x1b[93m',
    bBlue:    '\x1b[94m',
    bMagenta: '\x1b[95m',
    bCyan:    '\x1b[96m',
    bWhite:   '\x1b[97m',
    // backgrounds
    bgBlue:    '\x1b[44m',
    bgCyan:    '\x1b[46m',
    bgMagenta: '\x1b[45m',
    bgGreen:   '\x1b[42m',
    bgBlack:   '\x1b[40m',
};

// ─── Brand banner (printed once, not animated — safe for non-TTY log viewers
// like Railway, which render every process.stdout.write('\r...') as its own
// line instead of overwriting in place) ─────────────────────────────────────
const BANNER = [
    '███████╗ ██████╗ █████╗     ███╗   ███╗ █████╗ ██████╗ ██╗',
    '██╔════╝██╔════╝██╔══██╗    ████╗ ████║██╔══██╗██╔══██╗██║',
    '█████╗  ██║     ███████║    ██╔████╔██║███████║██████╔╝██║',
    '██╔══╝  ██║     ██╔══██║    ██║╚██╔╝██║██╔══██║██╔══██╗██║',
    '██║     ╚██████╗██║  ██║    ██║ ╚═╝ ██║██║  ██║██║  ██║██║',
    '╚═╝      ╚═════╝╚═╝  ╚═╝    ╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝',
].join('\n');

function printBanner() {
    process.stdout.write('\n' + C.bGreen + BANNER + C.reset + '\n');
}

// ─── Generic bordered "frame" box drawer ───────────────────────────────────────
function stripAnsi(s) {
    return s.replace(/\x1b\[[0-9;]*m/g, '');
}

function visLen(s) {
    const stripped = stripAnsi(s);
    let len = 0;
    for (const ch of stripped) {
        len += ch.codePointAt(0) > 0x1F000 ? 2 : 1;
    }
    return len;
}

function frame(lines, borderClr) {
    borderClr = borderClr || C.green;
    const padX = 2;
    const contentW = Math.max.apply(null, lines.map(visLen));
    const innerW = contentW + padX * 2;

    const top = borderClr + '┌' + '─'.repeat(innerW) + '┐' + C.reset;
    const bottom = borderClr + '└' + '─'.repeat(innerW) + '┘' + C.reset;

    const body = lines.map(function (line) {
        const fill = ' '.repeat(Math.max(contentW - visLen(line), 0));
        return borderClr + '│' + C.reset +
            ' '.repeat(padX) + line + fill + ' '.repeat(padX) +
            borderClr + '│' + C.reset;
    });

    return [top].concat(body).concat([bottom]).join('\n');
}

// ─── Frame 1: FCA / MQTT connecting (single static frame, no spinner) ─────────
let _bannerPrinted = false;

function startMqttSpinner(region) {
    if (!_bannerPrinted) {
        printBanner();
        _bannerPrinted = true;
    }
    const regionStr = region ? (' ' + C.dim + C.green + '[' + region.toUpperCase() + ']' + C.reset) : '';
    console.log('\n' + frame([
        C.bold + C.green + '•' + C.reset + '  ' +
        C.green + 'FCA' + C.reset + ' ' +
        C.dim + 'connecting to MQTT' + C.reset +
        regionStr + C.dim + ' ...' + C.reset
    ]));
}

function stopMqttSpinner() {
    // no-op: kept so existing call sites don't need to change.
    // (there is no animated spinner to stop anymore)
}

// ─── Frame 2: MQTT connected (region + auto-reconnect status) ─────────────────
function printMqttBanner(region, autoReconnect) {
    stopMqttSpinner();

    const regionVal = (region || '').toUpperCase();
    const reconnTxt = autoReconnect ? 'Enabled (3s)' : 'Disabled';

    console.log('\n' + frame([
        C.bold + C.bGreen + '✔  MQTT Connected' + C.reset,
        '',
        C.bold + C.green + 'Region          ' + C.reset + C.bGreen + regionVal + C.reset,
        C.bold + C.green + 'Auto-reconnect  ' + C.reset + C.bGreen + reconnTxt + C.reset,
        '',
        C.bold + C.bGreen + 'Now listening for messages' + C.reset,
    ]) + '\n');
}

// ─── Frame 3: E2EE bridge status (connecting / connected / error) ─────────────
function printE2EEConnecting() {
    console.log('\n' + frame([
        C.green + 'E2EE Bridge' + C.reset + C.dim + ' connecting...' + C.reset
    ]));
}

function printE2EEConnected() {
    console.log(frame([
        C.bold + C.bGreen + '✔  E2EE Bridge connected' + C.reset
    ]) + '\n');
}

function printE2EEError(prefix, err) {
    console.log(frame([
        C.bold + C.red + '✕  ' + prefix + C.reset,
        C.dim + (err && err.message ? err.message : String(err)) + C.reset
    ], C.red) + '\n');
}

// ─── Frame 4: auto-reconnect sequence (drop → session refresh → reconnect) ────
function printConnectionDropped(reason) {
    console.log('\n' + frame([
        C.bold + C.green + '•  Connection dropped' + C.reset +
            C.dim + ' (' + reason + ')' + C.reset,
        C.dim + 'Reconnecting...' + C.reset
    ]));
}

function printSessionRefreshing() {
    console.log(frame([
        C.green + 'Refreshing session before reconnect...' + C.reset
    ]));
}

function printRetrying(attempt, max, delayMs, reason) {
    console.log('\n' + frame([
        C.bold + C.green + '•  Reconnect attempt ' + attempt + '/' + max + C.reset,
        C.dim + reason + C.reset,
        C.dim + 'Retrying in ' + Math.round(delayMs / 1000) + 's...' + C.reset
    ]));
}

function printPersistentRetry(delayMs) {
    console.log('\n' + frame([
        C.bold + C.green + '•  Max retries reached' + C.reset,
        C.dim + 'Persistent auto-reconnect active' + C.reset,
        C.dim + 'Retrying in ' + Math.round(delayMs / 1000) + 's...' + C.reset
    ]));
}

function printReconnectError(prefix, err) {
    console.log(frame([
        C.bold + C.red + '✕  ' + prefix + C.reset,
        C.dim + (err && err.message ? err.message : String(err)) + C.reset
    ], C.red) + '\n');
}

module.exports = {
    C,
    startMqttSpinner,
    stopMqttSpinner,
    printMqttBanner,
    printE2EEConnecting,
    printE2EEConnected,
    printE2EEError,
    printConnectionDropped,
    printSessionRefreshing,
    printReconnectError,
    printRetrying,
    printPersistentRetry,
};
