/* eslint-disable no-redeclare */
"use strict";
var utils = require("../utils");
var log = require("npmlog");
var mqtt = require('mqtt');
var WebSocket = require('ws');
var Transform = require('stream').Transform;
const EventEmitter = require('events');
var e2eeBridge = require("../e2ee/e2ee");
var fs = require('fs');

// Writes the current (freshly-refreshed) appState to disk, if the user
// configured `appStateFile` in globalOptions. Best-effort: never throws,
// only logs a warning on failure so it can't take down the reconnect flow.
function persistAppStateIfConfigured(ctx, api, tag) {
    try {
        if (!ctx.globalOptions || !ctx.globalOptions.appStateFile) return;
        if (typeof api.getAppState !== "function") return;
        var freshAppState = api.getAppState();
        if (!freshAppState) return;
        fs.writeFile(ctx.globalOptions.appStateFile, JSON.stringify(freshAppState, null, 2), function (err) {
            if (err) {
                log.warn(tag || "listenMqtt", "Failed to persist appState to disk: " + err.message);
            } else {
                log.info(tag || "listenMqtt", "appState written to " + ctx.globalOptions.appStateFile);
            }
        });
    } catch (e) {
        log.warn(tag || "listenMqtt", "Failed to persist appState to disk: " + (e && e.message ? e.message : e));
    }
}

// ─── Connect-sequence logging (spinner / banner / e2ee bridge frames) ─────────
// Extracted into extra/connectionFrame.js — this file just calls into it.
// ─── Duplicate-event guard ───────────────────────────────────────────────────
// Facebook sometimes sends the same event (same threadID + messageID) 2-3
// times in quick succession. Wrapping globalCallback with this guard lets the
// first occurrence through and skips the rest (logged with [ MARI -FCA ]).
var eventGuard = require("../extra/monitor/eventGuard");

var connFrame = require("../extra/connectionFrame");
var startMqttSpinner   = connFrame.startMqttSpinner;
var stopMqttSpinner    = connFrame.stopMqttSpinner;
var printMqttBanner    = connFrame.printMqttBanner;
var printE2EEConnecting = connFrame.printE2EEConnecting;
var printE2EEConnected  = connFrame.printE2EEConnected;
var printE2EEError      = connFrame.printE2EEError;
var printConnectionDropped = connFrame.printConnectionDropped;
var printSessionRefreshing = connFrame.printSessionRefreshing;
var printReconnectError    = connFrame.printReconnectError;
var printRetrying          = connFrame.printRetrying;
var printPersistentRetry   = connFrame.printPersistentRetry;

/**
 * Facebook sends non-standard MQTT packets where PUBACK/SUBACK have
 * non-zero reserved flag bits (e.g. 0x4F instead of 0x40).
 * mqtt-packet strictly rejects these. This transform stream patches
 * the first byte of each MQTT frame to clear the lower nibble (flags),
 * keeping only the packet type (upper nibble).
 *
 * MQTT fixed header: byte[0] = (type << 4) | flags
 * For PUBACK (type=4): valid = 0x40, FB may send 0x4F → we clear to 0x40
 */
function createMqttPatchStream() {
    var buf = null;

    // Walk frame by frame. For types that must have flags=0 per the MQTT spec
    // (CONNACK=2, PUBACK=4, SUBACK=9, UNSUBACK=11, PINGRESP=13), clear the
    // lower nibble that Facebook sets to non-zero values.
    var stream = new Transform({
        transform: function (chunk, encoding, callback) {
            if (!Buffer.isBuffer(chunk)) chunk = Buffer.from(chunk, encoding);

            // Prepend any leftover bytes from the previous chunk
            var out;
            if (buf) {
                out = Buffer.concat([buf, chunk]);
                buf = null;
            } else {
                out = Buffer.from(chunk);
            }

            var i = 0;
            while (i < out.length) {
                var b = out[i];
                var type = (b >> 4) & 0x0F;
                var flags = b & 0x0F;
                // Types that MUST have flags=0:
                if (flags !== 0 && (type === 4 || type === 9 || type === 11 || type === 13 || type === 2)) {
                    out[i] = (b & 0xF0); // clear lower nibble
                }
                // Skip past this frame: read the varint length
                i++;
                var multiplier = 1;
                var frameLen = 0;
                var lenOk = false;
                while (i < out.length) {
                    var lb = out[i++];
                    frameLen += (lb & 0x7F) * multiplier;
                    multiplier *= 128;
                    if ((lb & 0x80) === 0) { lenOk = true; break; }
                    if (multiplier > 128 * 128 * 128) break; // malformed
                }
                if (!lenOk) {
                    // Incomplete frame — save remainder for next chunk
                    buf = out.slice(i - 1);
                    out = out.slice(0, i - 1);
                    break;
                }
                i += frameLen;
            }

            callback(null, out);
        },
        flush: function (callback) {
            if (buf && buf.length > 0) callback(null, buf);
            else callback();
            buf = null;
        }
    });
    return stream;
}

var identity = function () { };
var form = {};
var getSeqID = function () { };
var refreshSessionAndReconnect = function () { };

var topics = [
    "/legacy_web",
    "/webrtc",
    "/rtc_multi",
    "/onevc",
    "/br_sr",
    "/sr_res",
    "/t_ms",
    "/thread_typing",
    "/orca_typing_notifications",
    "/notify_disconnect",
    "/orca_presence",
    "/inbox",
    "/mercury",
    "/messaging_events",
    "/orca_message_notifications",
    "/pp",
    "/webrtc_response",
    "/ls_resp"
];

function sanitizeHeaderValue(value) {
    if (value === null || value === undefined) return "";
    var str = String(value);
    if (str.trim().startsWith("[") && str.trim().endsWith("]")) {
        try {
            var parsed = JSON.parse(str);
            if (Array.isArray(parsed)) return "";
        } catch (_) { }
    }
    str = str.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F\r\n\[\]]/g, "").trim();
    return str;
}

function listenMqtt(defaultFuncs, api, ctx, globalCallback) {
    var chatOn = ctx.globalOptions.online;
    var foreground = false;
    var sessionID = Math.floor(Math.random() * 9007199254740991) + 1;
    var GUID = utils.getGUID();

    var username = {
        u: ctx.userID,
        s: sessionID,
        chat_on: chatOn,
        fg: foreground,
        d: GUID,
        ct: 'websocket',
        aid: '219994525426954',
        aids: null,
        mqtt_sid: '',
        cp: 3,
        ecp: 10,
        st: [],
        pm: [],
        dc: '',
        no_auto_fg: true,
        gas: null,
        pack: [],
        p: null,
        php_override: ""
    };

    var cookies = ctx.jar.getCookies("https://www.facebook.com").join("; ");
    var host;
    if (ctx.mqttEndpoint) {
        // Ensure no duplicate sid/cid — strip any existing ones then append fresh
        var baseEndpoint = ctx.mqttEndpoint
            .replace(/[?&]sid=[^&]*/g, '')
            .replace(/[?&]cid=[^&]*/g, '');
        // Re-attach the ? if it was stripped along with the first param
        if (baseEndpoint.indexOf('?') === -1 && ctx.mqttEndpoint.indexOf('?') !== -1) {
            baseEndpoint = baseEndpoint.replace(/&/, '?');
        }
        var sep = baseEndpoint.indexOf('?') === -1 ? '?' : '&';
        host = baseEndpoint + sep + "sid=" + sessionID + "&cid=" + GUID;
    } else if (ctx.region) {
        host = "wss://edge-chat.facebook.com/chat?region=" + ctx.region.toLowerCase() + "&sid=" + sessionID + "&cid=" + GUID;
    } else {
        host = "wss://edge-chat.facebook.com/chat?sid=" + sessionID + "&cid=" + GUID;
    }

    var ua = ctx.globalOptions.userAgent ||
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

    // Determine correct Client Hints based on active User-Agent for WebSocket
    var platform = '"Windows"';
    var secChUa = '"Chromium";v="125", "Not.A/Brand";v="24", "Google Chrome";v="125"';

    if (ua.includes("Macintosh") || ua.includes("Mac OS X")) {
        platform = '"macOS"';
        if (ua.includes("Safari") && !ua.includes("Chrome") && !ua.includes("Chromium")) {
            secChUa = '"Safari";v="18", "Not;A=Brand";v="24"';
        } else {
            secChUa = '"Chromium";v="125", "Not.A/Brand";v="24", "Google Chrome";v="125"';
        }
    } else if (ua.includes("Linux")) {
        platform = '"Linux"';
        secChUa = '"Chromium";v="125", "Not.A/Brand";v="24", "Google Chrome";v="125"';
    } else if (ua.includes("iPhone") || ua.includes("iPad")) {
        platform = '"iOS"';
        secChUa = '"Safari";v="18", "Not;A=Brand";v="24"';
    } else if (ua.includes("Android")) {
        platform = '"Android"';
        secChUa = '"Chromium";v="125", "Not.A/Brand";v="24", "Google Chrome";v="125"';
    } else {
        var chromeVersionMatch = ua.match(/Chrome\/(\d+)/);
        if (chromeVersionMatch) {
            var ver = chromeVersionMatch[1];
            secChUa = '"Chromium";v="' + ver + '", "Not;A/Brand";v="24", "Google Chrome";v="' + ver + '"';
        }
    }

    var wsHeaders = {
        Cookie: sanitizeHeaderValue(cookies),
        Origin: "https://www.facebook.com",
        "User-Agent": sanitizeHeaderValue(ua),
        Referer: "https://www.facebook.com/",
        Host: "edge-chat.facebook.com",
        Connection: "Upgrade",
        Upgrade: "websocket",
        "Sec-WebSocket-Version": "13",
        "Sec-WebSocket-Extensions": "permessage-deflate; client_max_window_bits",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate",
        "sec-ch-ua": secChUa,
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": platform,
        "Cache-Control": "no-cache",
        Pragma: "no-cache"
    };

    if (ctx.region) wsHeaders["X-MSGR-Region"] = sanitizeHeaderValue(ctx.region);

    var wsOptions = {
        headers: wsHeaders,
        origin: "https://www.facebook.com",
        protocolVersion: 13,
        binaryType: "arraybuffer"
    };

    if (typeof ctx.globalOptions.proxy !== "undefined") {
        var { HttpsProxyAgent } = require('https-proxy-agent');
        wsOptions.agent = new HttpsProxyAgent(ctx.globalOptions.proxy);
    }

    var mqttOptions = {
        clientId: "mqttwsclient",
        protocolId: "MQIsdp",
        protocolVersion: 3,
        username: JSON.stringify(username),
        clean: true,
        keepalive: 30,
        reschedulePings: true,
        reconnectPeriod: 0,
        connectTimeout: 20000
    };

    // Use MqttClient with a proper Duplex:
    //   Write side: mqtt → duplex.write → wsStream.write → WebSocket (send to FB)
    //   Read side:  WebSocket msg → wsStream readable → patcher (fix FB header bits) → duplex.push → mqtt reads
    function buildStream() {
        var Duplex = require('stream').Duplex;
        var ws = new WebSocket(host, wsOptions);
        ws.on('error', function () { }); // suppress unhandled ws errors

        var wsStream = WebSocket.createWebSocketStream(ws, { objectMode: false });
        var patcher = createMqttPatchStream();

        // Wire: wsStream readable → patcher → push into duplex
        wsStream.pipe(patcher);

        var duplex = new Duplex({
            read: function () { },
            write: function (chunk, enc, cb) {
                wsStream.write(chunk, enc, cb);
            },
            final: function (cb) {
                wsStream.end(cb);
            },
            destroy: function (err, cb) {
                try { wsStream.destroy(err); } catch (_) { }
                try {
                    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                        ws.terminate();
                    }
                } catch (_) { }
                cb(err);
            }
        });

        patcher.on('data', function (data) {
            ctx.lastMqttActivity = Date.now();
            if (!duplex.destroyed) duplex.push(data);
        });
        patcher.on('end', function () {
            if (!duplex.destroyed) duplex.push(null);
        });
        patcher.on('error', function (e) {
            if (!duplex.destroyed) duplex.destroy(e);
        });
        wsStream.on('error', function (e) {
            if (!duplex.destroyed) duplex.destroy(e);
        });

        return duplex;
    }

    startMqttSpinner(ctx.region);

    ctx.mqttClient = new mqtt.MqttClient(buildStream, mqttOptions);
    global.mqttClient = ctx.mqttClient;

    var mqttClient = ctx.mqttClient;

    var _reconnecting = false;

    mqttClient.on('error', function (err) {
        if (_reconnecting) return;
        _reconnecting = true;
        stopMqttSpinner();
        printReconnectError("MQTT connection error", err);
        try { mqttClient.end(true); } catch (_) { }
        if (ctx.globalOptions.autoReconnect) {
            setTimeout(function () { refreshSessionAndReconnect(); }, 1000);
        } else {
            globalCallback({ type: "stop_listen", error: "Connection refused: Server unavailable" }, null);
        }
    });
    function _handleDrop(reason) {
        if (_reconnecting) return; // avoid double-reconnect if error + close both fire
        _reconnecting = true;
        stopMqttSpinner();
        printConnectionDropped(reason);
        try { mqttClient.end(true); } catch (_) { }
        if (ctx.globalOptions.autoReconnect) {
            setTimeout(function () { refreshSessionAndReconnect(); }, 1000);
        } else {
            globalCallback({ type: "stop_listen", error: "Connection lost: " + reason }, null);
        }
    }

    mqttClient.on('close', function () { _handleDrop("close"); });
    mqttClient.on('offline', function () { _handleDrop("offline"); });
    mqttClient.on('reconnect', function () { });

    mqttClient.on('connect', function () {
        topics.forEach(function (topic) { mqttClient.subscribe(topic); });

        printMqttBanner(ctx.region, ctx.globalOptions.autoReconnect);

        var topic;
        var queue = {
            sync_api_version: 10,
            max_deltas_able_to_process: 1000,
            delta_batch_size: 500,
            encoding: "JSON",
            entity_fbid: ctx.userID,
        };

        if (ctx.syncToken) {
            topic = "/messenger_sync_get_diffs";
            queue.last_seq_id = ctx.lastSeqId;
            queue.sync_token = ctx.syncToken;
        } else {
            topic = "/messenger_sync_create_queue";
            queue.initial_titan_sequence_id = ctx.lastSeqId;
            queue.device_params = null;
        }

        mqttClient.publish(topic, JSON.stringify(queue), { qos: 1, retain: false });

        var rTimeout = setTimeout(function () {
            mqttClient.end();
            getSeqID();
        }, 5000);

        ctx.tmsWait = function () {
            clearTimeout(rTimeout);
            if (ctx.globalOptions.emitReady) globalCallback({ type: "ready", error: null });
            delete ctx.tmsWait;

            // ── E2EE bridge init ──────────────────────────────────────────────────
            ctx._globalCallback = globalCallback;
            if (ctx.globalOptions.enableE2EE === true) {
                var bridge = e2eeBridge.createBridge(ctx);
                if (global.GoatBot) global.GoatBot._e2eeBridge = bridge;
                printE2EEConnecting();
                bridge.connect(function (err, msg) {
                    if (err && !bridge._e2eeConnected) {
                        printE2EEError('E2EE Bridge error', err);
                    } else if (!bridge._e2eeConnected) {
                        bridge._e2eeConnected = true;
                        printE2EEConnected();
                    }
                    globalCallback(err, msg);
                }).catch(function (err) {
                    printE2EEError('E2EE Bridge connect error', err);
                });
            } else {
                if (global.GoatBot) global.GoatBot._e2eeBridge = null;
            }
            // ── end E2EE bridge init ──────────────────────────────────────────────
        };
    });

    mqttClient.on('message', function (topic, message) {
        ctx.lastMqttActivity = Date.now();
        var gc = eventGuard.wrap(globalCallback);
        try {
            var jsonMessage;
            try {
                jsonMessage = JSON.parse(message.toString());
            } catch (ex) {
                return log.error("listenMqtt", ex);
            }

            if (topic === "/t_ms") {
                if (ctx.tmsWait && typeof ctx.tmsWait === "function") ctx.tmsWait();

                if (jsonMessage.firstDeltaSeqId && jsonMessage.syncToken) {
                    ctx.lastSeqId = jsonMessage.firstDeltaSeqId;
                    ctx.syncToken = jsonMessage.syncToken;
                }

                if (jsonMessage.lastIssuedSeqId) ctx.lastSeqId = parseInt(jsonMessage.lastIssuedSeqId);

                for (var i in jsonMessage.deltas) {
                    var delta = jsonMessage.deltas[i];
                    try {
                        parseDelta(defaultFuncs, api, ctx, gc, { "delta": delta });
                    } catch (deltaErr) {
                        log.error("parseDelta", "Error parsing delta: " + (deltaErr.message || deltaErr));
                    }
                }
            } else if (topic === "/thread_typing" || topic === "/orca_typing_notifications") {
                var typ = {
                    type: "typ",
                    isTyping: !!jsonMessage.state,
                    from: jsonMessage.sender_fbid.toString(),
                    threadID: utils.formatID((jsonMessage.thread || jsonMessage.sender_fbid).toString())
                };
                (function () { gc(null, typ); })();
            } else if (topic === "/orca_presence") {
                if (!ctx.globalOptions.updatePresence) {
                    for (var i in jsonMessage.list) {
                        try {
                            var data = jsonMessage.list[i];
                            var presence = {
                                type: "presence",
                                userID: data["u"].toString(),
                                timestamp: data["l"] * 1000,
                                statuses: data["p"]
                            };
                            (function () { gc(null, presence); })();
                        } catch (presenceErr) {
                            log.error("listenMqtt", "Error parsing presence data: " + (presenceErr.message || presenceErr));
                        }
                    }
                }
            }
        } catch (globalMsgErr) {
            log.error("listenMqtt", "Unexpected error in MQTT message handler: " + (globalMsgErr.message || globalMsgErr));
        }
    });

    mqttClient.on('close', function () { });
}

function attachImageUrlToAttachment(api, attachment) {
    if (!attachment || attachment.type !== "photo" || !attachment.url) return;
    if (api && api._imgUpload) {
        api._imgUpload(attachment.url).then(function (url) {
            if (url) attachment.imgUrl = url;
        }).catch(function () { });
    }
}

function parseDelta(defaultFuncs, api, ctx, globalCallback, v) {
    if (v.delta.class == "NewMessage") {
        if (ctx.globalOptions.pageID && ctx.globalOptions.pageID != v.queue) return;

        (function resolveAttachmentUrl(i) {
            if (i == (v.delta.attachments || []).length) {
                var fmtMsg;
                try {
                    fmtMsg = utils.formatDeltaMessage(v);
                    var otherUserFbId = v.delta.messageMetadata.threadKey.otherUserFbId;
                    var threadFbId = v.delta.messageMetadata.threadKey.threadFbId;
                    fmtMsg.isSingleUser = !!otherUserFbId && !threadFbId;
                    fmtMsg.isGroup = !!threadFbId;
                    if (!ctx.threadTypes) ctx.threadTypes = {};
                    ctx.threadTypes[fmtMsg.threadID] = fmtMsg.isSingleUser ? 'dm' : 'group';
                    if (fmtMsg.attachments && Array.isArray(fmtMsg.attachments)) {
                        fmtMsg.attachments.forEach(function (att) { attachImageUrlToAttachment(api, att); });
                    }
                } catch (err) {
                    return globalCallback({ error: "Problem parsing message object.", detail: err, res: v, type: "parse_error" });
                }
                if (fmtMsg && ctx.globalOptions.autoMarkDelivery) {
                    markDelivery(ctx, api, fmtMsg.threadID, fmtMsg.messageID);
                }
                return !ctx.globalOptions.selfListen &&
                    (fmtMsg.senderID === ctx.i_userID || fmtMsg.senderID === ctx.userID) ?
                    undefined :
                    (function () { globalCallback(null, fmtMsg); })();
            } else {
                if (v.delta.attachments[i].mercury.attach_type == "photo") {
                    api.resolvePhotoUrl(v.delta.attachments[i].fbid, function (err, url) {
                        if (!err) v.delta.attachments[i].mercury.metadata.url = url;
                        return resolveAttachmentUrl(i + 1);
                    });
                } else {
                    return resolveAttachmentUrl(i + 1);
                }
            }
        })(0);
    }

    if (v.delta.class == "ClientPayload") {
        var clientPayload = utils.decodeClientPayload(v.delta.payload);
        if (clientPayload && clientPayload.deltas) {
            for (var i in clientPayload.deltas) {
                var delta = clientPayload.deltas[i];
                if (delta.deltaMessageReaction && !!ctx.globalOptions.listenEvents) {
                    (function () {
                        globalCallback(null, {
                            type: "message_reaction",
                            threadID: (delta.deltaMessageReaction.threadKey.threadFbId ? delta.deltaMessageReaction.threadKey.threadFbId : delta.deltaMessageReaction.threadKey.otherUserFbId).toString(),
                            messageID: delta.deltaMessageReaction.messageId,
                            reaction: delta.deltaMessageReaction.reaction,
                            senderID: delta.deltaMessageReaction.senderId.toString(),
                            userID: delta.deltaMessageReaction.userId.toString()
                        });
                    })();
                } else if (delta.deltaRecallMessageData && !!ctx.globalOptions.listenEvents) {
                    (function () {
                        globalCallback(null, {
                            type: "message_unsend",
                            threadID: (delta.deltaRecallMessageData.threadKey.threadFbId ? delta.deltaRecallMessageData.threadKey.threadFbId : delta.deltaRecallMessageData.threadKey.otherUserFbId).toString(),
                            messageID: delta.deltaRecallMessageData.messageID,
                            senderID: delta.deltaRecallMessageData.senderID.toString(),
                            deletionTimestamp: delta.deltaRecallMessageData.deletionTimestamp,
                            timestamp: delta.deltaRecallMessageData.timestamp
                        });
                    })();
                } else if (delta.deltaMessageReply) {
                    var mdata = delta.deltaMessageReply.message === undefined ? [] :
                        delta.deltaMessageReply.message.data === undefined ? [] :
                            delta.deltaMessageReply.message.data.prng === undefined ? [] :
                                JSON.parse(delta.deltaMessageReply.message.data.prng);
                    var m_id = mdata.map(function (u) { return u.i; });
                    var m_offset = mdata.map(function (u) { return u.o; });
                    var m_length = mdata.map(function (u) { return u.l; });
                    var m_type = mdata.map(function (u) { return u.t || "p"; });
                    var mentions = {};
                    var mentionTypes = {};
                    var hasMentionEveryone = false;
                    var hasMentionHere = false;
                    for (var i = 0; i < m_id.length; i++) {
                        mentions[m_id[i]] = (delta.deltaMessageReply.message.body || "").substring(m_offset[i], m_offset[i] + m_length[i]);
                        mentionTypes[m_id[i]] = m_type[i];
                        if (m_type[i] === "t") hasMentionEveryone = true;
                        if (m_type[i] === "a") hasMentionHere = true;
                    }

                    var callbackToReturn = {
                        type: "message_reply",
                        threadID: (delta.deltaMessageReply.message.messageMetadata.threadKey.threadFbId ? delta.deltaMessageReply.message.messageMetadata.threadKey.threadFbId : delta.deltaMessageReply.message.messageMetadata.threadKey.otherUserFbId).toString(),
                        messageID: delta.deltaMessageReply.message.messageMetadata.messageId,
                        senderID: delta.deltaMessageReply.message.messageMetadata.actorFbId.toString(),
                        attachments: (delta.deltaMessageReply.message.attachments || []).map(function (att) {
                            try {
                                if (att && att.mercuryJSON) {
                                    var mercury = JSON.parse(att.mercuryJSON);
                                    Object.assign(att, mercury);
                                }
                            } catch (_) {}
                            return att;
                        }).map(function (att) {
                            var x;
                            try { x = utils._formatAttachment(att); }
                            catch (ex) { x = att; x.error = ex; x.type = "unknown"; }
                            return x;
                        }),
                        args: (delta.deltaMessageReply.message.body || "").trim().split(/\s+/),
                        body: (delta.deltaMessageReply.message.body || ""),
                        isGroup: !!delta.deltaMessageReply.message.messageMetadata.threadKey.threadFbId,
                        mentions: mentions,
                        mentionTypes: mentionTypes,
                        mentionedIDs: m_id.map(String),         // ["userId1", "userId2", ...]
                        hasMentionEveryone: hasMentionEveryone,
                        hasMentionHere: hasMentionHere,
                        timestamp: delta.deltaMessageReply.message.messageMetadata.timestamp,
                        participantIDs: (delta.deltaMessageReply.message.messageMetadata.cid.canonicalParticipantFbids || delta.deltaMessageReply.message.participants || []).map(function (e) { return e.toString(); })
                    };

                    if (callbackToReturn.attachments && Array.isArray(callbackToReturn.attachments)) {
                        callbackToReturn.attachments.forEach(function (att) { attachImageUrlToAttachment(api, att); });
                    }

                    if (delta.deltaMessageReply.repliedToMessage) {
                        mdata = delta.deltaMessageReply.repliedToMessage === undefined ? [] :
                            delta.deltaMessageReply.repliedToMessage.data === undefined ? [] :
                                delta.deltaMessageReply.repliedToMessage.data.prng === undefined ? [] :
                                    JSON.parse(delta.deltaMessageReply.repliedToMessage.data.prng);
                        m_id = mdata.map(function (u) { return u.i; });
                        m_offset = mdata.map(function (u) { return u.o; });
                        m_length = mdata.map(function (u) { return u.l; });
                        var rm_type = mdata.map(function (u) { return u.t || "p"; });
                        var rmentions = {};
                        var rmentionTypes = {};
                        for (var i = 0; i < m_id.length; i++) {
                            rmentions[m_id[i]] = (delta.deltaMessageReply.repliedToMessage.body || "").substring(m_offset[i], m_offset[i] + m_length[i]);
                            rmentionTypes[m_id[i]] = rm_type[i];
                        }

                        callbackToReturn.messageReply = {
                            threadID: (delta.deltaMessageReply.repliedToMessage.messageMetadata.threadKey.threadFbId ? delta.deltaMessageReply.repliedToMessage.messageMetadata.threadKey.threadFbId : delta.deltaMessageReply.repliedToMessage.messageMetadata.threadKey.otherUserFbId).toString(),
                            messageID: delta.deltaMessageReply.repliedToMessage.messageMetadata.messageId,
                            senderID: delta.deltaMessageReply.repliedToMessage.messageMetadata.actorFbId.toString(),
                            attachments: (delta.deltaMessageReply.repliedToMessage.attachments || []).map(function (att) {
                                try {
                                    if (att && att.mercuryJSON) {
                                        var mercury = JSON.parse(att.mercuryJSON);
                                        Object.assign(att, mercury);
                                    }
                                } catch (_) {}
                                return att;
                            }).map(function (att) {
                                var x;
                                try { x = utils._formatAttachment(att); }
                                catch (ex) { x = att; x.error = ex; x.type = "unknown"; }
                                attachImageUrlToAttachment(api, x);
                                return x;
                            }),
                            args: (delta.deltaMessageReply.repliedToMessage.body || "").trim().split(/\s+/),
                            body: delta.deltaMessageReply.repliedToMessage.body || "",
                            isGroup: !!delta.deltaMessageReply.repliedToMessage.messageMetadata.threadKey.threadFbId,
                            mentions: rmentions,
                            mentionTypes: rmentionTypes, // NEW: mention types for replied-to message
                            timestamp: delta.deltaMessageReply.repliedToMessage.messageMetadata.timestamp
                        };
                    } else if (delta.deltaMessageReply.replyToMessageId) {
                        return defaultFuncs
                            .post("https://www.facebook.com/api/graphqlbatch/", ctx.jar, {
                                "av": ctx.globalOptions.pageID,
                                "queries": JSON.stringify({
                                    "o0": {
                                        "doc_id": "2848441488556444",
                                        "query_params": {
                                            "thread_and_message_id": {
                                                "thread_id": callbackToReturn.threadID,
                                                "message_id": delta.deltaMessageReply.replyToMessageId.id,
                                            }
                                        }
                                    }
                                })
                            })
                            .then(utils.parseAndCheckLogin(ctx, defaultFuncs))
                            .then(function (resData) {
                                if (resData[resData.length - 1].error_results > 0) throw resData[0].o0.errors;
                                if (resData[resData.length - 1].successful_results === 0) throw { error: "forcedFetch: there was no successful_results", res: resData };
                                var fetchData = resData[0].o0.data.message;
                                var mobj = {};
                                for (var n in fetchData.message.ranges) mobj[fetchData.message.ranges[n].entity.id] = (fetchData.message.text || "").substr(fetchData.message.ranges[n].offset, fetchData.message.ranges[n].length);
                                callbackToReturn.messageReply = {
                                    threadID: callbackToReturn.threadID,
                                    messageID: fetchData.message_id,
                                    senderID: fetchData.message_sender.id.toString(),
                                    attachments: (fetchData.message.blob_attachment || []).map(function (att) {
                                        var x;
                                        try { x = utils._formatAttachment({ blob_attachment: att }); }
                                        catch (ex) { x = att; x.error = ex; x.type = "unknown"; }
                                        attachImageUrlToAttachment(api, x);
                                        return x;
                                    }),
                                    args: (fetchData.message.text || "").trim().split(/\s+/) || [],
                                    body: fetchData.message.text || "",
                                    isGroup: callbackToReturn.isGroup,
                                    mentions: mobj,
                                    timestamp: parseInt(fetchData.timestamp_precise)
                                };
                            })
                            .catch(function (err) { log.error("forcedFetch", err); })
                            .finally(function () {
                                if (ctx.globalOptions.autoMarkDelivery) markDelivery(ctx, api, callbackToReturn.threadID, callbackToReturn.messageID);
                                !ctx.globalOptions.selfListen && callbackToReturn.senderID === ctx.userID ? undefined : (function () { globalCallback(null, callbackToReturn); })();
                            });
                    } else {
                        callbackToReturn.delta = delta;
                    }

                    if (ctx.globalOptions.autoMarkDelivery) markDelivery(ctx, api, callbackToReturn.threadID, callbackToReturn.messageID);
                    return !ctx.globalOptions.selfListen && callbackToReturn.senderID === ctx.userID ? undefined : (function () { globalCallback(null, callbackToReturn); })();
                }
            }
            return;
        }
    }

    if (v.delta.class !== "NewMessage" && !ctx.globalOptions.listenEvents) return;

    switch (v.delta.class) {
        case "JoinableMode": {
            var fmtMsg;
            try { fmtMsg = utils.formatDeltaEvent(v.delta); }
            catch (err) {
                return globalCallback({ error: "Problem parsing message object.", detail: err, res: v.delta, type: "parse_error" });
            }
            return globalCallback(null, fmtMsg);
        }
        case "AdminTextMessage": {
            switch (v.delta.type) {
                case 'confirm_friend_request':
                case 'shared_album_delete':
                case 'shared_album_addition':
                case 'pin_messages_v2':
                case 'unpin_messages_v2':
                case "change_thread_theme":
                case "change_thread_nickname":
                case "change_thread_icon":
                case "change_thread_quick_reaction":
                case "change_thread_admins":
                case "group_poll":
                case "joinable_group_link_mode_change":
                case "magic_words":
                case "change_thread_approval_mode":
                case "messenger_call_log":
                case "participant_joined_group_call": {
                    var fmtMsg;
                    try { fmtMsg = utils.formatDeltaEvent(v.delta); }
                    catch (err) {
                        return globalCallback({ error: "Problem parsing message object.", detail: err, res: v.delta, type: "parse_error" });
                    }
                    return (function () { globalCallback(null, fmtMsg); })();
                }
                default: return;
            }
        }
        case "ForcedFetch": {
            if (!v.delta.threadKey) return;
            var mid = v.delta.messageId;
            var tid = v.delta.threadKey.threadFbId;
            if (mid && tid) {
                var fetchForm = {
                    "av": ctx.globalOptions.pageID,
                    "queries": JSON.stringify({
                        "o0": {
                            "doc_id": "2848441488556444",
                            "query_params": {
                                "thread_and_message_id": {
                                    "thread_id": tid.toString(),
                                    "message_id": mid
                                }
                            }
                        }
                    })
                };
                defaultFuncs
                    .post("https://www.facebook.com/api/graphqlbatch/", ctx.jar, fetchForm)
                    .then(utils.parseAndCheckLogin(ctx, defaultFuncs))
                    .then(function (resData) {
                        if (resData[resData.length - 1].error_results > 0) throw resData[0].o0.errors;
                        if (resData[resData.length - 1].successful_results === 0) throw { error: "forcedFetch: there was no successful_results", res: resData };
                        var fetchData = resData[0].o0.data.message;
                        if (utils.getType(fetchData) == "Object") {
                            switch (fetchData.__typename) {
                                case "ThreadImageMessage":
                                    (!ctx.globalOptions.selfListen && fetchData.message_sender.id.toString() === ctx.userID) ||
                                        !ctx.loggedIn ? undefined : (function () {
                                            globalCallback(null, {
                                                type: "change_thread_image",
                                                threadID: utils.formatID(tid.toString()),
                                                snippet: fetchData.snippet,
                                                timestamp: fetchData.timestamp_precise,
                                                author: fetchData.message_sender.id,
                                                image: {
                                                    attachmentID: fetchData.image_with_metadata && fetchData.image_with_metadata.legacy_attachment_id,
                                                    width: fetchData.image_with_metadata && fetchData.image_with_metadata.original_dimensions.x,
                                                    height: fetchData.image_with_metadata && fetchData.image_with_metadata.original_dimensions.y,
                                                    url: fetchData.image_with_metadata && fetchData.image_with_metadata.preview.uri
                                                }
                                            });
                                        })();
                                    break;
                                case "UserMessage":
                                    globalCallback(null, {
                                        type: "message",
                                        senderID: utils.formatID(fetchData.message_sender.id),
                                        body: fetchData.message.text || "",
                                        threadID: utils.formatID(tid.toString()),
                                        messageID: fetchData.message_id,
                                        attachments: [{
                                            type: "share",
                                            ID: fetchData.extensible_attachment.legacy_attachment_id,
                                            url: fetchData.extensible_attachment.story_attachment.url,
                                            title: fetchData.extensible_attachment.story_attachment.title_with_entities.text,
                                            description: fetchData.extensible_attachment.story_attachment.description.text,
                                            source: fetchData.extensible_attachment.story_attachment.source,
                                            image: ((fetchData.extensible_attachment.story_attachment.media || {}).image || {}).uri,
                                            width: ((fetchData.extensible_attachment.story_attachment.media || {}).image || {}).width,
                                            height: ((fetchData.extensible_attachment.story_attachment.media || {}).image || {}).height,
                                            playable: (fetchData.extensible_attachment.story_attachment.media || {}).is_playable || false,
                                            duration: (fetchData.extensible_attachment.story_attachment.media || {}).playable_duration_in_ms || 0,
                                            subattachments: fetchData.extensible_attachment.subattachments,
                                            properties: fetchData.extensible_attachment.story_attachment.properties,
                                        }],
                                        mentions: {},
                                        timestamp: parseInt(fetchData.timestamp_precise),
                                        isGroup: (fetchData.message_sender.id != tid.toString())
                                    });
                                    break;
                            }
                        } else log.error("forcedFetch", fetchData);
                    })
                    .catch(function (err) { log.error("forcedFetch", err); });
            }
            break;
        }
        case "ThreadName":
        case "ParticipantsAddedToGroupThread":
        case "ParticipantLeftGroupThread": {
            var formattedEvent;
            try { formattedEvent = utils.formatDeltaEvent(v.delta); }
            catch (err) {
                return globalCallback({ error: "Problem parsing message object.", detail: err, res: v.delta, type: "parse_error" });
            }
            return (!ctx.globalOptions.selfListen && formattedEvent.author.toString() === ctx.userID) || !ctx.loggedIn ? undefined : (function () { globalCallback(null, formattedEvent); })();
        }
    }
}

function markDelivery(ctx, api, threadID, messageID) {
    if (threadID && messageID) {
        api.markAsDelivered(threadID, messageID, function (err) {
            if (err) log.error("markAsDelivered", err);
            else if (ctx.globalOptions.autoMarkRead) {
                api.markAsRead(threadID, function (err) {
                    if (err) log.error("markAsDelivered", err);
                });
            }
        });
    }
}

module.exports = function (defaultFuncs, api, ctx) {
    var globalCallback = identity;

    refreshSessionAndReconnect = function refreshSessionAndReconnect() {
        printSessionRefreshing();
        utils.get("https://www.messenger.com/", ctx.jar, null, ctx.globalOptions, ctx)
            .then(utils.saveCookies(ctx.jar))
            .then(function() {
                if (typeof api.getFreshDtsg === "function") {
                    return api.getFreshDtsg().then(function(freshDtsg) {
                        if (freshDtsg) {
                            ctx.fb_dtsg = freshDtsg;
                            ctx.ttstamp = "2";
                            for (let j = 0; j < ctx.fb_dtsg.length; j++) {
                                ctx.ttstamp += ctx.fb_dtsg.charCodeAt(j);
                            }
                            log.info("listenMqtt", "fb_dtsg refreshed successfully during proactive reconnect.");
                        }
                        persistAppStateIfConfigured(ctx, api, "listenMqtt");
                    });
                }
                persistAppStateIfConfigured(ctx, api, "listenMqtt");
            })
            .catch(function(err) {
                printReconnectError("Session refresh failed before reconnect", err);
            })
            .finally(function() {
                getSeqID();
            });
    };

    getSeqID = function getSeqID(retryCount) {
        if (typeof retryCount !== 'number') retryCount = 0;
        const MAX_RETRIES = 5;
        const RETRY_DELAY = 3000;
        ctx.t_mqttCalled = false;

        defaultFuncs
            .post("https://www.facebook.com/api/graphqlbatch/", ctx.jar, form)
            .then(utils.parseAndCheckLogin(ctx, defaultFuncs))
            .then(function (resData) {
                if (utils.getType(resData) != "Array") throw { error: "Not logged in", res: resData };
                if (resData && resData[resData.length - 1].error_results > 0) throw resData[0].o0.errors;
                if (resData[resData.length - 1].successful_results === 0) throw { error: "getSeqId: there was no successful_results", res: resData };
                if (resData[0].o0.data.viewer.message_threads.sync_sequence_id) {
                    ctx.lastSeqId = resData[0].o0.data.viewer.message_threads.sync_sequence_id;
                    listenMqtt(defaultFuncs, api, ctx, globalCallback);
                } else throw { error: "getSeqId: no sync_sequence_id found.", res: resData };
            })
            .catch(function (err) {
                printReconnectError("getSeqId failed", err);
                const detail = err && err.detail && err.detail.message ? ` | detail=${err.detail.message}` : "";
                const msg = (err && err.error || err && err.message || String(err || "")) + detail;

                // Check if it's an authentication error versus a transient network error
                const isAuthError = /Not logged in|blocked the login|401|403|checkpoint/i.test(msg);

                if (retryCount < MAX_RETRIES) {
                    const delayMs = RETRY_DELAY * (retryCount + 1);
                    printRetrying(retryCount + 1, MAX_RETRIES, delayMs, msg);

                    return new Promise((resolve) => setTimeout(resolve, delayMs))
                        .then(function () {
                            if (ctx.loggedIn) {
                                printSessionRefreshing();
                                if (typeof api.getFreshDtsg === "function") {
                                    return api.getFreshDtsg().then(function (freshDtsg) {
                                        if (freshDtsg) {
                                            ctx.fb_dtsg = freshDtsg;
                                            ctx.ttstamp = "2";
                                            for (let j = 0; j < ctx.fb_dtsg.length; j++) ctx.ttstamp += ctx.fb_dtsg.charCodeAt(j);
                                        } else {
                                            printReconnectError("Failed to retrieve a fresh fb_dtsg token", "will retry");
                                        }
                                    });
                                }
                            }
                        })
                        .catch(function (refreshErr) {
                            printReconnectError("Session refresh failed", refreshErr);
                        })
                        .then(function () {
                            return getSeqID(retryCount + 1);
                        });
                }

                if (ctx.globalOptions.autoReconnect) {
                    const delayMs = Math.min(30000 * Math.pow(2, Math.min(retryCount - MAX_RETRIES, 5)), 120000);
                    printPersistentRetry(delayMs);

                    return new Promise((resolve) => setTimeout(resolve, delayMs))
                        .then(function () {
                            printSessionRefreshing();
                            if (typeof api.getFreshDtsg === "function") {
                                return api.getFreshDtsg().then(function (freshDtsg) {
                                    if (freshDtsg) {
                                        ctx.fb_dtsg = freshDtsg;
                                        ctx.ttstamp = "2";
                                        for (let j = 0; j < ctx.fb_dtsg.length; j++) ctx.ttstamp += ctx.fb_dtsg.charCodeAt(j);
                                    }
                                });
                            }
                        })
                        .catch(function (refreshErr) {
                            printReconnectError("Session refresh during persistent reconnect failed", refreshErr);
                        })
                        .then(function () {
                            return getSeqID(retryCount + 1);
                        });
                }

                if (isAuthError) {
                    ctx.loggedIn = false;
                }
                return globalCallback(err);
            });
    };

    function startSessionKeeper() {
        if (ctx.sessionKeeperInterval) return;
        ctx.sessionKeeperInterval = setInterval(function () {
            if (!ctx.loggedIn) return;
            log.info("sessionKeeper", "Refreshing session to keep cookies and fb_dtsg fresh...");
            utils.get("https://www.messenger.com/", ctx.jar, null, ctx.globalOptions, ctx)
                .then(utils.saveCookies(ctx.jar))
                .then(function() {
                    if (typeof api.getFreshDtsg === "function") {
                        return api.getFreshDtsg().then(function(freshDtsg) {
                            if (freshDtsg) {
                                ctx.fb_dtsg = freshDtsg;
                                ctx.ttstamp = "2";
                                for (let j = 0; j < ctx.fb_dtsg.length; j++) {
                                    ctx.ttstamp += ctx.fb_dtsg.charCodeAt(j);
                                }
                                log.info("sessionKeeper", "fb_dtsg refreshed successfully.");
                            }
                            persistAppStateIfConfigured(ctx, api, "sessionKeeper");
                        });
                    } else {
                        persistAppStateIfConfigured(ctx, api, "sessionKeeper");
                    }
                })
                .catch(function(err) {
                    log.warn("sessionKeeper", "Background session refresh failed: " + (err.message || err));
                });
        }, 5400000); // 1.5 hours (90 minutes) is much safer and less spammy than 10 minutes
    }

    return function (callback) {
        class MessageEmitter extends EventEmitter {
            stopListening(callback) {
                callback = callback || (function () { });
                globalCallback = identity;
                if (ctx.sessionKeeperInterval) {
                    clearInterval(ctx.sessionKeeperInterval);
                    ctx.sessionKeeperInterval = undefined;
                }
                if (ctx.connectionRefreshTimeout) {
                    clearTimeout(ctx.connectionRefreshTimeout);
                    ctx.connectionRefreshTimeout = undefined;
                }
                if (ctx.heartbeatInterval) {
                    clearInterval(ctx.heartbeatInterval);
                    ctx.heartbeatInterval = undefined;
                }
                if (ctx.mqttClient) {
                    ctx.mqttClient.unsubscribe("/webrtc");
                    ctx.mqttClient.unsubscribe("/rtc_multi");
                    ctx.mqttClient.unsubscribe("/onevc");
                    ctx.mqttClient.publish("/browser_close", "{}");
                    ctx.mqttClient.end(false, function (...data) {
                        callback(data);
                        ctx.mqttClient = undefined;
                    });
                }
            }

            async stopListeningAsync() {
                return new Promise(function (resolve) {
                    this.stopListening(resolve);
                }.bind(this));
            }
        }

        var msgEmitter = new MessageEmitter();
        globalCallback = (callback || function (error, message) {
            if (error) return msgEmitter.emit("error", error);
            msgEmitter.emit("message", message);
        });

        if (!ctx.firstListen) ctx.lastSeqId = null;
        ctx.syncToken = undefined;
        ctx.t_mqttCalled = false;

        form = {
            "av": ctx.globalOptions.pageID,
            "queries": JSON.stringify({
                "o0": {
                    "doc_id": "3336396659757871",
                    "query_params": {
                        "limit": 1,
                        "before": null,
                        "tags": ["INBOX"],
                        "includeDeliveryReceipts": false,
                        "includeSeqID": true
                    }
                }
            })
        };

        if (!ctx.firstListen || !ctx.lastSeqId) {
            getSeqID(defaultFuncs, api, ctx, globalCallback);
        } else {
            listenMqtt(defaultFuncs, api, ctx, globalCallback);
        }

        startSessionKeeper();

        // Proactive 3-hour connection refresh timer
        if (ctx.connectionRefreshTimeout) clearTimeout(ctx.connectionRefreshTimeout);
        ctx.connectionRefreshTimeout = setTimeout(function refreshConnection() {
            if (!ctx.loggedIn) return;
            printConnectionDropped("proactive 3h refresh");
            if (ctx.mqttClient) {
                try { ctx.mqttClient.end(true); } catch (_) {}
            }
            refreshSessionAndReconnect();
            ctx.connectionRefreshTimeout = setTimeout(refreshConnection, 3 * 60 * 60 * 1000);
        }, 3 * 60 * 60 * 1000);

        // Heartbeat monitor (every 5 minutes, checks if we received any MQTT message/event in the last 45 minutes)
        ctx.lastMqttActivity = Date.now();
        if (ctx.heartbeatInterval) clearInterval(ctx.heartbeatInterval);
        ctx.heartbeatInterval = setInterval(function () {
            if (!ctx.loggedIn) return;
            var now = Date.now();
            var idleTime = now - (ctx.lastMqttActivity || now);
            if (idleTime > 45 * 60 * 1000) { // 45 minutes of complete silence
                printConnectionDropped("silent, no activity for 45m");
                ctx.lastMqttActivity = Date.now(); // reset to avoid immediate duplicate triggers
                if (ctx.mqttClient) {
                    try { ctx.mqttClient.end(true); } catch (_) {}
                }
                refreshSessionAndReconnect();
            }
        }, 5 * 60 * 1000);

        api.stopListening = msgEmitter.stopListening.bind(msgEmitter);
        api.stopListeningAsync = msgEmitter.stopListeningAsync.bind(msgEmitter);
        return msgEmitter;
    };
};
