"use strict";

/**
 * cacheCleaner.js
 *
 * Standalone cache-clean system. Extracted out of the old
 * extra/memoryMonitor.js (which used to mix FCA/hosting memory-usage
 * tracking together with cache cleanup in a single file).
 *
 * extra/monitor/memoryUsage.js calls into this when memory usage gets high.
 */

const fs = require('fs');
const path = require('path');

/**
 * Searches and cleans cache folders.
 * Starts from current working directory recursively, looking for directories
 * that contain "cache" or "cach" in their name.
 * Ignores 'node_modules', '.git', etc.
 */
function findAndCleanCache() {
    const startDir = process.cwd();
    const ignoredDirs = ['node_modules', '.git', '.github', 'build'];
    const foundCaches = [];

    function searchDir(currentDir, depth = 0) {
        if (depth > 6) return; // Prevent infinite loops or extremely deep searches
        try {
            const files = fs.readdirSync(currentDir, { withFileTypes: true });
            for (const file of files) {
                if (file.isDirectory()) {
                    const dirName = file.name;
                    const fullPath = path.join(currentDir, dirName);

                    if (ignoredDirs.includes(dirName)) {
                        continue;
                    }

                    // Check if directory name contains "cache" or "cach" (case-insensitive)
                    if (/cach/i.test(dirName)) {
                        foundCaches.push(fullPath);
                    } else {
                        searchDir(fullPath, depth + 1);
                    }
                }
            }
        } catch (err) {
            // Silently ignore permission/access errors
        }
    }

    searchDir(startDir);

    if (foundCaches.length === 0) {
        console.log("\x1b[33m[CacheCleaner] No cache folder found to clean.\x1b[0m");
        return;
    }

    console.log(`\x1b[36m[CacheCleaner] Found ${foundCaches.length} cache directories. Cleaning files...\x1b[0m`);
    let deletedFilesCount = 0;
    let deletedDirsCount = 0;

    for (const cacheDir of foundCaches) {
        try {
            const files = fs.readdirSync(cacheDir);
            for (const file of files) {
                const filePath = path.join(cacheDir, file);
                const stat = fs.statSync(filePath);
                if (stat.isDirectory()) {
                    fs.rmSync(filePath, { recursive: true, force: true });
                    deletedDirsCount++;
                } else {
                    fs.unlinkSync(filePath);
                    deletedFilesCount++;
                }
            }
            console.log(`\x1b[32m[CacheCleaner] Cleaned directory: ${cacheDir}\x1b[0m`);
        } catch (err) {
            console.error(`\x1b[31m[CacheCleaner] Error cleaning directory ${cacheDir}: ${err.message}\x1b[0m`);
        }
    }

    console.log(`\x1b[32m[CacheCleaner] Cleanup completed. Removed ${deletedFilesCount} files and ${deletedDirsCount} folders.\x1b[0m`);
}

module.exports = {
    findAndCleanCache
};
