/**
 * goatCompat.js
 * ----------------------------------------------------------------------
 * Runtime compatibility shim — lets GoatBot V2 command files sit in the
 * exact SAME /modules/commands folder as native Mari-v3 commands and just
 * work. No separate /modules/cmds folder, no conversion step, no extra
 * files written to disk — everything happens in memory at require() time.
 *
 * HOW IT'S WIRED UP:
 *   main.js's command loader calls:
 *     const raw = require(filePath);
 *     const module = goatCompat.normalize(raw, filename);
 *   right after require()-ing each file. The same is true for the
 *   `install` command's hot-reload path (modules/commands/cmdinstall.js).
 *
 * DETECTION:
 *   - Has `.run` already            -> native Mari-v3 command, untouched.
 *   - Has `.onStart`, no `.run`     -> GoatBot V2 command, gets wrapped.
 *   - Neither                       -> returned as-is; the loader's own
 *                                       `!module.config || !module.run`
 *                                       check will reject it like before.
 *
 * This works regardless of whether the GoatBot file was written as
 *   module.exports.config = {...};  module.exports.onStart = function(){};
 * (split assignments) or
 *   module.exports = { config: {...}, onStart() {} };
 * (single object literal) — both produce the identical shape once
 * require() has evaluated the file, since we operate on the already
 *-resolved module object, not its source text.
 *
 * MAPPINGS:
 *   Functions : onStart -> run, onReply -> handleReply,
 *               onReaction -> handleReaction, onLoad stays onLoad.
 *   Config    : category -> commandCategory, role -> hasPermssion,
 *               author -> credits, countDown -> cooldowns,
 *               shortDescription/longDescription -> description,
 *               guide -> usages.
 *   Call args : both naming conventions are exposed side-by-side on the
 *               same object (Users <-> usersData, Threads <-> threadsData,
 *               Currencies <-> dashBoardData, permssion <-> role,
 *               handleReply <-> Reply, handleReaction <-> Reaction) so the
 *               GoatBot code can destructure whichever names it expects.
 *   Polyfills : message {.reply/.send/.unsend/.react}, commandName, client.
 * ----------------------------------------------------------------------
 */

// GoatBot V2 commands often call `message.reply(stream)` or
// `message.reply([stream1, stream2])` directly instead of the native
// Mari-v3 shape `{ body, attachment }`. The underlying Fca sendMessage()
// only accepts a string or a plain object whose keys are all in its
// allow-list (body, attachment, url, sticker, emoji, emojiSize, mentions,
// location) — a raw stream is an object full of internal properties
// (e.g. _readableState, path, fd) that all fail that allow-list check and
// the whole send silently errors out with "Dissallowed props". Detect
// streams/arrays-of-streams and array-wrap-and-attach form here so goat
// commands can send images exactly like native commands do.
function isReadableStream(x) {
  return !!x && typeof x === "object" && typeof x.pipe === "function" && typeof x.on === "function";
}

function normalizeGoatMessage(m) {
  if (m == null || typeof m === "string") return m;

  if (isReadableStream(m)) return { attachment: m };
  if (Array.isArray(m) && m.length > 0 && m.every(isReadableStream)) return { attachment: m };

  if (typeof m === "object") {
    // Some GoatBot commands use `attachments` (plural) instead of the
    // native `attachment` key.
    if (m.attachments && !m.attachment) {
      const out = Object.assign({}, m);
      out.attachment = out.attachments;
      delete out.attachments;
      return out;
    }
  }

  return m;
}

function pickLang(val) {
  if (val == null) return "";
  if (typeof val === "string") return val;
  if (typeof val === "object") return val.en || val.vi || val.bn || Object.values(val)[0] || "";
  return String(val);
}

function buildConfig(cfg, fallbackName) {
  if (!cfg || typeof cfg !== "object") {
    return { name: fallbackName, version: "1.0.0", hasPermssion: 0, credits: "Unknown", description: "", commandCategory: "Goat", usages: "", cooldowns: 1 };
  }

  const name = cfg.name || fallbackName;
  const hasPermssion = typeof cfg.hasPermssion !== "undefined" ? cfg.hasPermssion : (typeof cfg.role === "number" ? cfg.role : 0);
  const credits = cfg.credits || cfg.author || "Unknown";
  const description = cfg.description || pickLang(cfg.shortDescription) || pickLang(cfg.longDescription) || "";
  const commandCategory = cfg.commandCategory || cfg.category || "Goat";
  let usages = cfg.usages || pickLang(cfg.guide) || "";
  usages = usages.replace(/\{pn\}/gi, "").replace(/\{n\}/gi, name).trim();
  const cooldowns = typeof cfg.cooldowns !== "undefined" ? cfg.cooldowns : (cfg.countDown ?? 1);

  const out = { name, version: cfg.version || "1.0.0", hasPermssion, credits, description, commandCategory, usages, cooldowns };
  if (Array.isArray(cfg.aliases)) out.aliases = cfg.aliases;
  if (cfg.dependencies) out.dependencies = cfg.dependencies;
  if (cfg.envConfig) out.envConfig = cfg.envConfig;
  if (cfg.premium) out.premium = cfg.premium;
  return out;
}

// Merges native Mari-v3 call args with GoatBot-style aliases so the
// wrapped function can destructure either naming convention.
function buildCallArgs(nativeArgs, cfgName) {
  const args = Object.assign({}, nativeArgs);

  if ("Users" in args) args.usersData = args.Users;
  if ("usersData" in args) args.Users = args.usersData;
  if ("Threads" in args) args.threadsData = args.Threads;
  if ("threadsData" in args) args.Threads = args.threadsData;
  if ("Currencies" in args) args.dashBoardData = args.Currencies;
  if ("dashBoardData" in args) args.Currencies = args.dashBoardData;
  if ("permssion" in args) args.role = args.permssion;
  if ("role" in args) args.permssion = args.role;
  if ("handleReply" in args) args.Reply = args.handleReply;
  if ("handleReaction" in args) args.Reaction = args.handleReaction;

  const { api, event } = args;
  if (api && event) {
    args.message = {
      reply: (m, cb) => api.sendMessage(normalizeGoatMessage(m), event.threadID, cb, event.messageID),
      send: (m, cb) => api.sendMessage(normalizeGoatMessage(m), event.threadID, cb),
      unsend: (id) => api.unsendMessage(id),
      react: (icon, msgID) => api.setMessageReaction(icon, msgID || event.messageID, () => {}, true),
    };
  }
  args.commandName = cfgName;
  args.client = global.client;

  return args;
}

function isNative(mod) {
  return typeof mod.run === "function";
}

function isGoat(mod) {
  return typeof mod.onStart === "function" && typeof mod.run !== "function";
}

function normalize(rawModule, filename) {
  if (!rawModule || typeof rawModule !== "object") return rawModule;
  if (isNative(rawModule)) return rawModule;
  if (!isGoat(rawModule)) return rawModule;

  const fallbackName = String(filename).replace(/\.js$/, "");
  const config = buildConfig(rawModule.config, fallbackName);

  const wrapped = { config, __goatCompat: true, __goatSource: rawModule };

  wrapped.run = async function (nativeArgs) {
    return rawModule.onStart(buildCallArgs(nativeArgs, config.name));
  };

  if (typeof rawModule.onLoad === "function") {
    wrapped.onLoad = rawModule.onLoad;
  }

  if (typeof rawModule.onReply === "function") {
    wrapped.handleReply = async function (nativeArgs) {
      return rawModule.onReply(buildCallArgs(nativeArgs, config.name));
    };
  }

  if (typeof rawModule.onReaction === "function") {
    wrapped.handleReaction = async function (nativeArgs) {
      return rawModule.onReaction(buildCallArgs(nativeArgs, config.name));
    };
  }

  if (typeof rawModule.handleEvent === "function") {
    wrapped.handleEvent = async function (nativeArgs) {
      return rawModule.handleEvent(buildCallArgs(nativeArgs, config.name));
    };
  }
  if (rawModule.languages) wrapped.languages = rawModule.languages;

  return wrapped;
}

module.exports = { normalize, buildConfig, buildCallArgs, normalizeGoatMessage };
