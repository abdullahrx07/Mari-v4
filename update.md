# Mari-v3 Self-Update Protocol

Mari-v3 can check a remote "update API" for new releases, download them,
verify their integrity, and apply them to itself — no manual redeploy
needed. This feature is **opt-in**: the bot does nothing update-related
unless `UPDATE_API_URL` is set.

This document is the contract the bot's client (`utils/selfUpdate.js`)
implements. Build your update API to match this exactly and it will work
with no client-side changes.

## Configuration (bot side)

| Setting | Where | Required | Purpose |
|---|---|---|---|
| `UPDATE_API_URL` | environment variable | yes, to enable the feature | Base URL of your update API, e.g. `https://updates.example.com` |
| `UPDATE_API_TOKEN` | environment variable | optional | If set, sent as `Authorization: Bearer <token>` on every request |
| `UPDATE_CHECK_INTERVAL_MS` | `config.json` | optional | How often to auto-check in the background. Default: `21600000` (6 hours) |

The bot's current version is read from `package.json`'s `"version"` field
— bump that on every release you ship.

## When checks happen

1. Once, a few seconds after the bot finishes connecting to the database
   on every boot/restart.
2. On a repeating timer (`UPDATE_CHECK_INTERVAL_MS`) while the process
   stays up.
3. On demand: a bot admin can run the `update` command in Messenger
   (`!update` with the default prefix) to trigger an immediate check
   with user-visible progress messages.

## 1. Check for an update

**Request**

```
GET {UPDATE_API_URL}/api/updates/check?version={currentVersion}&botName={botName}
Authorization: Bearer {UPDATE_API_TOKEN}   (only if UPDATE_API_TOKEN is set)
```

- `version` — the bot's current `package.json` version, e.g. `3.1.0`.
- `botName` — the value of `config.json`'s `BOTNAME`, for your own
  logging/multi-bot-fleet tracking. Optional to use server-side.

**Response** — `200 OK`, JSON body:

```json
{
  "updateAvailable": true,
  "latestVersion": "3.2.0",
  "downloadUrl": "https://updates.example.com/releases/3.2.0.zip",
  "checksum": "b2f5b2b3b3c1...<sha256 hex, 64 chars>",
  "changelog": "- Fixed goat image sending\n- Added self-update system"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `updateAvailable` | boolean | **yes** | If `false`, no other field is read — the bot stops here. |
| `latestVersion` | string | yes, if `updateAvailable` | Shown to the user and written to `includes/datajson/updateState.json` after a successful update. |
| `downloadUrl` | string (URL) | yes, if `updateAvailable` | Must point to a `.zip` of the new release. Must be reachable with the same `Authorization` header the bot already sent (or be public). |
| `checksum` | string (sha256 hex) | **yes, if `updateAvailable`** | The bot **refuses to install** an update with a missing or mismatching checksum. Compute this over the exact bytes of the zip file. |
| `changelog` | string | no | Freeform text, shown to the admin who triggered/observes the update. |

If the response is missing `updateAvailable` as a boolean, the bot treats
the whole check as failed and logs an error — it does not guess.

## 2. Download the update package

The bot does a plain `GET {downloadUrl}` (same `Authorization` header)
expecting the raw zip bytes (`responseType: arraybuffer`). No special
content-type is required, but serving `application/zip` is recommended.

## 3. Package format

The zip should contain the full project tree exactly as it should exist
after the update (a straight file replacement), either at the zip root or
inside a single top-level folder (the bot auto-detects and descends into
one wrapping folder, e.g. how GitHub's "Download ZIP" nests everything
under `repo-name-branch/`).

### Files the bot will never overwrite

The bot skips these paths when applying an update, no matter what the
zip contains — they hold local secrets or local runtime state that must
survive an update untouched:

```
node_modules/
.git/
config.json
acc.json
appstate.json
.env
Horizon_Database/
includes/datajson/
includes/data_sqlite/
data.sqlite
update.md
```

If your release changes `config.json`'s *shape* (new keys), ship a
migration note in `changelog` — the bot does not auto-merge config
changes, by design, so an admin's live config/secrets are never
silently rewritten.

## 4. After a successful update

The bot writes `includes/datajson/updateState.json`:

```json
{
  "version": "3.2.0",
  "appliedAt": "2026-07-14T10:00:00.000Z",
  "previousVersion": "3.1.0"
}
```

then exits the process (`process.exit(1)`) so the process manager /
Replit workflow restarts it on the new code. There is no separate
"restart" step your API needs to trigger — exiting after a successful
copy is the mechanism.

## 5. Failure handling

- Any network error, non-2xx response, malformed JSON, or checksum
  mismatch aborts the update. The bot logs the reason and keeps running
  on its current version — it never partially applies an update.
- The periodic background check never crashes the bot on failure; the
  `update` command reports the failure back to the admin who ran it.

## Suggested (not required) server-side behavior

- Version comparison: the bot always sends its current version and lets
  your API decide `updateAvailable` — semver comparison, a manual
  allow-list, staged rollouts, etc. are entirely up to your API.
- Auth: use `UPDATE_API_TOKEN` to gate who can pull releases if this
  isn't a public endpoint.
- Serve `downloadUrl` from the same host/CDN so the same bearer token
  (if any) is valid for both requests, or make the download URL public
  (e.g. a signed/short-lived link) if your check endpoint is private but
  downloads shouldn't require the same auth.
