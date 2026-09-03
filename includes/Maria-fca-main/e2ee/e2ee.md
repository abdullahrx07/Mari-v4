# 🔐 Labyrinth End-to-End Encryption (E2EE) Guide

This document describes how End-to-End Encryption (E2EE) is architected and operates within this Facebook Chat API (FCA) library.

---

## 🏛️ Architecture Overview

Facebook Messenger uses a specialized End-to-End Encryption protocol named **Labyrinth** (derived from the Signal Protocol). Because E2EE messages are encrypted client-side, traditional HTTP/graphQL APIs or standard plain-text MQTT endpoints cannot read or send messages in encrypted threads.

This library solves this by implementing a **Native Labyrinth ESM Bridge** that negotiates encryption keys and handles real-time packet cryptographic operations.

```
       ┌────────────────────────────────────────────────────────┐
       │                     Maria-FCA / xdi-fca                │
       │                                                        │
       │   ┌──────────────────┐          ┌──────────────────┐   │
       │   │   MQTT / HTTPS   │          │  Labyrinth E2EE  │   │
       │   │  (Regular Chats) │          │      Bridge      │   │
       │   └────────┬─────────┘          └────────┬─────────┘   │
       └────────────┼─────────────────────────────┼─────────────┘
                    │                             │
          Standard Messages               Encrypted Messages
                    │                             │
                    ▼                             ▼
         [Facebook Messenger]           [Facebook Labyrinth]
```

---

## ⚙️ Core Components

The E2EE subsystem consists of three major components working together:

### 1. The Labyrinth ESM Bridge (`e2ee.js`)
Loaded dynamically from the `./lib/index.mjs` bundle, this bridge initializes a client that handles:
- **Session Keys**: Managing pre-keys, signed pre-keys, and dynamic session states.
- **Key Storage**: Saving device keys locally (`devicePath`) or in-memory (`memoryOnly: true`) based on your configuration.
- **Network Socket**: Establishing an encrypted channel parallel to the standard MQTT connection.

### 2. Local HTTP Decryption Media Server
E2EE attachments (photos, videos, audio, and documents) are sent as encrypted binary blobs hosted on Facebook CDN. The metadata contains a `directPath`, a `mediaKey`, and SHA256 hashes.
- To prevent slowing down the bot or exposing raw decrypted buffers to disk, the library runs an **internal HTTP server** on `127.0.0.1` with a dynamically allocated random port.
- When an E2EE attachment is received, the library decrypts it on-the-fly, caches it in memory, and serves it through a unique local URL (e.g., `http://127.0.0.1:49213/e2ee/ab8d7c...`).
- Downstream bot commands (like `!imgur` or attachment viewers) can fetch this local URL just like any normal internet URL.
- Decrypted attachments are cleaned automatically after **10 minutes** to preserve memory.

### 3. Smart Attachment Cache (`_msgAttachCache`)
In traditional chats, replying to a message with a photo echoes the photo's details in the message reply object. In E2EE chats, Facebook's protocol only returns `{ messageId, senderId, text }` in the `replyTo` payload—attachment metadata is omitted!
- To prevent bot commands from crashing with `"Cannot read properties of undefined"` when replying to a photo, our library implements **Smart Attachment Caching**.
- Every incoming message's decrypted attachments are cached in a temporary map under their `messageID` for **30 minutes**.
- When a reply event comes in, the library automatically resolves the original `messageID` in the cache, retrieves the decrypted attachments, and binds them onto `event.messageReply.attachments`.
- It also supports a fallback parser that extracts media metadata directly from the native bridge's `replyTo` fields if the bot has restarted and the memory cache is empty.

---

## 🔀 JID Routing & Normalization

E2EE threads use specialized Jabber IDs (JIDs) rather than plain numeric Facebook user IDs (UIDs).

| Thread Type | Format | Internal Treatment |
| :--- | :--- | :--- |
| **Direct Message (DM)** | `123456789:0@msgr` | The numeric prefix is parsed, normalized to `123456789`, and exposed to your bot as `senderID`/`threadID`. |
| **E2EE Group Chat** | `9876543210:69@msgr` | Treated as a group JID. Supports GraphQL resolution of thread info and member lists under the hood. |
| **WhatsApp Linked E2EE** | `120363198@g.us` | WhatsApp-based E2EE groups. Handled via local participant tracking. |

### Mention Normalization
When users are mentioned in E2EE chats, the native protobuf contains mentions relative to character offsets. Our library maps these offsets to standard numeric UIDs, allowing your bot's mention-parsing logic to work perfectly without modifications!

---

## 🚀 Troubleshooting and Best Practices

1. **Persistent Device Keys (`e2ee.js` Device Cache)**:
   It is highly recommended to set `e2eeMemoryOnly: false` and configure a persistent `e2eeDevicePath` in your project config. This prevents your bot from registering a brand-new "E2EE device" with Facebook on every single restart, which can trigger security flags or spam alerts on your account.

2. **Dynamic Port Conflict**:
   The media decryption server uses `s.listen(0)` which instructs the operating system to allocate any currently free TCP port. This guarantees zero "Port already in use" errors.

3. **Memory Limits**:
   Since decrypted media is stored as RAM buffers inside `_mediaCache` for up to 10 minutes, running on extremely low-memory systems (e.g., 256MB free RAM containers) with high attachment volume can lead to garbage collector stress. Adjust your bot's garbage collection parameters if required.
