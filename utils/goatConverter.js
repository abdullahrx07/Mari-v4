/**
 * goatConverter.js
 * ----------------------------------------------------------------------
 * Auto-converts standard GoatBot V2 style command files (module.exports.config
 * + module.exports.onStart [+ onLoad / onReply]) into Mari-v3's native format
 * (module.exports.config + module.exports.run [+ onLoad / handleReply]).
 *
 * HOW TO USE:
 *  1. Drop unmodified GoatBot command .js files into the /modules/cmds folder
 *     (same folder name GoatBot V2 itself uses, so you can copy-paste a
 *     GoatBot project's commands folder straight in without renaming it).
 *  2. Either restart the bot (index.js auto-runs this on every boot) or run
 *     manually:   node utils/goatConverter.js
 *  3. Converted, ready-to-use files are written into /modules/commands so
 *     Mari-v3's normal loader in main.js picks them up like any other command.
 *
 * The converter never touches your original files in /modules/cmds — it only
 * ever overwrites files in /modules/commands that it generated itself
 * (tracked via the "AUTO-CONVERTED-FROM-GOAT" header). If a hand-written
 * command already exists under the same name, it will NOT be overwritten.
 * ----------------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");

const SRC_DIR = path.join(__dirname, "..", "modules", "cmds");
const OUT_DIR = path.join(__dirname, "..", "modules", "commands");
const MARK = "AUTO-CONVERTED-FROM-GOAT";

// Identifiers that get renamed 1:1 wherever they appear (param list + body).
// Mari-v3 exposes the exact same controller methods, just under these names.
const RENAME_MAP = {
  usersData: "Users",
  threadsData: "Threads",
  dashBoardData: "Currencies",
  role: "permssion",
};

// Identifiers GoatBot provides that Mari-v3's run()/handleReply() do NOT pass
// in automatically. We strip these out of the destructured params and instead
// inject a small polyfill at the top of the function body.
const POLYFILL_NAMES = ["message", "commandName", "client"];

/* ----------------------------- low level utils ----------------------------- */

// Returns the index of the character that matches the bracket at openIdx,
// skipping over string/template literals, comments, and (heuristically)
// regex literals so nested braces inside those don't throw off the count.
function matchBalanced(src, openIdx) {
  const pairs = { "{": "}", "(": ")", "[": "]" };
  const openChar = src[openIdx];
  const closeChar = pairs[openChar];
  if (!closeChar) return -1;

  let depth = 0;
  let i = openIdx;
  let prev = "";

  while (i < src.length) {
    const ch = src[i];

    if (ch === "/" && src[i + 1] === "/") {
      i += 2;
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      i++;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === "\\") i++;
        i++;
      }
      i++;
      prev = quote;
      continue;
    }
    if (ch === "/" && "(,=:[!&|?{;\n".includes(prev || "\n")) {
      let j = i + 1;
      let inClass = false;
      let ok = true;
      while (j < src.length) {
        if (src[j] === "\\") { j += 2; continue; }
        if (src[j] === "\n") { ok = false; break; }
        if (src[j] === "[") inClass = true;
        else if (src[j] === "]") inClass = false;
        else if (src[j] === "/" && !inClass) break;
        j++;
      }
      if (ok && j < src.length) {
        let k = j + 1;
        while (k < src.length && /[a-z]/i.test(src[k])) k++;
        i = k;
        prev = "/";
        continue;
      }
    }

    if (ch === openChar) depth++;
    else if (ch === closeChar) {
      depth--;
      if (depth === 0) return i;
    }
    if (!/\s/.test(ch)) prev = ch;
    i++;
  }
  return -1;
}

function skipWhitespace(src, idx) {
  while (idx < src.length && /\s/.test(src[idx])) idx++;
  return idx;
}

// Extracts the value following `module.exports.NAME =`. Supports:
//   - object literals:           { ... }
//   - function expressions:      [async] function (...) { ... }
//   - arrow functions:           [async] (...) => { ... }   or   => expr;
function extractAssignment(src, propName) {
  const re = new RegExp(`module\\.exports\\.${propName}\\s*=\\s*`, "g");
  const m = re.exec(src);
  if (!m) return null;

  const valueStart = skipWhitespace(src, m.index + m[0].length);
  const assignStart = m.index;

  if (src[valueStart] === "{") {
    const end = matchBalanced(src, valueStart);
    if (end === -1) return null;
    let stmtEnd = end + 1;
    if (src[stmtEnd] === ";") stmtEnd++;
    return { kind: "object", text: src.slice(valueStart, end + 1), assignStart, stmtEnd };
  }

  const rest = src.slice(valueStart);
  let fnMatch = /^(async\s+)?function\s*/.exec(rest);
  let cursor;
  let isAsync = false;
  let isFunctionKeyword = false;

  if (fnMatch) {
    isFunctionKeyword = true;
    isAsync = !!fnMatch[1];
    cursor = valueStart + fnMatch[0].length;
    cursor = skipWhitespace(src, cursor);
    if (src[cursor] !== "(") return null;
  } else {
    fnMatch = /^(async\s+)?\(/.exec(rest);
    if (!fnMatch) return null;
    isAsync = !!fnMatch[1];
    cursor = valueStart + fnMatch[0].length - 1;
  }

  const parenEnd = matchBalanced(src, cursor);
  if (parenEnd === -1) return null;
  const params = src.slice(cursor, parenEnd + 1);

  let after = skipWhitespace(src, parenEnd + 1);
  let body, stmtEnd;

  if (isFunctionKeyword) {
    // "function (...) { ... }" — body must be a block.
    if (src[after] !== "{") return null;
    const bodyEnd = matchBalanced(src, after);
    body = src.slice(after, bodyEnd + 1);
    stmtEnd = bodyEnd + 1;
  } else {
    // arrow form: "(...) => { ... }" or "(...) => expr"
    if (src.slice(after, after + 2) === "=>") {
      after = skipWhitespace(src, after + 2);
      if (src[after] === "{") {
        const bodyEnd = matchBalanced(src, after);
        body = src.slice(after, bodyEnd + 1);
        stmtEnd = bodyEnd + 1;
      } else {
        let depth0 = 0, j = after;
        while (j < src.length) {
          const c = src[j];
          if ("([{".includes(c)) depth0++;
          else if (")]}".includes(c)) { if (depth0 === 0) break; depth0--; }
          else if (c === ";" && depth0 === 0) break;
          j++;
        }
        body = `{ return ${src.slice(after, j)}; }`;
        stmtEnd = j;
      }
    } else if (src[after] === "{") {
      const bodyEnd = matchBalanced(src, after);
      body = src.slice(after, bodyEnd + 1);
      stmtEnd = bodyEnd + 1;
    } else return null;
  }

  if (src[stmtEnd] === ";") stmtEnd++;
  return { kind: "function", isAsync, params, body, assignStart, stmtEnd };
}

function renameIdentifiers(text, map) {
  for (const [from, to] of Object.entries(map)) {
    text = text.replace(new RegExp(`\\b${from}\\b`, "g"), to);
  }
  return text;
}

function pickLang(val) {
  if (val == null) return "";
  if (typeof val === "string") return val;
  if (typeof val === "object") {
    return val.en || val.vi || val.bn || Object.values(val)[0] || "";
  }
  return String(val);
}

/* ------------------------------ config mapping ------------------------------ */

function buildConfig(objText, fallbackName) {
  let cfg = null;
  try {
    cfg = new Function("return (" + objText + ")")();
  } catch (e) {
    cfg = null;
  }

  if (!cfg || typeof cfg !== "object") {
    // best-effort regex fallback if it couldn't be safely evaluated
    return {
      raw: renameIdentifiers(objText, {
        role: "hasPermssion",
        author: "credits",
        countDown: "cooldowns",
        category: "commandCategory",
      }),
    };
  }

  const name = cfg.name || fallbackName;
  const hasPermssion = typeof cfg.role === "number" ? cfg.role : (cfg.hasPermssion ?? 0);
  const credits = cfg.author || cfg.credits || "Unknown";
  const description = pickLang(cfg.shortDescription) || pickLang(cfg.longDescription) || cfg.description || "";
  const commandCategory = cfg.category || cfg.commandCategory || "Goat";
  let usages = pickLang(cfg.guide) || cfg.usages || "";
  usages = usages.replace(/\{pn\}/gi, "").replace(/\{n\}/gi, name).trim();
  const cooldowns = cfg.countDown ?? cfg.cooldowns ?? 1;
  const aliases = Array.isArray(cfg.aliases) ? cfg.aliases : [];

  const out = {
    name,
    version: cfg.version || "1.0.0",
    hasPermssion,
    credits,
    description,
    commandCategory,
    usages,
    cooldowns,
  };
  if (aliases.length) out.aliases = aliases;
  if (cfg.dependencies) out.dependencies = cfg.dependencies;
  if (cfg.envConfig) out.envConfig = cfg.envConfig;

  return { built: out };
}

/* ------------------------------ function mapping ----------------------------- */

function cleanParams(paramsText) {
  const inner = paramsText.slice(1, -1); // strip outer ( )
  const braceStart = inner.indexOf("{");
  if (braceStart === -1) return { params: paramsText, found: [] };
  const braceEndRel = matchBalanced(inner, braceStart);
  const before = inner.slice(0, braceStart);
  const objInner = inner.slice(braceStart + 1, braceEndRel);
  const after = inner.slice(braceEndRel + 1);

  const items = [];
  let depth = 0, last = 0;
  for (let i = 0; i < objInner.length; i++) {
    const c = objInner[i];
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    else if (c === "," && depth === 0) {
      items.push(objInner.slice(last, i));
      last = i + 1;
    }
  }
  items.push(objInner.slice(last));

  const found = [];
  const kept = [];
  const keptNames = new Set();
  for (const raw of items) {
    const item = raw.trim();
    if (!item) continue;
    const baseName = item.split(/[:=]/)[0].trim();
    if (POLYFILL_NAMES.includes(baseName)) {
      found.push(baseName);
      continue;
    }
    kept.push(renameIdentifiers(item, RENAME_MAP));
    keptNames.add(baseName);
  }

  // api/event are needed by the message{} polyfill and by virtually every
  // command body — make sure they're always available even if the original
  // GoatBot file only destructured `message` and never touched `api` directly.
  if (!keptNames.has("api")) kept.unshift("api");
  if (!keptNames.has("event")) kept.unshift("event");

  const params = "(" + before + "{ " + kept.join(", ") + " }" + after + ")";
  return { params, found };
}

function injectPrelude(body, found, cfgName) {
  if (!found.length) return body;
  const lines = [];
  if (found.includes("message")) {
    lines.push(
      "const { normalizeGoatMessage: __normGoatMsg } = require(" + JSON.stringify(require("path").join(__dirname, "goatCompat.js")) + ");",
      "const message = { reply: (m, cb) => api.sendMessage(__normGoatMsg(m), event.threadID, cb, event.messageID), send: (m, cb) => api.sendMessage(__normGoatMsg(m), event.threadID, cb), unsend: (id) => api.unsendMessage(id), react: (icon, msgID) => api.setMessageReaction(icon, msgID || event.messageID, () => {}, true) };"
    );
  }
  if (found.includes("commandName")) {
    lines.push(`const commandName = ${JSON.stringify(cfgName)};`);
  }
  if (found.includes("client")) {
    lines.push("const client = global.client;");
  }
  const innerStart = body.indexOf("{") + 1;
  return body.slice(0, innerStart) + "\n  " + lines.join("\n  ") + "\n" + body.slice(innerStart);
}

function convertFunction(fn, cfgName) {
  const { params, found } = cleanParams(fn.params);
  let body = renameIdentifiers(fn.body, RENAME_MAP);
  body = injectPrelude(body, found, cfgName);
  return `${fn.isAsync ? "async " : ""}function ${params} ${body}`;
}

/* --------------------------------- main driver -------------------------------- */

function convertSource(src, fallbackName) {
  const warnings = [];

  const configAssign = extractAssignment(src, "config");
  const onStartAssign = extractAssignment(src, "onStart");
  const onLoadAssign = extractAssignment(src, "onLoad");
  const onReplyAssign = extractAssignment(src, "onReply");
  const onReactionAssign = extractAssignment(src, "onReaction");

  if (!configAssign || !onStartAssign) {
    return { error: "Could not find module.exports.config and module.exports.onStart in this file — it may not be a standard GoatBot command, so it was skipped." };
  }

  const { built, raw } = buildConfig(configAssign.text, fallbackName);
  const cfgName = built ? built.name : fallbackName;

  const parts = [];
  parts.push(`/**\n * ${MARK}\n * Source file: modules/cmds/${fallbackName}.js\n * Converted: ${new Date().toISOString()}\n * Do NOT edit this file directly — edit the original in /modules/cmds\n * and re-run the converter (or just restart the bot) to regenerate it.\n */\n`);

  if (built) {
    parts.push(`module.exports.config = ${JSON.stringify(built, null, 2)};\n`);
  } else {
    parts.push(`module.exports.config = ${raw};\n`);
    warnings.push("config object couldn't be auto-evaluated; renamed known fields with best-effort text replace — please double check it.");
  }

  const runFn = convertFunction(onStartAssign, cfgName);
  parts.push(`module.exports.run = ${runFn};\n`);

  if (onLoadAssign && onLoadAssign.kind === "function") {
    const onLoadFn = convertFunction(onLoadAssign, cfgName);
    parts.push(`module.exports.onLoad = ${onLoadFn};\n`);
  }

  if (onReplyAssign && onReplyAssign.kind === "function") {
    const replyFn = convertFunction(onReplyAssign, cfgName);
    parts.push(`module.exports.handleReply = ${replyFn};\n`);
  }

  if (onReactionAssign) {
    warnings.push("This command also defines onReaction — Mari-v3 does not currently support reaction handlers, so it was left out of the conversion.");
  }

  return { code: parts.join("\n"), warnings, name: cfgName };
}

function convertAll(logger) {
  const log = logger || console.log;
  if (!fs.existsSync(SRC_DIR)) {
    fs.mkdirSync(SRC_DIR, { recursive: true });
  }
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const files = fs.readdirSync(SRC_DIR).filter(f => f.endsWith(".js"));
  if (!files.length) return { converted: 0, skipped: 0, failed: 0 };

  let converted = 0, skipped = 0, failed = 0;

  for (const file of files) {
    const fallbackName = file.replace(/\.js$/, "");
    const srcPath = path.join(SRC_DIR, file);
    const destPath = path.join(OUT_DIR, file);

    try {
      const src = fs.readFileSync(srcPath, "utf8");
      const result = convertSource(src, fallbackName);

      if (result.error) {
        log(`[goatConverter] ⚠ ${file}: ${result.error}`);
        failed++;
        continue;
      }

      if (fs.existsSync(destPath)) {
        const existing = fs.readFileSync(destPath, "utf8");
        if (!existing.includes(MARK)) {
          log(`[goatConverter] ⏭ ${file}: a non-converted command with this name already exists in modules/commands, skipping so it isn't overwritten.`);
          skipped++;
          continue;
        }
      }

      fs.writeFileSync(destPath, result.code, "utf8");
      converted++;
      log(`[goatConverter] ✅ converted "${result.name}" -> modules/commands/${file}`);
      for (const w of result.warnings) log(`[goatConverter]    ↳ note: ${w}`);
    } catch (err) {
      log(`[goatConverter] ❌ ${file}: ${err.message}`);
      failed++;
    }
  }

  return { converted, skipped, failed };
}

module.exports = { convertAll, convertSource };

if (require.main === module) {
  const summary = convertAll();
  console.log(`[goatConverter] done — converted: ${summary.converted}, skipped: ${summary.skipped}, failed: ${summary.failed}`);
}
