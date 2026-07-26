# Mari-v3 Self-Update Protocol & GitHub Fork Auto-Update

Mari-v3 supports two separate update systems: the standard self-update API check, and a public GitHub fork repository version checker. These update systems are fully opt-in and configurable.

---

## 1. GitHub Public Fork & Poll URL Auto-Update (New)

The bot can check a public GitHub repository (or fork) for new versions, automatically pull/clone the code to self-update, or send a Pull Request notification to a poll/pull webhook.

### Configuration (`config.json` or Environment Variables)

You can manage the settings under the `"autoUpdate"` object in `config.json` or via environment variables:

| Setting (Config Key) | Env Variable | Default | Purpose |
|---|---|---|---|
| `"autoUpdate": { "enable": true }` | `AUTO_UPDATE_ENABLE` | `true` | Toggle the auto-update system on/off. |
| `"autoUpdate": { "githubForkUrl": "..." }` | `GITHUB_FORK_URL` | empty | The public GitHub repository or fork URL to monitor (e.g., `https://github.com/username/repo`). |
| `"autoUpdate": { "githubPollUrl": "..." }` | `GITHUB_POLL_URL` or `GITHUB_PULL_URL` | empty | (Optional) If specified, the bot will send an update notification here instead of updating directly. |

### How It Works

1. **Version Checking**:
   The bot reads its current version from `package.json`'s `"version"` field. It then fetches the remote `package.json` from the target GitHub repository's default branches (`main` or `master`) via `raw.githubusercontent.com`.
2. **Comparison**:
   Using the `semver` library, the bot checks if the remote version is strictly greater than the current version (`semver.gt`).
3. **Update Delivery**:
   - **Case A: `githubPollUrl` is configured**:
     Instead of updating files directly, the bot dispatches an HTTP POST request (falling back to GET) to the `githubPollUrl` to notify your deployment setup about the new update.

     **POST Payload**:
     ```json
     {
       "event": "update_available",
       "currentVersion": "4.0.0",
       "latestVersion": "4.1.0",
       "githubForkUrl": "https://github.com/username/repo",
       "downloadUrl": "https://github.com/username/repo/archive/refs/heads/main.zip"
     }
     ```

     **GET Query Params Fallback**:
     `?event=update_available&currentVersion=4.0.0&latestVersion=4.1.0&githubForkUrl=...`

   - **Case B: No `githubPollUrl` configured**:
     The bot downloads the target repository's branch ZIP archive directly, extracts it, overwrites local files (excluding folders/files listed in the `PRESERVE` list), and gracefully restarts the process (`process.exit(1)`) to apply the changes.

---

## 2. Legacy Self-Update API Protocol

This system talks to a user-hosted "update API" and is active if `UPDATE_API_URL` is set and no GitHub fork is configured.

### Configuration (bot side)

| Setting | Where | Required | Purpose |
|---|---|---|---|
| `UPDATE_API_URL` | environment variable | yes, to enable the feature | Base URL of your update API, e.g. `https://updates.example.com` |
| `UPDATE_API_TOKEN` | environment variable | optional | If set, sent as `Authorization: Bearer <token>` on every request |
| `UPDATE_CHECK_INTERVAL_MS` | `config.json` | optional | How often to auto-check in the background. Default: `21600000` (6 hours) |

### When checks happen

1. Once, a few seconds after the bot finishes connecting to the database on every boot/restart.
2. On a repeating timer (`UPDATE_CHECK_INTERVAL_MS`) while the process stays up.
3. On demand: a bot admin can run the `update` command in Messenger (`!update`) to trigger an immediate check.

### Request

```
GET {UPDATE_API_URL}/api/updates/check?version={currentVersion}&botName={botName}
Authorization: Bearer {UPDATE_API_TOKEN}   (only if UPDATE_API_TOKEN is set)
```

- `version` — the bot's current `package.json` version, e.g. `3.1.0`.
- `botName` — the value of `config.json`'s `BOTNAME`.

### Response — `200 OK`, JSON body:

```json
{
  "updateAvailable": true,
  "latestVersion": "3.2.0",
  "downloadUrl": "https://updates.example.com/releases/3.2.0.zip",
  "checksum": "b2f5b2b3b3c1...<sha256 hex, 64 chars>",
  "changelog": "- Fixed bugs\n- Added self-update system"
}
```

---

## 3. Preservation List (Never Overwritten)

Whether updating via GitHub fork or custom API, the bot **never overwrites** these paths to prevent loss of local credentials, configuration, or databases:

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
