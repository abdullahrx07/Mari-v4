"use strict";

const assert = require("assert");

console.log("Starting text effects test suite...");

const ctx = {
    userID: "100000000000000",
    clientID: "test_client_id",
    globalOptions: { antiBan: false },
    mqttClient: {
        publish: function (topic, message, opts, cb) {
            if (typeof opts === "function") cb = opts;
            return cb ? cb(null) : undefined;
        },
        on: function () {},
        removeListener: function () {}
    }
};

const mockRes = {
    statusCode: 200,
    body: JSON.stringify({
        payload: {
            actions: [
                { thread_fbid: "12345", message_id: "mid.123", timestamp: Date.now() }
            ]
        }
    })
};

const defaultFuncs = {
    post: function () {
        return Promise.resolve(mockRes);
    }
};

const api = {};
api.OldMessage = require("../plugins/OldMessage")(defaultFuncs, api, ctx);
api.sendMessage = require("../plugins/sendMessage")(defaultFuncs, api, ctx);
api.sendMessageMqtt = require("../plugins/sendMessageMqtt")(defaultFuncs, api, ctx);

// Test 1: Property validation in sendMessage - should not throw for textEffect or aliases
try {
    const validProps = [
        { body: "Hello hearts", textEffect: "hearts" },
        { body: "Hello gift", text_effect: "gift" },
        { body: "Hello fire", effect: "fire" },
        { body: "Hello confetti", text_effect_id: "4" },
        { body: "Hello sparkles", effectID: 5 },
        { body: "Hello reply", replyTo: "mid.100", textEffect: "hearts" },
        { body: "Hello singular heart", textEffect: "heart" },
        { body: "Hello love", effectName: "love" },
        { body: "Hello present", text_effect_name: "present" },
        { body: "Hello flame", effect_name: "flame" }
    ];

    for (const msg of validProps) {
        let error = null;
        try {
            api.sendMessage(msg, "12345", () => {});
        } catch (e) {
            error = e;
        }
        assert.strictEqual(error, null, `Should accept property object: ${JSON.stringify(msg)}`);
    }
    console.log("✅ PASS - sendMessage allowedProperties validation for textEffect and aliases");
} catch (err) {
    console.error("❌ FAIL - Property validation test failed:", err);
    process.exit(1);
}

// Test 2: OldMessage form payload text_effect_id injection
try {
    const capturedForms = [];
    const testDefaultFuncs = {
        post: function (url, jar, form) {
            capturedForms.push(Object.assign({}, form));
            return Promise.resolve(mockRes);
        }
    };

    const oldMsgApi = {};
    const oldMsgFunc = require("../plugins/OldMessage")(testDefaultFuncs, oldMsgApi, ctx);

    // Test textEffect: "hearts" -> text_effect_id: "1"
    oldMsgFunc({ body: "Heart effect", textEffect: "hearts" }, "12345", (err, res) => {
        assert.strictEqual(err, null);
    });

    // Test effect: "flame" -> text_effect_id: "3"
    oldMsgFunc({ body: "Fire effect", effect: "flame" }, "12345", (err, res) => {
        assert.strictEqual(err, null);
    });

    // Test replyTo alias & present synonym
    oldMsgFunc({ body: "Reply with effect", replyTo: "mid.999", effectName: "present" }, "12345", (err, res) => {
        assert.strictEqual(err, null);
    });

    // Test star synonym
    oldMsgFunc({ body: "Sparkle star", textEffect: "star" }, "12345", (err, res) => {
        assert.strictEqual(err, null);
    });

    assert.strictEqual(capturedForms.length, 4);
    assert.strictEqual(capturedForms[0]["text_effect_id"], "1", "hearts effect should map to '1'");
    assert.strictEqual(capturedForms[1]["text_effect_id"], "3", "flame synonym should map to '3'");
    assert.strictEqual(capturedForms[2]["replied_to_message_id"], "mid.999", "replyTo alias should be set as replied_to_message_id");
    assert.strictEqual(capturedForms[2]["text_effect_id"], "2", "present synonym should map to '2'");
    assert.strictEqual(capturedForms[3]["text_effect_id"], "5", "star synonym should map to '5'");

    console.log("✅ PASS - OldMessage payload effect and replyTo mapping");
} catch (err) {
    console.error("❌ FAIL - OldMessage test failed:", err);
    process.exit(1);
}

// Test 3: sendMessageMqtt payload text_effect_id injection
try {
    let publishedContent = null;
    const testMqttCtx = {
        userID: "100000000000000",
        clientID: "test_client_id",
        globalOptions: {},
        mqttClient: {
            publish: function (topic, contentStr, cb) {
                publishedContent = JSON.parse(contentStr);
                return cb(null, "OK");
            }
        }
    };

    const mqttApi = {};
    const sendMessageMqttFunc = require("../plugins/sendMessageMqtt")(defaultFuncs, mqttApi, testMqttCtx);

    sendMessageMqttFunc({ body: "Sparkles!", effect: "sparkles", replyTo: "mid.777" }, "12345", (err, res) => {
        assert.strictEqual(err, null);
        assert(publishedContent && publishedContent.payload, "Payload should exist");
        const payloadObj = typeof publishedContent.payload === "string" ? JSON.parse(publishedContent.payload) : publishedContent.payload;
        const tasks = payloadObj.tasks;
        assert(Array.isArray(tasks) && tasks.length > 0, "Tasks array should exist");
        const task0Payload = typeof tasks[0].payload === "string" ? JSON.parse(tasks[0].payload) : tasks[0].payload;
        assert.strictEqual(task0Payload.text_effect_id, "5", "sparkles should map to effect ID '5'");
        assert(task0Payload.reply_metadata, "reply_metadata should be created from replyTo alias");
        assert.strictEqual(task0Payload.reply_metadata.reply_source_id, "mid.777");
    });

    console.log("✅ PASS - sendMessageMqtt payload effect and replyTo mapping");
} catch (err) {
    console.error("❌ FAIL - sendMessageMqtt test failed:", err);
    process.exit(1);
}

console.log("\n🎉 ALL TEXT EFFECT TESTS PASSED SUCCESSFULLY");
