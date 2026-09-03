"use strict";

const log = require("npmlog");

const C = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    bGreen: '\x1b[92m',
    bCyan: '\x1b[96m',
    bMagenta: '\x1b[95m',
    bYellow: '\x1b[93m',
    bBlue: '\x1b[94m',
    bWhite: '\x1b[97m',
    bgMagenta: '\x1b[45m',
    white: '\x1b[37m',
};

function mentionsProxy(threadID, count) {
    console.log(
        C.bold + C.bgMagenta + C.white + ' 🔒 rx-fca ' + C.reset + ' ' +
        C.bCyan + 'Mentions Proxy' + C.reset + ' Patched E2EE mentions for thread ' +
        C.bYellow + threadID + C.reset + ' (' + C.bold + count + C.reset + ' match(es))'
    );
}

module.exports = {
    mentionsProxy
};
