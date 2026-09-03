"use strict";
// ── Smoke test: checks index.js loads clean + Language keys resolve ──
// Run: node smoke-test.js   (inside the Test/ folder, after npm install)

const fs = require('fs');
const path = require('path');

let fail = 0;
function check(label, cond) {
    console.log((cond ? '✅ PASS - ' : '❌ FAIL - ') + label);
    if (!cond) fail++;
}

// 1) config.json must have "language"
let cfg = null;
try { cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'))); } catch (_) { }
check('config.json exists and is valid JSON', !!cfg);
check('config.json has "language" key', !!(cfg && cfg.language));

// 2) Language/index.json must exist, valid JSON, have en + matching config language
let lang = null;
try { lang = require('./Language/index.json'); } catch (_) { }
check('Language/index.json exists and is valid JSON', Array.isArray(lang));
check('Language/index.json has "en" block', !!(lang && lang.find(l => l.Language === 'en')));
check(
    'Language/index.json has block for config language ("' + (cfg && cfg.language) + '")',
    !!(lang && cfg && lang.find(l => l.Language === cfg.language))
);

// 3) index.js must load without crashing (module.exports should be the login function)
let login = null;
try { login = require('./index.js'); } catch (e) {
    console.log('❌ index.js require crashed:', e.message);
}
check('index.js loads without crashing', typeof login === 'function');

// 4) Every key used in index.js via getLang("...") must exist in every language block
const indexSrc = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
const usedKeys = [...indexSrc.matchAll(/getLang\(\s*["']([A-Za-z0-9_]+)["']/g)].map(m => m[1]);
const uniqueKeys = [...new Set(usedKeys)];
if (lang) {
    lang.forEach(block => {
        const missing = uniqueKeys.filter(k => !(block.Folder && block.Folder.Index && block.Folder.Index[k]));
        check('All getLang() keys exist in "' + block.Language + '" block', missing.length === 0);
        if (missing.length) console.log('   missing:', missing.join(', '));
    });
}

console.log('\n' + (fail === 0 ? '🎉 ALL CHECKS PASSED' : '⚠️  ' + fail + ' CHECK(S) FAILED'));
process.exit(fail === 0 ? 0 : 1);
