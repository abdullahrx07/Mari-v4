#!/usr/bin/env node
"use strict";

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * E2EE Test Bot - ST-FCA E2EE System (NEW - Proper Implementation)
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Uses the new Client class from lib/index.mjs directly
 * Properly initializes E2EE with device data and memory management
 */

const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────────
// § 1  DYNAMIC IMPORT FOR ESM
// ─────────────────────────────────────────────────────────────────────────────
async function importESM(specifier) {
    const dynamicImport = new Function('specifier', 'return import(specifier)');
    return dynamicImport(specifier);
}

// ─────────────────────────────────────────────────────────────────────────────
// § 1B MESSAGE HANDLER & COMMANDS
// ─────────────────────────────────────────────────────────────────────────────
async function handleMessage(client, event) {
    const PREFIX = '!';
    const body = (event.body || '').trim();

    // Only process messages that start with prefix
    if (!body.startsWith(PREFIX)) {
        return;
    }

    const withoutPrefix = body.slice(PREFIX.length).trim();
    const args = withoutPrefix.split(/\s+/);
    const cmd = (args.shift() || '').toLowerCase();

    console.log(`\n🎯 [command] /${cmd}`);
    console.log(`   Args: ${JSON.stringify(args)}`);
    console.log(`   From: ${event.senderID}`);
    console.log(`   Thread: ${event.threadID}\n`);

    try {
        switch (cmd) {
            case 'ping':
                await client.sendMessage(event.threadID, { body: '🏓 Pong! E2EE Bot is alive!' });
                console.log('✓ Sent: Pong response\n');
                break;

            case 'info':
                const infoMsg = `ℹ️ Message Info:
├─ Message ID: ${event.messageID || 'N/A'}
├─ Sender: ${event.senderID}
├─ Thread: ${event.threadID}
├─ Type: ${event.isGroup ? '👥 GROUP' : '👤 DM'}
└─ Time: ${new Date(event.timestamp || Date.now()).toLocaleString()}`;
                await client.sendMessage(event.threadID, { body: infoMsg });
                console.log('✓ Sent: Info message\n');
                break;

            case 'echo':
                const echoText = args.join(' ') || '(nothing to echo)';
                await client.sendMessage(event.threadID, { body: `🔊 Echo: ${echoText}` });
                console.log('✓ Sent: Echo message\n');
                break;

            case 'help':
                const helpMsg = `📋 E2EE Bot Commands:
├─ !ping     - Test bot response
├─ !info     - Show message info
├─ !echo <text> - Echo text back
├─ !help     - Show this help
└─ Any other message starting with ! will be echoed

🔐 Supports both E2EE and standard messages!`;
                await client.sendMessage(event.threadID, { body: helpMsg });
                console.log('✓ Sent: Help message\n');
                break;

            default:
                await client.sendMessage(event.threadID, { body: `❓ Unknown command: !${cmd}\nTry !help for available commands` });
                console.log(`✓ Sent: Unknown command response\n`);
        }
    } catch (err) {
        console.error(`✗ Error sending message: ${err.message}\n`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// § 2  LOAD & PARSE COOKIES
// ─────────────────────────────────────────────────────────────────────────────
function loadCookies(cookiePath = './cookie.txt') {
    if (!fs.existsSync(cookiePath)) {
        throw new Error(`Cookie file not found: ${cookiePath}`);
    }

    const raw = fs.readFileSync(cookiePath, 'utf8').trim();
    
    // Try JSON array format (from Netscape export)
    try {
        const data = JSON.parse(raw);
        if (Array.isArray(data) && data.length > 0) {
            console.log(`[COOKIES] ✓ Loaded ${data.length} cookies from JSON`);
            return data;
        }
    } catch (e) {
        // Not JSON, continue to other formats
    }

    throw new Error(`Invalid cookie format in ${cookiePath}`);
}

// Convert FCA appState to ESM Client cookie format
function convertCookiesToClientFormat(appStateCookies) {
    const cookieMap = {};
    
    for (const cookie of appStateCookies) {
        const key = cookie.key || cookie.name;
        const value = cookie.value;
        if (key && value) {
            cookieMap[key] = value;
        }
    }

    console.log(`[COOKIES] Converted to client format`);
    return cookieMap;
}

// ─────────────────────────────────────────────────────────────────────────────
// § 3  LOAD CONFIG & SETUP
// ─────────────────────────────────────────────────────────────────────────────
function loadConfig(configPath = './config.json') {
    try {
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            console.log(`[CONFIG] ✓ Loaded from ${configPath}`);
            return config;
        }
    } catch (e) {
        console.warn(`[CONFIG] ⚠ Could not load config: ${e.message}`);
    }
    return {};
}

// ─────────────────────────────────────────────────────────────────────────────
// § 4  DEVICE DATA MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────
function loadDeviceData(deviceDataPath = './e2ee_device.json') {
    try {
        if (fs.existsSync(deviceDataPath)) {
            const data = JSON.parse(fs.readFileSync(deviceDataPath, 'utf8'));
            console.log(`[DEVICE] ✓ Loaded device data from ${deviceDataPath}`);
            return data;
        }
    } catch (e) {
        console.warn(`[DEVICE] ⚠ Could not load device data: ${e.message}`);
    }
    return null;
}

function saveDeviceData(deviceData, deviceDataPath = './e2ee_device.json') {
    try {
        fs.writeFileSync(deviceDataPath, JSON.stringify(deviceData, null, 2), 'utf8');
        console.log(`[DEVICE] ✓ Saved device data`);
    } catch (e) {
        console.error(`[DEVICE] ✗ Failed to save device data: ${e.message}`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// § 5  MAIN BOT
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║         ST-FCA E2EE Test Bot (NEW Implementation)       ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    try {
        // ── Load cookies and config ────────────────────────────────────────
        console.log('[SETUP] Loading configuration...');
        
        const appStateCookies = loadCookies(path.join(process.cwd(), 'cookie.txt'));
        const clientCookies = convertCookiesToClientFormat(appStateCookies);
        const config = loadConfig(path.join(process.cwd(), 'config.json'));
        const deviceData = loadDeviceData(path.join(process.cwd(), 'e2ee_device.json'));

        // Verify required cookies
        if (!clientCookies.c_user) {
            throw new Error('Missing c_user cookie - login might have failed');
        }
        if (!clientCookies.xs) {
            throw new Error('Missing xs cookie - login might have failed');
        }

        console.log(`[COOKIES] Required cookies present: c_user=${clientCookies.c_user.slice(0, 6)}...`);

        // ── Load ESM Client class ──────────────────────────────────────────
        console.log('[E2EE] Loading Messagix client library...');
        const libPath = path.join(__dirname, 'lib', 'index.mjs');
        const libUrl = new (require('url').URL)('file:' + libPath).href;
        
        let ClientClass;
        try {
            const mod = await importESM(libUrl);
            ClientClass = mod.Client;
            if (!ClientClass) {
                throw new Error('Client class not exported from lib/index.mjs');
            }
            console.log('[E2EE] ✓ Messagix client loaded successfully');
        } catch (err) {
            throw new Error(`Failed to load E2EE client: ${err.message}`);
        }

        // ── Create and connect client ──────────────────────────────────────
        console.log('[E2EE] Creating client instance with E2EE enabled...');
        
        const clientOptions = {
            enableE2EE: true,
            autoReconnect: true,
            e2eeMemoryOnly: true,
            logLevel: 'none',
            // Load device data if available for session persistence
            ...(deviceData && { deviceData })
        };

        const client = new ClientClass(clientCookies, clientOptions);
        
        // ── Setup event listeners ──────────────────────────────────────────
        console.log('[E2EE] Setting up event listeners...\n');

        client.on('ready', (payload) => {
            console.log('📡 [ready] Client socket ready');
            console.log(`   User ID: ${client.currentUserId}`);
        });

        client.on('fullyReady', () => {
            console.log('✅ [fullyReady] E2EE fully initialized - ready to send/receive encrypted messages\n');
        });

        client.on('e2eeConnected', () => {
            console.log('🔐 [e2eeConnected] E2EE encryption bridge connected\n');
        });

        // ── E2EE Message Event ────────────────────────────────────────────
        client.on('e2eeMessage', (event) => {
            console.log('\n═══════════════════════════════════════════════════════');
            console.log('🔐 [e2eeMessage] E2EE Encrypted Message Received');
            console.log('═══════════════════════════════════════════════════════');
            console.log('Raw Event:');
            console.log(JSON.stringify(event, null, 2));
            console.log('═══════════════════════════════════════════════════════\n');

            // Handle E2EE commands with ! prefix
            handleMessage(client, event);
        });

        // ── E2EE Reaction Event ───────────────────────────────────────────
        client.on('e2eeReaction', (event) => {
            console.log('\n═══════════════════════════════════════════════════════');
            console.log('🔐 [e2eeReaction] E2EE Reaction Received');
            console.log('═══════════════════════════════════════════════════════');
            console.log('Raw Event:');
            console.log(JSON.stringify(event, null, 2));
            console.log('═══════════════════════════════════════════════════════\n');
        });

        client.on('deviceDataChanged', (eventData) => {
            console.log('🔑 [deviceDataChanged] Device keys updated');
            if (eventData && eventData.deviceData) {
                saveDeviceData(eventData.deviceData);
            }
        });

        client.on('message', (event) => {
            console.log('\n═══════════════════════════════════════════════════════');
            console.log('📨 [message] Standard Message Received');
            console.log('═══════════════════════════════════════════════════════');
            console.log('Raw Event:');
            console.log(JSON.stringify(event, null, 2));
            console.log('═══════════════════════════════════════════════════════\n');

            // Handle commands with ! prefix
            handleMessage(client, event);
        });

        client.on('error', (err) => {
            console.error('❌ [error] E2EE Error:', err.message || err);
        });

        client.on('disconnected', (info) => {
            console.warn('⚠️  [disconnected] Connection lost:', info);
        });

        // ── Connect ────────────────────────────────────────────────────────
        console.log('[CONNECT] Connecting to Messenger...');
        try {
            const result = await client.connect();
            console.log(`✓ Connected as: ${result.user.name} (${result.user.id})\n`);

            // ── E2EE Connect ───────────────────────────────────────────────
            console.log('[E2EE] Connecting E2EE encryption...');
            try {
                await client.connectE2EE();
                console.log('✓ E2EE connection initiated (async process)\n');
            } catch (err) {
                console.warn(`⚠ E2EE connection warning: ${err.message}`);
            }

            // Get device data after connection
            try {
                const devData = await client.getDeviceData();
                if (devData) {
                    console.log('✓ Device data initialized');
                    saveDeviceData(devData);
                }
            } catch (err) {
                console.warn(`⚠ Could not get device data: ${err.message}`);
            }

        } catch (err) {
            throw new Error(`Connection failed: ${err.message}`);
        }

        // ── Ready message ──────────────────────────────────────────────────
        await new Promise(resolve => setTimeout(resolve, 2000));
        console.log('─'.repeat(60));
        console.log('🚀 Bot is ready! Listening for E2EE and standard messages...\n');
        console.log('   Features:');
        console.log('   ✓ Receive E2EE encrypted messages');
        console.log('   ✓ Receive standard messages');
        console.log('   ✓ Auto-reconnection enabled');
        console.log('   ✓ Device persistence enabled\n');
        console.log('Press Ctrl+C to stop\n');
        console.log('─'.repeat(60) + '\n');

    } catch (err) {
        console.error('\n❌ FATAL ERROR:');
        console.error('   ' + err.message);
        console.error('\nTroubleshooting:');
        console.error('   1. Ensure cookie.txt exists and contains valid Facebook cookies');
        console.error('   2. Check that c_user and xs cookies are present');
        console.error('   3. Verify config.json exists with proper E2EE settings');
        console.error('   4. Run: npm install (to ensure all dependencies are installed)');
        console.error('   5. Run: npm run build:go (to build native messagix library)\n');
        process.exit(1);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// § 6  GRACEFUL SHUTDOWN
// ─────────────────────────────────────────────────────────────────────────────
process.on('SIGINT', () => {
    console.log('\n\n👋 Shutting down gracefully...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n💥 Force shutdown');
    process.exit(1);
});

process.on('uncaughtException', (err) => {
    console.error('💥 Uncaught Exception:', err);
    process.exit(1);
});

// ─────────────────────────────────────────────────────────────────────────────
// § 7  RUN
// ─────────────────────────────────────────────────────────────────────────────
main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
