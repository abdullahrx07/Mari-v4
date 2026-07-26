# MARIA CHATBOT (v3)

<p align="center">
    <a href="https://github.com/rxabdullah007/Maria-v3">
        <img src="https://i.imgur.com/I0kvVfu.jpeg" alt="Logo" width="150" height="150">
    </a>
</p>

<h3 align="center">MARIA CHATBOT</h3>
<p align="center">
    An extremely powerful, highly-optimized Facebook Messenger Chatbot made by <b>rX Abdullah</b>. Built on Node.js (v20) and featuring modern database management, self-healing listeners, and automatic updating.
</p>

<p align="center">
	<img alt="size" src="https://img.shields.io/github/repo-size/rxabdullah007/Maria-v3.svg?style=flat-square&label=size">
	<img alt="code-version" src="https://img.shields.io/badge/dynamic/json?color=red&label=code%20version&prefix=v&query=%24.version&url=https%3A%2F%2Fraw.githubusercontent.com%2FmiraiPr0ject%2Fmiraiv2%2Fmaster%2Fpackage.json&style=flat-square">
    <a href="https://github.com/rxabdullah007/Maria-v3/commits"><img alt="commits" src="https://img.shields.io/github/commit-activity/m/rxabdullah007/Maria-v3.svg?label=commit&style=flat-square"></a>
</p>

---

## 🚀 Key Features

*   **Smart Chat AI & Talking**: Advanced natural conversations, interactive games, and automated responses.
*   **No Prefix System**: Automatic no-prefix matching command execution for authorized admins, alongside standard prefix commands (`!help`, `!song`, etc.) for users.
*   **Dual Database Integration**: Seamless support for MongoDB and SQLite persistent databases, with real-time automatic local configuration migrations (`thuebot.json`, `vip.json`, `vipMode.json`, and `userPrefix.json`) straight to MongoDB on boot.
*   **Global In-Memory Caching**: Implements `global.systemData` with async `get` and `set` operations to read/write persistent configurations with virtually zero latency.
*   **Connection Auditing & Thread Self-Healing**: Real-time connection capture auditing that detects message load spikes, intercepts execution errors, and wraps command listeners securely to avoid silent thread crashes.
*   **Automatic Self-Update System**:
    *   **Public GitHub Fork Tracking**: Monitors a configured public GitHub fork's `package.json` for version updates.
    *   **Togglable Auto-Updates**: Simple `enable: true/false` toggle to suit your deployment style.
    *   **Pull Request Hooking (Poll URL)**: If `githubPollUrl` is set, the bot sends an update notification POST/GET payload to the poll webhook (for automatic PR/merge processing) instead of directly overwriting files.
*   **Auto Cache Cleaning**: Scrapes, detects, and automatically cleans temporary `.png`, `.jpg`, `.mp4`, `.gif`, `.mp3`, and `.ttf` files to preserve disk space.
*   **150+ Built-in Commands**: Includes utility, administration, media downloaders, casino games, and system tools.

---

## 🌐 Hosting & Deployment Guide

This section explains how to host your bot on modern cloud hosting services. Because the bot starts an integrated **Express Server** on port `5000` (configurable), it satisfies the port-binding requirements of cloud platforms to stay alive 24/7 without timing out.

### 1. Host on Render (Recommended & Free)

[Render](https://render.com) is an excellent choice for hosting Node.js projects. Follow these steps to host your bot:

1.  **Fork this Repository**: Sign in to your GitHub account and fork this repository.
2.  **Create a New Web Service**:
    *   Log in to Render and click **New +** -> **Web Service**.
    *   Connect your GitHub account and select your forked repository.
3.  **Configure Web Service Settings**:
    *   **Name**: Choose a name for your bot.
    *   **Region**: Select the region closest to you.
    *   **Branch**: Select `main` (or your active branch).
    *   **Runtime**: Select `Node`.
    *   **Build Command**: `npm install`
    *   **Start Command**: `npm start`
4.  **Add Environment Variables**:
    Under the **Environment** tab, click **Add Environment Variable** to add your credentials and configurations safely:
    *   `PORT`: `5000` (Render will bind to this port automatically)
    *   `FB_EMAIL`: Your Facebook login email/username.
    *   `FB_PASSWORD`: Your Facebook login password.
    *   `OTPKEY`: Your Facebook account 2FA secret key (optional but highly recommended; used for automatic 2FA code generation).
    *   `MONGO_URI`: Your MongoDB database connection string (e.g., `mongodb+srv://...`).
    *   `GITHUB_FORK_URL`: Your public GitHub repository or fork URL (e.g., `https://github.com/username/repo`) to enable GitHub-based auto-updates.
    *   `GITHUB_POLL_URL`: (Optional) Your pull webhook/poll API URL if you want the bot to trigger PRs instead of self-updating.
5.  **Deploy**: Click **Deploy Web Service**. Render will install the dependencies and start your bot!

*Tip: To keep your free Render web service active without spinning down due to inactivity, use a free cron/ping tool (like [UptimeRobot](https://uptimerobot.com)) to ping your Render URL `https://your-app-name.onrender.com` every 5-10 minutes.*

---

### 2. Host on Koyeb / Zeabur / Railway

For platforms like Koyeb, Zeabur, or Railway:
1.  Connect your GitHub repository.
2.  Set the start command to `npm start` or `node index.js`.
3.  Set the port option to `5000` (or bind to the `PORT` env variable).
4.  Input environment variables as outlined above.

---

## ⚙️ Local Installation

If you want to run the bot on your local computer or VPS:

### 1. Requirements
*   **Node.js**: Node.js version **20.x** (or above).
*   **MongoDB**: An active MongoDB database (Atlas or local instance).

### 2. Setup Steps

1.  **Clone the Repository**:
    ```bash
    git clone https://github.com/rxabdullah007/Maria-v3.git
    cd Maria-v3
    ```
2.  **Install Dependencies**:
    ```bash
    npm install
    ```
3.  **Configure the Bot**:
    *   Open `config.json` and configure your settings:
        *   Change `ADMINBOT` to contain your Facebook numerical UID.
        *   Input your MongoDB uri under `DATABASE.mongodb.uri`.
        *   Configure your GitHub auto-update settings inside the `autoUpdate` block:
            ```json
            "autoUpdate": {
                "enable": true,
                "githubForkUrl": "https://github.com/your-username/your-fork-repo",
                "githubPollUrl": ""
            }
            ```
4.  **Facebook Authentication**:
    *   Provide your Facebook `appstate.json` (cookies JSON) in the root directory.
    *   *Alternatively*, configure `acc.json` with your Facebook account `EMAIL` and `PASSWORD` (and `OTPKEY` if using 2FA).
5.  **Run the Bot**:
    ```bash
    npm start
    ```

---

## 📁 Project Structure

```
├── index.js               # Web server and bot launcher process
├── main.js                # Core bot thread and initialization
├── config.json            # Main configuration (Admins, prefixes, features)
├── utils/
│   ├── selfUpdate.js      # Auto-update client engine
│   └── rxLog.js           # Smart diagnostic logger
├── modules/
│   ├── commands/          # Bot action/command files (150+ commands)
│   └── events/            # Background event listeners
└── includes/
    ├── listen.js          # Message event router & healing wrapper
    └── database/          # MongoDB database models & loaders
```

---

## 👨‍💻 Owner Info

*   **Name**: RX Abdullah
*   **Born in**: Rajshahi, Bangladesh
*   **Lives in**: Mohammadpur, Dhaka, Bangladesh
*   **Hobbies**: Coding, Riding Bikes
*   **Fav Bike**: KTM RC
*   **Messenger**: [Message RX Abdullah](https://m.me/rxabdullah007)

---

## ⚖️ License

This project is licensed under the GNU General Public License v3.0 or later - see the [COPYING](./COPYING) file for details.

---

## 💚 Thanks for visiting!
Made with 💚 by **rX Abdullah**
