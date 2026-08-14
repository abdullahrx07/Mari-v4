"use strict";
// ── SQLite Adapter ───────────────────────────────────────────────────────
// Drop-in replacement for the Mongoose model API (findOne, find, .select(),
// .exec(), findOneAndUpdate, deleteOne) backed by better-sqlite3, so every
// existing controller (users.js/threads.js/currencies.js) and main.js's
// global.systemData keep working unchanged, whichever DB type is active.
//
// Storage strategy: each row = { id TEXT PRIMARY KEY, doc TEXT (JSON), ... }
// The whole document is kept as one JSON blob — this mirrors Mongoose's
// flexible/Mixed fields (data/threadInfo/value) without needing per-column
// schema migrations, and is intentionally more permissive than the strict
// Mongoose schemas (any field set via $set is preserved).

const Database = require("better-sqlite3");

let dbInstance = null;

function getDb(storagePath) {
    if (dbInstance) return dbInstance;
    dbInstance = new Database(storagePath);
    dbInstance.pragma("journal_mode = WAL");
    return dbInstance;
}

function matchesWhere(doc, where) {
    for (const k in where) {
        if (doc[k] !== where[k]) return false;
    }
    return true;
}

function applyUpdate(existingDoc, updateOps) {
    const doc = existingDoc ? { ...existingDoc } : {};
    if (updateOps.$set) Object.assign(doc, updateOps.$set);
    if (updateOps.$setOnInsert && !existingDoc) Object.assign(doc, updateOps.$setOnInsert);
    if (updateOps.$inc) {
        for (const k in updateOps.$inc) {
            doc[k] = (doc[k] || 0) + updateOps.$inc[k];
        }
    }
    return doc;
}

class SQLiteModel {
    constructor(tableName, idField, db) {
        this.tableName = tableName;
        this.idField = idField; // e.g. "userID", "threadID", "key"
        this.db = db;

        db.exec(
            `CREATE TABLE IF NOT EXISTS ${tableName} (
                id TEXT PRIMARY KEY,
                doc TEXT NOT NULL,
                createdAt INTEGER,
                updatedAt INTEGER
            )`
        );

        this._stmts = {
            getById: db.prepare(`SELECT doc FROM ${tableName} WHERE id = ?`),
            upsert: db.prepare(
                `INSERT INTO ${tableName} (id, doc, createdAt, updatedAt) VALUES (?, ?, ?, ?)
                 ON CONFLICT(id) DO UPDATE SET doc = excluded.doc, updatedAt = excluded.updatedAt`
            ),
            deleteById: db.prepare(`DELETE FROM ${tableName} WHERE id = ?`),
            all: db.prepare(`SELECT doc FROM ${tableName}`),
        };
    }

    // Mimics mongoose's `doc.toObject({ versionKey: false })` + `_id`
    _wrap(doc) {
        const wrapped = { ...doc };
        if (!wrapped._id) wrapped._id = wrapped[this.idField];
        Object.defineProperty(wrapped, "toObject", {
            value: function () {
                const o = { ...wrapped };
                delete o.toObject;
                return o;
            },
            enumerable: false,
        });
        return wrapped;
    }

    async findOne(where = {}) {
        const idVal = where[this.idField];
        if (idVal !== undefined) {
            const row = this._stmts.getById.get(String(idVal));
            if (!row) return null;
            const doc = JSON.parse(row.doc);
            if (!matchesWhere(doc, where)) return null;
            return this._wrap(doc);
        }
        // No id in the where clause — fall back to a full scan.
        const rows = this._stmts.all.all();
        for (const row of rows) {
            const doc = JSON.parse(row.doc);
            if (matchesWhere(doc, where)) return this._wrap(doc);
        }
        return null;
    }

    find(where = {}) {
        const self = this;
        let selectFields = null;
        const query = {
            select(fields) {
                selectFields = String(fields).split(" ").filter(Boolean);
                return query;
            },
            exec: async function () {
                const rows = self._stmts.all.all();
                let docs = rows.map((r) => JSON.parse(r.doc)).filter((d) => matchesWhere(d, where));
                if (selectFields) {
                    docs = docs.map((d) => {
                        const out = {};
                        for (const f of selectFields) if (f in d) out[f] = d[f];
                        return out;
                    });
                }
                return docs.map((d) => self._wrap(d));
            },
        };
        return query;
    }

    async findOneAndUpdate(where = {}, updateOps = {}, options = {}) {
        const idVal = where[this.idField];
        if (idVal === undefined) {
            throw new Error(
                `[sqliteAdapter] findOneAndUpdate requires "${this.idField}" in the where clause`
            );
        }
        const idStr = String(idVal);
        const row = this._stmts.getById.get(idStr);
        const existingDoc = row ? JSON.parse(row.doc) : null;

        if (!existingDoc && !options.upsert) {
            return null; // same as mongoose: no match + no upsert -> null
        }

        const newDoc = applyUpdate(existingDoc, updateOps);
        newDoc[this.idField] = idStr;
        const now = Date.now();
        this._stmts.upsert.run(idStr, JSON.stringify(newDoc), now, now);

        if (options.new) return this._wrap(newDoc);
        return existingDoc ? this._wrap(existingDoc) : this._wrap(newDoc);
    }

    async deleteOne(where = {}) {
        const idVal = where[this.idField];
        if (idVal !== undefined) {
            const info = this._stmts.deleteById.run(String(idVal));
            return { deletedCount: info.changes };
        }
        return { deletedCount: 0 };
    }
}

module.exports = { getDb, SQLiteModel };
