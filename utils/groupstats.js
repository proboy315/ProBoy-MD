// utils/groupstats.js – Asynchronous, debounced writes (no blocking)

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../database/groupStats.json');

// In‑memory cache to avoid reading from disk every time
let dbCache = null;
let writeTimeout = null;
let pendingWrite = false;

// Load database into memory (only once per process)
function loadDB() {
    if (dbCache) return dbCache;
    try {
        if (!fs.existsSync(DB_PATH)) return {};
        dbCache = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
        return dbCache;
    } catch {
        return {};
    }
}

// Schedule a save 2 seconds after the last change
function saveDBDebounced() {
    if (writeTimeout) clearTimeout(writeTimeout);
    writeTimeout = setTimeout(() => {
        if (pendingWrite && dbCache) {
            try {
                fs.writeFileSync(DB_PATH, JSON.stringify(dbCache, null, 2));
            } catch (err) {
                console.error('[groupStats] save error:', err);
            }
            pendingWrite = false;
        }
        writeTimeout = null;
    }, 2000);
}

// Record one message in a group (non‑blocking)
function addMessage(groupId, senderId) {
    const db = loadDB();
    const today = new Date().toISOString().slice(0, 10);
    const hour = new Date().getHours().toString();

    if (!db[groupId]) db[groupId] = {};
    if (!db[groupId][today]) {
        db[groupId][today] = {
            total: 0,
            users: {},
            hours: {}
        };
    }

    const g = db[groupId][today];
    g.total++;
    g.users[senderId] = (g.users[senderId] || 0) + 1;
    g.hours[hour] = (g.hours[hour] || 0) + 1;

    pendingWrite = true;
    saveDBDebounced();               // will write later, not now
}

// Retrieve today’s stats for a group
function getStats(groupId) {
    const db = loadDB();
    const today = new Date().toISOString().slice(0, 10);
    if (!db[groupId] || !db[groupId][today]) return null;
    return db[groupId][today];
}

module.exports = { addMessage, getStats };
