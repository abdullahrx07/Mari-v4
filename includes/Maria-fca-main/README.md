# 🎀 @rxabdullah/xdi-fca (rX 〄)

An advanced, feature-rich, and extremely robust unofficial **Facebook Chat API (FCA)** library for Node.js. Built for speed, reliability, and security, this library features built-in **Labyrinth End-to-End Encryption (E2EE)** support, **MQTT Live Bridge**, **Silent Hosted Image Uploading**, and a fully automated, customizable **Auto Update System**.

---

## 🌟 Features

| Feature | Description |
| :--- | :--- |
| **🔐 Labyrinth E2EE Support** | Automatically decrypts and encrypts messages in Facebook's End-to-End Encrypted chats using a native Labyrinth secure bridge. |
| **🔄 Auto Update System** | Automatically detects newer versions on the NPM registry, downloads/installs them, updates the local project `package.json`, and restarts to apply changes. |
| **📡 MQTT Live Bridge** | Full real-time message listening, reaction tracking, typing indicators, and read receipts via a robust background MQTT connection. |
| **🖼️ Silent Attachment Hosting** | Seamlessly uploads local media/decrypted attachments to ImgBB and ImageKit silently when hosting is required. |
| **🎯 Advanced Typing Indicator** | Simulates human typing behavior with configurable durations for realism. |
| **🛡️ Anti-Logout Protection** | Smart sessions and auto-reconnection keep your bot logged in without getting hit by sudden checkpoint/approvals logouts. |
| **✨ Text Effects Support** | Send messages with animated Messenger text effects (`hearts`, `gift`, `fire`, `confetti`, `sparkles`) or custom effect IDs. |
| **🎨 AI Theme Generator** | Generate custom Messenger chat themes from a text prompt and apply them directly to a thread over MQTT. |
| **🔁 Duplicate Event Guard** | Filters out duplicated MQTT events (same `threadID` + `messageID` delivered 2–3 times in a row) so your listener callback fires exactly once per event. |
| **📊 `[ MARI -FCA ]` Memory Monitor** | Prints FCA heap and hosting memory usage to the console every minute with a color-coded `[ MARI -FCA ]` frame, and auto-cleans cache when usage crosses 90%. |

---

## 📊 Memory Monitor & Duplicate Event Guard

### Real-Time Memory Monitor

Right after a successful login, a background monitor starts printing the bot's memory health to the console every **1 minute**:

```
[ MARI -FCA ] 12:05:02, 2/8/2024 - Memory usage: 0.97% | FCA Heap: 0.97% | Hosting: 45.20%
```

- The `[ MARI -FCA ]` frame is **bright green** while usage is normal, and turns **bright red** when either the FCA heap or the hosting (system) memory load reaches **90%**.
- On overload, a red warning is printed and the automatic cache cleaner (`extra/monitor/cacheCleaner.js`) runs to free up space.
- The timestamp is formatted as `hh:mm:ss, d/m/yyyy`; the message text itself is uncolored.

No configuration is needed — it starts automatically on login.

### Duplicate Event Guard

Facebook's MQTT stream occasionally delivers the same event 2–3 times within a few seconds. The built-in guard (`extra/monitor/eventGuard.js`) wraps the `listenMqtt` callback and deduplicates events by `type + threadID + messageID` over a 60-second window:

- The **first** occurrence is delivered to your listener normally.
- Every duplicate is **skipped** — your callback never sees it — and logged with a red frame:

```
[ MARI -FCA ] Duplicate event skipped → type: message | thread: 1234567890 | msg: mid.abc123
```

This works automatically for all event types (`message`, `message_reply`, `message_reaction`, admin events, etc.) — no setup required.

---

## 🔄 Auto Update System

Our auto-update system works asynchronously and does not block your bot's startup process.

### How it Works:
1. **Version Check**: During bot login, the system queries the NPM registry for the latest version of the running package name.
2. **Dynamic Name Matching**: It automatically reads your `package.json` package name (`rx-fca`, `@rxabdullah/xdi-fca`, or custom fork names) to check for updates.
3. **Robust Comparison**: Safely parses semantic versions (handles beta/pre-release tags like `1.2.3-beta.1` without crashing or returning `NaN`).
4. **Local Updates**: Downloads the newest version using `npm install <package>@latest --save` and updates all matching dependencies in your `package.json`.
5. **Restart**: Automatically exits the process with exit code `2`. Process managers like **PM2**, **Nodemon**, or custom bash loops will notice this and instantly restart the bot with the new updates applied.

### How to Disable Auto Update:
If you are developing locally or want to lock your FCA version, you can disable the auto-updater by passing `autoUpdate: false` in the login options:

```javascript
fca({ appState }, { autoUpdate: false }, (err, api) => {
    if (err) return console.error(err);
    // Bot logic here
});
```

---

## ✨ Message Text Effects

Send animated Messenger text effects directly using `api.sendMessage` or `api.sendMessageMqtt` by setting the `textEffect` (or `text_effect`, `effect`, `text_effect_id`, `effectID`) property in your message object.

### Supported Built-in Text Effect Names:
- `"hearts"` (Effect ID: `"1"`)
- `"gift"` (Effect ID: `"2"`)
- `"fire"` (Effect ID: `"3"`)
- `"confetti"` (Effect ID: `"4"`)
- `"sparkles"` (Effect ID: `"5"`)

Custom numerical effect IDs (as string or number) are also accepted.

### Example Usage:

```javascript
// Sending text with built-in effect keyword
api.sendMessage({
    body: "I love you! ❤️",
    textEffect: "hearts"
}, threadID);

// Fire effect
api.sendMessage({
    body: "That's awesome! 🔥",
    effect: "fire"
}, threadID);

// Gift wrap effect with reply alias
api.sendMessage({
    body: "Here is your gift! 🎁",
    textEffect: "gift",
    replyTo: event.messageID
}, threadID);
```

---

## 🎨 AI-Generated Chat Themes

Generate custom Messenger chat themes from a text prompt using Facebook's AI theme generator, directly through the API — no need to open the Messenger app.

### `api.createAITheme(prompt, numThemes, callback)`

| Param | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `prompt` | `string` | ✅ | Description of the theme you want (e.g. `"sunset over the ocean"`). |
| `numThemes` | `number` | ❌ | How many theme variations to generate. Default `3`, max `10`. Can be omitted (callback shifts into its place). |
| `callback` | `function` | ❌ | `(err, themes) => {}`. If omitted, a Promise is returned instead. |

Each returned theme includes a normalized `preview_image_urls` object (`{ light_mode, dark_mode }`) so you don't have to manually dig through Facebook's raw response shape to find preview images.

#### Callback style:
```javascript
api.createAITheme("cyberpunk neon city", 5, (err, themes) => {
    if (err) return console.error("Theme generation failed:", err);

    themes.forEach((theme, i) => {
        console.log(`Theme ${i + 1}:`, theme.theme_id);
        console.log("Light preview:", theme.preview_image_urls.light_mode);
        console.log("Dark preview:", theme.preview_image_urls.dark_mode);
    });
});
```

#### Promise style:
```javascript
try {
    const themes = await api.createAITheme("cozy autumn cabin");
    console.log(`Generated ${themes.length} themes`);
} catch (err) {
    console.error("Theme generation failed:", err);
}
```

#### Applying a generated theme:
Once you have a `theme_id` from `createAITheme`, apply it to a thread over MQTT:
```javascript
api.setThreadThemeMqtt(threadID, theme.theme_id, (err) => {
    if (err) return console.error("Failed to set theme:", err);
    console.log("Thread theme updated!");
});
```

---

## 🔑 Login Example

Basic login setup using **Maria-fca**:

```javascript
const fca = require('@rxabdullah/xdi-fca');
const fs = require('fs');

const appState = JSON.parse(fs.readFileSync('./cookie.txt', 'utf8'));

const fcaOptions = {
    autoUpdate: true,        // Enable auto updates
    selfListen: false,       // Don't listen to bot's own messages
    listenEvents: true,      // Listen to events like join/leave/reactions
    enableE2EE: true,        // Enable E2EE
    e2eeMemoryOnly: false,   // Save key files locally
    e2eeDevicePath: './e2ee_device.json'
};

fca({ appState }, fcaOptions, async (err, api) => {
    if (err) {
        console.error('❌ Login Failed:', err);
        return;
    }

    console.log(`✅ Logged in as UID: ${api.getCurrentUserID()}`);

    // If E2EE is enabled, initialize the client connection
    if (fcaOptions.enableE2EE) {
        console.log('📡 Connecting E2EE Client...');
        api.connectE2EE((e2eeErr, event) => {
            if (e2eeErr) return console.error('E2EE Error:', e2eeErr);
            if (event.type === 'e2ee_fully_ready') {
                console.log('🔒 E2EE Client Connected and Secured!');
            }
        });
    }

    // Start listening to MQTT messages
    api.listenMqtt((listenErr, event) => {
        if (listenErr) return console.error(listenErr);
        console.log(event);
    });
});
```

---

## 🔁 Auto Re-Login / Session Refresh System

The library never asks for your password again after the first login — it keeps your session alive by silently refreshing cookies and tokens instead of doing a full re-login.

### How it Works:
1. **Proactive Refresh (Session Keeper)**: A background timer runs every **90 minutes** while `listenMqtt` is active. It re-fetches `messenger.com` to refresh cookies and pulls a fresh `fb_dtsg` token before the session has a chance to expire.
2. **Reactive Reconnect**: If the MQTT connection drops or errors out and `autoReconnect: true` is set, the library waits 1 second, then refreshes cookies + `fb_dtsg`, and reconnects.
3. **Fresh Token Fetch (`api.getFreshDtsg`)**: Loads the raw Facebook homepage HTML and tries a chain of regex patterns to extract a valid `fb_dtsg` token — since Facebook's page structure changes often, multiple fallback patterns are tried in order until one succeeds.
4. **Retry With Backoff**: If fetching the sync sequence ID fails, it retries up to 5 times with increasing delay (3s, 6s, 9s...). If all 5 fail and `autoReconnect` is still on, it switches to exponential backoff (30s up to a max of 2 minutes) and keeps retrying indefinitely, refreshing the token on every attempt.
5. **Real Logout Detection**: If the failure message matches actual auth errors (`Not logged in`, `checkpoint`, `401`/`403`, etc.), it marks the session as truly logged out (`ctx.loggedIn = false`) instead of endlessly retrying — this distinguishes a real logout from a temporary network hiccup.
6. **AppState Persistence**: Every time the session is refreshed, if `appStateFile` is set in the login options, the updated appState/cookies are written to disk — so restarting the bot won't use a stale, expired appState.

### Enabling It:
```javascript
const fcaOptions = {
    autoReconnect: true,                    // Enables reactive reconnect + retry-with-backoff
    appStateFile: './cookie.txt'            // Keeps appState on disk always fresh
};
```

---

## 📞 Contact & Support

For issues, bugs, or feature requests, please open a Pull Request on the repository.

[**WhatsApp**](https://wa.me/01317604783)

---

## 📄 License & Credits

This project is licensed under the MIT License. Special thanks to all contributors who worked on enhancing the Facebook Messenger Labyrinth E2EE protocol and stabilizing the background MQTT bridge connection!
