# ST-FCA (stfca)

[![npm version](https://img.shields.io/npm/v/stfca.svg)](https://www.npmjs.com/package/stfca)
[![npm downloads](https://img.shields.io/npm/dm/stfca.svg)](https://www.npmjs.com/package/stfca)
[![GitHub](https://img.shields.io/github/license/sheikhtamimlover/ST-FCA)](https://github.com/sheikhtamimlover/ST-FCA)

> **Unofficial Facebook Chat API for Node.js** - Interact with Facebook Messenger programmatically for ST-BOT 
> 
> **Enhanced & Maintained by ST | Sheikh Tamim**
>
> 🔐 **Now with End-to-End Encryption (E2EE) Support!**

## 🌟 What's New in ST-FCA

- ✨ Enhanced MQTT connection logging
- 🔄 Auto-reconnect with configurable intervals
- 📊 Better connection status indicators
- 🎨 Improved console output with colors
- 🔐 **NEW: End-to-End Encryption (E2EE) Support** - Full E2EE messaging system
- 🚀 Automatic update checking and installation
- 💡 Better error handling and debugging
- 🔐 Enhanced security and stability

## 📦 Installation

```bash
npm install stfca
```

Or with yarn:

```bash
yarn add stfca
```

## 🔄 Auto-Update Feature

ST-FCA includes an **automatic update system** that keeps your package up-to-date seamlessly:

### How It Works

1. 🔍 **Automatic Check**: Checks for updates when you start your bot
2. 📋 **Shows Changes**: Displays recent changelog updates
3. 📦 **NPM Update**: Runs `npm install stfca@latest` automatically
4. 🔄 **Auto-Restart**: Restarts your bot to apply changes

### For Bot Projects

If you're using ST-FCA in your bot project (like [ST-BOT](https://github.com/sheikhtamimlover/ST-BOT)), the package will:

- ✅ Detect when a new version is available
- ✅ Automatically update to the latest version via npm
- ✅ Update your `node_modules/stfca` folder
- ✅ Restart your bot with the new version

### Manual Update

You can also update manually:

```bash
npm install stfca@latest
```

Or check for updates programmatically:

```javascript
const { checkForFCAUpdate } = require('stfca/checkUpdate.js');
await checkForFCAUpdate();
```

### Update Notifications

The auto-update system will:
- Show the current and latest versions
- Display recent changes from the changelog
- Inform you when the update is complete
- Automatically restart your application

**Note**: Updates are non-blocking and won't interrupt your bot's startup if the update check fails.

## ⚠️ Important Disclaimer

**We are not responsible if your account gets banned for spammy activities such as:**

- Sending lots of messages to people you don't know
- Sending messages very quickly
- Sending spammy looking URLs
- Logging in and out very quickly

**Recommendation:** Use Firefox browser or [this website](https://fca.dongdev.id.vn) to reduce logout issues, especially for iOS users.

**Support:** If you encounter errors, contact us [here](https://www.facebook.com/mdong.dev)

## 🔍 Introduction

Facebook now has an [official API for chat bots](https://developers.facebook.com/docs/messenger-platform), however it's only available for Facebook Pages.

`stfca` is the only API that allows you to automate chat functionalities on a **user account** by emulating the browser. This means:

- Making the exact same GET/POST requests as a browser
- Does not work with auth tokens
- Requires Facebook account credentials (email/password) or AppState

## 📦 Installation

```bash
npm install stfca@latest
```

## 🚀 Basic Usage

### 1. Login and Simple Echo Bot

```javascript
const login = require("stfca");

login({ appState: [] }, (err, api) => {
    if (err) return console.error(err);

    api.listenMqtt((err, event) => {
        if (err) return console.error(err);

        // Echo back the received message
        api.sendMessage(event.body, event.threadID);
    });
});
```

### 2. Send Text Message

```javascript
const login = require("stfca");

login({ appState: [] }, (err, api) => {
    if (err) {
        console.error("Login Error:", err);
        return;
    }

    let yourID = "000000000000000"; // Replace with actual Facebook ID
    let msg = "Hey!";

    api.sendMessage(msg, yourID, err => {
        if (err) console.error("Message Sending Error:", err);
        else console.log("Message sent successfully!");
    });
});
```

**Tip:** To find your Facebook ID, look inside the cookies under the name `c_user`

### 3. Send File/Image

```javascript
const login = require("stfca");
const fs = require("fs");

login({ appState: [] }, (err, api) => {
    if (err) {
        console.error("Login Error:", err);
        return;
    }

    let yourID = "000000000000000";
    let imagePath = __dirname + "/image.jpg";

    // Check if file exists
    if (!fs.existsSync(imagePath)) {
        console.error("Error: Image file not found!");
        return;
    }

    let msg = {
        body: "Hey!",
        attachment: fs.createReadStream(imagePath)
    };

    api.sendMessage(msg, yourID, err => {
        if (err) console.error("Message Sending Error:", err);
        else console.log("Message sent successfully!");
    });
});
```

## � E2EE (End-to-End Encryption) - NEW FEATURE

ST-FCA now includes **full End-to-End Encryption support** for secure encrypted messaging!

### What is E2EE?

E2EE (End-to-End Encryption) ensures that messages are encrypted on the sender's device and only decrypted on the recipient's device. No one in between (including servers) can read your messages.

### E2EE Features

✅ **Encrypted Messages** - All messages are encrypted  
✅ **Encrypted Attachments** - Photos, videos, files encrypted  
✅ **Automatic Detection** - Auto-routes between E2EE and standard messages  
✅ **Message Reactions** - React to encrypted messages  
✅ **Message Editing** - Edit encrypted messages  
✅ **Typing Indicators** - Send typing indicators over E2EE  
✅ **Device Persistence** - Reuse device keys across sessions  
✅ **Media Server** - Local cache for decrypted files  

### E2EE Quick Start

```javascript
const login = require("stfca");
const fs = require("fs");

login(
    { appState: JSON.parse(fs.readFileSync("appstate.json", "utf8")) },
    {
        enableE2EE: true,  // 🔐 Enable E2EE
        listenEvents: true,
        autoMarkRead: true
    },
    (err, api) => {
        if (err) return console.error(err);

        // Connect E2EE Bridge
        api.connectE2EE((err) => {
            if (err) console.error("E2EE connection failed:", err);
            console.log("✓ E2EE connected!");
        });

        // Get device data
        api.getE2EEDeviceData((err, data) => {
            if (!err) console.log("✓ Device data loaded");
        });

        // Listen for E2EE Messages
        api.listenMqtt((err, event) => {
            if (err) return console.error(err);

            // Handle E2EE messages
            if (event.type === "e2ee_message") {
                console.log("🔐 E2EE Message:", event.body);
                console.log("   Thread:", event.threadID);
                console.log("   Encrypted: ✓ YES");

                // Auto-reply with E2EE
                api.sendMessage("Received: " + event.body, event.threadID);
            }

            // Handle E2EE reactions
            if (event.type === "e2ee_message_reaction") {
                console.log("🔐 E2EE Reaction:", event.reaction);
            }

            // Handle E2EE edits
            if (event.type === "e2ee_message_edit") {
                console.log("🔐 E2EE Message Edited:", event.body);
            }
        });
    }
);
```

### E2EE Event Types

#### E2EE Message Event
```javascript
event.type === "e2ee_message"
{
    type: "e2ee_message",
    senderID: "61568577897207",
    threadID: "61568577897207:69@msgr",  // E2EE JID format
    body: "Hello encrypted world!",
    messageID: "m_1234567890",
    isE2EE: true,  // 🔐 Marked as encrypted
    isGroup: false,
    timestamp: 1780805668000,
    attachments: [],
    mentions: {}
}
```

#### E2EE Reaction Event
```javascript
event.type === "e2ee_message_reaction"
{
    type: "e2ee_message_reaction",
    messageID: "m_1234567890",
    reaction: "❤️",
    userID: "61568577897207",
    threadID: "61568577897207:69@msgr",
    isE2EE: true
}
```

#### E2EE Message Edit Event
```javascript
event.type === "e2ee_message_edit"
{
    type: "e2ee_message_edit",
    messageID: "m_1234567890",
    body: "Updated encrypted message",
    senderID: "61568577897207",
    isE2EE: true
}
```

### E2EE API Methods

```javascript
// Enable E2EE in options
api.setOptions({ enableE2EE: true });

// Connect E2EE bridge
api.connectE2EE(callback);

// Get device encryption keys
api.getE2EEDeviceData(callback);

// Send encrypted message (auto-detected)
api.sendMessage(message, e2eeThreadID, callback);

// React to encrypted message
api.setMessageReaction(emoji, messageID, callback);

// Edit encrypted message
api.editMessage(message, messageID, callback);

// Unsend encrypted message
api.unsendMessage(messageID, callback);

// Send typing indicator (E2EE)
api.sendTypingE2EE(threadID, callback);

// Download encrypted media
api.downloadE2EEMedia(messageID, callback);

// Resolve encrypted attachment URL
api.resolveE2EEAttachment(attachment);
```

### E2EE Connection Flow

<img src="assest/e2eeconnect.png" alt="E2EE Connection Process" width="800"/>

*Successful E2EE bridge connection showing:*
- ✓ Login with cookies
- ✓ MQTT connection established
- ✓ E2EE bridge connected
- ✓ Device keys established

### E2EE Message Listening

<img src="assest/e2eelisten.png" alt="E2EE Message Event" width="800"/>

*E2EE message event showing:*
- 🔐 Encrypted message received
- ✓ Message JID format (E2EE identifier)
- ✓ Sender and thread information
- ✓ `isE2EE: true` flag

### Configuration

```javascript
// In config.json
{
    "enableE2EE": true,
    "enableTypingIndicator": true,
    "typingDuration": 4000
}
```

Or in login options:
```javascript
{
    enableE2EE: true,
    e2eeMemoryOnly: false,
    autoReconnect: true,
    listenEvents: true
}
```

### Test E2EE Bot

A complete E2EE test bot is included: [e2eebot.js](./e2eebot.js)

```bash
# Run the E2EE test bot
node e2eebot.js
```

Commands:
- `!ping` - Test bot response
- `!info` - Show message info
- `!echo <text>` - Echo message
- `!react` - React with ❤️
- `!help` - Show help

### Full E2EE Documentation

See [E2EE_GUIDE.md](./E2EE_GUIDE.md) for comprehensive documentation including:
- ✅ System architecture
- ✅ All API methods
- ✅ Event types reference
- ✅ Attachment handling
- ✅ Device data management
- ✅ Troubleshooting guide

---

## �📝 Message Types

| Type                   | Usage                                                             |
| ---------------------- | ----------------------------------------------------------------- |
| **Regular text** | `{ body: "message text" }`                                      |
| **Sticker**      | `{ sticker: "sticker_id" }`                                     |
| **File/Image**   | `{ attachment: fs.createReadStream(path) }` or array of streams |
| **URL**          | `{ url: "https://example.com" }`                                |
| **Large emoji**  | `{ emoji: "👍", emojiSize: "large" }` (small/medium/large)      |

**Note:** A message can only be a regular message (which can be empty) and optionally **one of the following**: a sticker, an attachment, or a URL.

## 💾 Saving AppState to Avoid Re-login

### Save AppState

```javascript
const fs = require("fs");
const login = require("stfca");

const credentials = { appState: [] };

login(credentials, (err, api) => {
    if (err) {
        console.error("Login Error:", err);
        return;
    }

    try {
        const appState = JSON.stringify(api.getAppState(), null, 2);
        fs.writeFileSync("appstate.json", appState);
        console.log("✅ AppState saved successfully!");
    } catch (error) {
        console.error("Error saving AppState:", error);
    }
});
```

### Use Saved AppState

```javascript
const fs = require("fs");
const login = require("stfca");

login(
    { appState: JSON.parse(fs.readFileSync("appstate.json", "utf8")) },
    (err, api) => {
        if (err) {
            console.error("Login Error:", err);
            return;
        }

        console.log("✅ Logged in successfully!");
        // Your code here
    }
);
```

**Alternative:** Use [c3c-fbstate](https://github.com/c3cbot/c3c-fbstate) to get fbstate.json

## 👂 Listening for Messages

### Echo Bot with Stop Command

```javascript
const fs = require("fs");
const login = require("stfca");

login(
    { appState: JSON.parse(fs.readFileSync("appstate.json", "utf8")) },
    (err, api) => {
        if (err) {
            console.error("Login Error:", err);
            return;
        }

        // Enable listening to events (join/leave, title change, etc.)
        api.setOptions({ listenEvents: true });

        const stopListening = api.listenMqtt((err, event) => {
            if (err) {
                console.error("Listen Error:", err);
                return;
            }

            // Mark as read
            api.markAsRead(event.threadID, err => {
                if (err) console.error("Mark as read error:", err);
            });

            // Handle different event types
            switch (event.type) {
                case "message":
                    if (event.body && event.body.trim().toLowerCase() === "/stop") {
                        api.sendMessage("Goodbye…", event.threadID);
                        stopListening();
                        return;
                    }
                    api.sendMessage(`TEST BOT: ${event.body}`, event.threadID);
                    break;

                case "event":
                    console.log("Event Received:", event);
                    break;
            }
        });
    }
);
```

### Listen Options

```javascript
api.setOptions({
    listenEvents: true,  // Receive events (join/leave, rename, etc.)
    selfListen: true,    // Receive messages from yourself
    logLevel: "silent"   // Disable logs (silent/error/warn/info/verbose)
});
```

**By default:**

- `listenEvents` is `false` - won't receive events like joining/leaving chat, title changes
- `selfListen` is `false` - will ignore messages sent by the current account

## 🛠️ Projects Using This API

### Primary Project

- **[ST-BOT](https://github.com/sheikhtamimlover/ST-BOT)** - Enhanced version of GoatBot V2, a powerful and customizable Facebook Messenger bot with advanced features, plugin support, and automatic updates. This is the main project that ST-FCA was designed for.

### Other Use Cases

ST-FCA can be used for any Facebook Messenger bot project or automation tool. If you want to create your own messenger bot or use this API for other purposes, feel free to integrate it into your project.

## 📚 Full API Documentation

See [DOCS.md](./DOCS.md) for detailed information about:

- All available API methods
- Parameters and options
- Event types
- Error handling
- Advanced usage examples

## 🎯 Quick Reference

### Common API Methods

```javascript
// Send message
api.sendMessage(message, threadID, callback);

// Send typing indicator
api.sendTypingIndicator(threadID, callback);

// Mark as read
api.markAsRead(threadID, callback);

// Get user info
api.getUserInfo(userID, callback);

// Get thread info
api.getThreadInfo(threadID, callback);

// Change thread color
api.changeThreadColor(color, threadID, callback);

// Change thread emoji
api.changeThreadEmoji(emoji, threadID, callback);

// Set message reaction
api.setMessageReaction(reaction, messageID, callback);
```

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a new branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

MIT License - See [LICENSE](./LICENSE) for details.

## 👨‍💻 Author

**ST | Sheikh Tamim** - [Facebook](https://www.facebook.com/hamza.chudena)

## ⭐ Support

If this project is helpful, please give it a ⭐ on GitHub!

## 🔗 Links

- [NPM Package](https://www.npmjs.com/package/stfca)
- [GitHub Repository](https://github.com/sheikhtamimlover/fca-unofficial)
- [Issue Tracker](https://github.com/sheikhtamimlover/fca-unofficial/issues)

---

**Disclaimer:** This is an unofficial API and is not officially supported by Facebook. Use responsibly and comply with [Facebook Terms of Service](https://www.facebook.com/terms.php).