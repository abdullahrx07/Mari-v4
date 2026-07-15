# Mari-v3 (Facebook Messenger bot)

Legacy Facebook Messenger chatbot, forked from the Mirai/GoatBot ecosystem.
Runs as its own npm project, outside the pnpm workspace (see root
`replit.md`). Entry point: `index.js` (health-check HTTP server on `PORT`,
spawns `main.js` as a child process which does the actual bot work).

## Required secrets (not yet set)

- `MONGODB_URI` — MongoDB connection string. The bot's Users/Threads/
  Currencies data was migrated from SQLite/Sequelize to MongoDB/Mongoose
  (`includes/database/`, `includes/controllers/`). Without this set, the
  bot starts and serves its health-check endpoint but logs a clear error
  and does not persist any data.
- `FB_EMAIL` / `FB_PASSWORD` — only needed once Facebook login is
  re-enabled (see below). Do not put these in `acc.json` in plaintext.

## Facebook login is currently disabled — action needed before this bot can message anyone

`fca-priyansh` (the npm package this bot used to log into Facebook) was
blocked by Replit's package security scanner as **known credential/session
-harvesting malware**. It has been removed from `package.json`, and
`main.js` now no-ops the login step with a clear log message instead of
installing/running it. Real Facebook session cookies and a plaintext
email/password were also found already exposed in the uploaded project
(`config.json`, `acc.json`) — both have been scrubbed from disk. **The
Facebook password that was in `acc.json` should be changed**, since it was
sitting in plaintext in the codebase.

Before re-enabling login, evaluate a replacement Facebook Chat API library
(the project also has a vendored, unaudited copy at `includes/Fca/` that
was never actually used at runtime — audit before trusting it either),
wire it back into `main.js` in place of the current `login = null` guard,
and add `FB_EMAIL`/`FB_PASSWORD` as secrets (never back to `acc.json`).

## Self-update system

`utils/selfUpdate.js` + the `update` command (bot-admin only) implement a
client for a self-hosted "update API" — see `/update.md` at the project
root for the exact protocol to build a matching backend against. Disabled
by default; enable by setting `UPDATE_API_URL`.

## Known intentionally-left-alone items

- `rname`/`sim` command API keys are still inline in `config.json` (low-risk
  third-party service keys, unlike the FB cookies/tokens that were removed).
- Local JSON/SQLite feature stores unrelated to the main Users/Threads/
  Currencies data (`includes/datajson/*.json`, `includes/data_sqlite/`,
  `Horizon_Database/`) were left as-is — out of scope for the Mongo
  migration.
- `includes/Fca/` (vendored FCA library copy) is kept on disk but not
  required anywhere at runtime; not audited for safety.

## Gotchas

- `node index.js` (the `start` script) pre-requires every file in
  `modules/commands/` at boot as a naive syntax/module check, before
  `global.utils` exists (that's set up inside the `main.js` child process).
  This throws a caught, non-fatal `Module error detected` log for
  `eval.js` (and possibly other files that assume globals exist) on every
  boot — pre-existing behavior, cosmetic only, safe to ignore.
- Command permission field is `hasPermssion` (misspelled, consistently,
  throughout the codebase) — not `hasPermission`. A stray correctly-spelled
  `hasPermission` silently disables a command's permission check (this bit
  `cmdinstall.js`; already fixed).
