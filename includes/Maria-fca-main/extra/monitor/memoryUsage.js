"use strict";

/**
 * memoryUsage.js
 *
 * Standalone FCA/hosting memory-usage (%) tracking system. Extracted out of
 * the old extra/memoryMonitor.js (which used to mix this together with the
 * cache-clean system in a single file). Cache cleanup now lives separately
 * in extra/monitor/cacheCleaner.js and is only called from here when usage
 * gets too high.
 *
 * This is a standalone utility, not an api endpoint, so it's not auto-loaded
 * by buildAPI()'s plugins/ loop. index.js requires it directly:
 * require('./extra/monitor/memoryUsage').
 */

const v8 = require('v8');
const os = require('os');
const { findAndCleanCache } = require('./cacheCleaner');
const mariLogger = require('./mariLogger');

/**
 * Calculates current FCA heap memory usage percentage.
 */
function getFcaMemoryUsage() {
    const memory = process.memoryUsage();
    const heapStats = v8.getHeapStatistics();
    const heapLimit = heapStats.heap_size_limit;
    const usagePercent = (memory.heapUsed / heapLimit) * 100;
    return {
        used: memory.heapUsed,
        limit: heapLimit,
        percent: parseFloat(usagePercent.toFixed(2))
    };
}

/**
 * Calculates current system/hosting memory load percentage.
 */
function getHostingMemoryLoad() {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    const usagePercent = (used / total) * 100;
    return {
        used: used,
        total: total,
        percent: parseFloat(usagePercent.toFixed(2))
    };
}

/**
 * Prints memory status with the shared `[ MARI -FCA ]` frame:
 * `[ MARI -FCA ] hh:mm:ss, d/m/yyyy - Memory usage: X.XX% | FCA Heap: X.XX% | Hosting: X.XX%`
 * Frame is green while usage is normal, bright red once FCA heap or hosting
 * load reaches 90%, and cache cleanup (cacheCleaner.js) is triggered then.
 */
function reportMemoryStatus() {
    const fca = getFcaMemoryUsage();
    const hosting = getHostingMemoryLoad();
    const overloaded = fca.percent >= 90 || hosting.percent >= 90;

    mariLogger.logWithTime(
        `Memory usage: ${fca.percent}% | FCA Heap: ${fca.percent}% | Hosting: ${hosting.percent}%`,
        overloaded ? 'over' : 'normal'
    );

    if (overloaded) {
        mariLogger.log(`Warning: Memory usage is over 90%! (FCA: ${fca.percent}%, Hosting: ${hosting.percent}%)`, 'over');
        mariLogger.log('Initiating chatbot cache cleanup...', 'over');
        findAndCleanCache();
    }
}

/**
 * Starts periodic background checking
 */
function startMonitoring(intervalMs = 60 * 1000) {
    // Initial report
    reportMemoryStatus();

    const intervalId = setInterval(() => {
        reportMemoryStatus();
    }, intervalMs);

    if (intervalId && typeof intervalId.unref === 'function') {
        intervalId.unref();
    }

    return intervalId;
}

module.exports = function (defaultFuncs, api, ctx) {
    return {
        getFcaMemoryUsage,
        getHostingMemoryLoad,
        reportMemoryStatus,
        startMonitoring
    };
};
