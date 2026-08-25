/* postinstall patch for @rxabdullah/xdi-fca
 *
 * The library's premium check loads plugins and then requires
 * `api[name]` to be truthy for every plugin file. Two plugins
 * (note.js, threadColors.js) attach objects instead of functions,
 * so the strict check never passes and Premium never unlocks.
 *
 * This script relaxes that exact expression in-place so Premium
 * unlocks after normal plugin load. Idempotent: no-ops when already
 * patched, warns only when the expected snippet is missing.
 */
const fs = require("fs");
const path = require("path");

let file;
try {
    file = require.resolve("@rxabdullah/xdi-fca/index.js");
} catch {
    console.log("patch-fca: @rxabdullah/xdi-fca not installed yet, skipping");
    process.exit(0);
}

const ORIGINAL = "loaded.every(name => typeof api[name] === 'function');";
const PATCHED = "loaded.every(name => api[name] !== undefined && api[name] !== null);";

let src = fs.readFileSync(file, "utf8");
if (src.includes(PATCHED)) {
    console.log("patch-fca: already applied");
    process.exit(0);
}
if (!src.includes(ORIGINAL)) {
    console.warn("patch-fca: premium check snippet not found (library update?), skipping");
    process.exit(0);
}
src = src.replace(ORIGINAL, PATCHED);
fs.writeFileSync(file, src);
console.log("patch-fca: premium plugin-count check relaxed in " + path.relative(process.cwd(), file));
