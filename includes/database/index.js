"use strict";
const path = require("path");
const mongoose = require("mongoose");

// ── Dual DB support ───────────────────────────────────────────────────────
// config.json -> DATABASE.type controls which database is used:
//   "mongodb" -> connects via Mongoose (default, unchanged behaviour)
//   "sqlite"  -> connects via better-sqlite3 (includes/database/sqliteAdapter.js)
//
// Env var MONGODB_URI still overrides config.json's mongodb.uri when type
// is "mongodb", same as before.
mongoose.set("strictQuery", false);

function resolveDbType() {
    try {
        const config = require("../../config.json");
        const type = config && config.DATABASE && config.DATABASE.type;
        return type === "sqlite" ? "sqlite" : "mongodb";
    } catch (e) {
        return "mongodb";
    }
}

function resolveMongoUri() {
    if (process.env.MONGODB_URI) return process.env.MONGODB_URI;
    try {
        const config = require("../../config.json");
        const configUri = config && config.DATABASE && config.DATABASE.mongodb && config.DATABASE.mongodb.uri;
        if (configUri) return configUri;
    } catch (e) {
        // config.json missing/unreadable — fall through to the error below.
    }
    return null;
}

function resolveSqlitePath() {
    let storage = "data.sqlite";
    try {
        const config = require("../../config.json");
        const configStorage = config && config.DATABASE && config.DATABASE.sqlite && config.DATABASE.sqlite.storage;
        if (configStorage) storage = configStorage;
    } catch (e) {
        // fall back to default filename above
    }
    return path.isAbsolute(storage) ? storage : path.join(__dirname, "..", "..", storage);
}

async function connectMongo() {
    const uri = resolveMongoUri();
    if (!uri) {
        throw new Error(
            "No MongoDB connection string found. Set the MONGODB_URI secret, or fill in DATABASE.mongodb.uri in config.json, before starting the bot."
        );
    }
    if (mongoose.connection.readyState === 1) {
        console.log("🔌 [DATABASE] MongoDB already connected!");
        return mongoose.connection;
    }
    console.log("🔌 [DATABASE] Connecting to MongoDB Database...");
    await mongoose
        .connect(uri, {
            serverSelectionTimeoutMS: 30000,
            connectTimeoutMS: 30000,
        })
        .then(() => {
            console.log("✅ [DATABASE] MongoDB connected successfully!");
        })
        .catch((err) => {
            if (err && err.message && err.message.includes("IP")) {
                console.error(
                    "\n⚠️  MongoDB connection failed — your server IP is not whitelisted in MongoDB Atlas.\n" +
                        "   Fix: Atlas → Network Access → Add IP Address → Allow Access from Anywhere (0.0.0.0/0)\n" +
                        "   Or whitelist your hosting provider's IP range.\n"
                );
            }
            throw err;
        });
    return mongoose.connection;
}

function connectSqlite() {
    const { getDb } = require("./sqliteAdapter");
    const storagePath = resolveSqlitePath();
    console.log(`🔌 [DATABASE] Using SQLite database: ${storagePath}`);
    const db = getDb(storagePath);
    console.log("✅ [DATABASE] SQLite connected successfully!");
    return db;
}

// Returns { type, mongoose?, sqliteDb? } so main.js/model.js know which
// backend is active and can pass the right handle into the model layer.
async function connect() {
    const type = resolveDbType();
    if (type === "sqlite") {
        const sqliteDb = connectSqlite();
        return { type: "sqlite", sqliteDb };
    }
    await connectMongo();
    return { type: "mongodb", mongoose };
}

module.exports = { mongoose, connect };
