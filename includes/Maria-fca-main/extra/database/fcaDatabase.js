"use strict";

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(process.cwd(), 'fcaDatabase.json');

let db = {};

function load() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const data = fs.readFileSync(DB_PATH, 'utf8');
      db = JSON.parse(data);
    } else {
      db = {};
    }
  } catch (e) {
    db = {};
  }
}

function save() {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
  } catch (e) {
    // ignore
  }
}

// Initial load
load();

function getThread(threadID) {
  load(); // Reload to ensure we have the latest from other potential writes/restarts
  return db[String(threadID)] || null;
}

function saveThread(threadID, info) {
  if (!threadID || !info) return;
  load();
  db[String(threadID)] = {
    threadID: String(threadID),
    participantIDs: info.participantIDs || [],
    userInfo: info.userInfo || {},
    updatedAt: Date.now()
  };
  save();
}

function syncThreadFromEvent(event) {
  if (!event || !event.threadID) return;
  load();
  const threadID = String(event.threadID);
  let thread = db[threadID];
  if (!thread) {
    thread = {
      threadID: threadID,
      participantIDs: [],
      userInfo: {},
      updatedAt: Date.now()
    };
  }

  let updated = false;

  // Sync participantIDs
  if (Array.isArray(event.participantIDs)) {
    event.participantIDs.forEach(uid => {
      const suid = String(uid);
      if (!thread.participantIDs.includes(suid)) {
        thread.participantIDs.push(suid);
        updated = true;
      }
    });
  }

  // Sync sender info if present
  if (event.senderID) {
    const senderID = String(event.senderID);
    if (!thread.participantIDs.includes(senderID)) {
      thread.participantIDs.push(senderID);
      updated = true;
    }
    // If we have names, we can sync
    if (event.senderName && (!thread.userInfo[senderID] || !thread.userInfo[senderID].name)) {
      thread.userInfo[senderID] = thread.userInfo[senderID] || {};
      thread.userInfo[senderID].name = event.senderName;
      thread.userInfo[senderID].id = senderID;
      updated = true;
    }
  }

  if (updated) {
    thread.updatedAt = Date.now();
    db[threadID] = thread;
    save();
  }
}

module.exports = {
  getThread,
  saveThread,
  syncThreadFromEvent
};
