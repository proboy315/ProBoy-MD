/**
 * Simple JSON-based Database for Group Settings
 * Extended to support per-chat and global settings for antidelete.
 */

const fs = require('fs');
const path = require('path');
const config = require('./config');

const initDB = (filePath, defaultData = {}) => {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
  }
};

// ============================================================================
// STABILITY / PERFORMANCE LAYER (added)
// ----------------------------------------------------------------------------
// Before: every getGroupSettings / getGlobalSetting / isModerator call did a
//   synchronous readFileSync + JSON.parse of the whole file, and handler.js
//   makes 5-10 such calls per incoming message PER SESSION. With dozens of
//   sessions that is hundreds of blocking parses per second on a 20% CPU
//   budget, plus constant garbage for the GC. Writes were also non-atomic: a
//   SIGKILL (OOM) mid-write left a truncated file, readDB() then returned {}
//   and the next write permanently wiped all settings.
// Now: parsed files are cached (validated by mtime+size, bounded in count and
//   bytes, idle entries evicted), reads that are only inspected return a clone
//   of the small sub-entry (so callers can still never mutate shared state),
//   and writes are atomic (tmp file + rename). Public API and return values
//   are unchanged.
// ============================================================================
const FAST_TTL_MS = 1500;               // skip stat() if validated this recently
const IDLE_EVICT_MS = 60 * 1000;        // drop entries nobody used for 60s
const MAX_CACHE_BYTES = 8 * 1024 * 1024; // total raw JSON bytes retained
const MAX_FILE_BYTES = 2 * 1024 * 1024;  // never cache a single file above this

const cache = new Map(); // filePath -> { data, mtimeMs, size, checkedAt, lastUsed }
let cacheBytes = 0;

const cloneValue = (v) => {
  if (v === undefined || v === null || typeof v !== 'object') return v;
  return typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v));
};

const dropCache = (filePath) => {
  const e = cache.get(filePath);
  if (e) { cacheBytes -= e.size || 0; cache.delete(filePath); }
};

const putCache = (filePath, data, st) => {
  dropCache(filePath);
  if (!st || st.size > MAX_FILE_BYTES) return;
  const now = Date.now();
  cache.set(filePath, { data, mtimeMs: st.mtimeMs, size: st.size, checkedAt: now, lastUsed: now });
  cacheBytes += st.size;
  if (cacheBytes > MAX_CACHE_BYTES) {
    const byAge = [...cache.entries()].filter(([k]) => k !== filePath).sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    for (const [k] of byAge) {
      if (cacheBytes <= MAX_CACHE_BYTES) break;
      dropCache(k);
    }
  }
};

const sweepTimer = setInterval(() => {
  const now = Date.now();
  for (const [k, e] of cache) if (now - e.lastUsed > IDLE_EVICT_MS) dropCache(k);
}, 30 * 1000);
if (sweepTimer.unref) sweepTimer.unref();

const quarantineCorrupt = (filePath) => {
  try { fs.renameSync(filePath, `${filePath}.corrupt-${Date.now()}`); } catch {}
};

/** Shared, READ-ONLY view of a parsed file. Never mutate the result. */
const loadShared = (filePath) => {
  const now = Date.now();
  const hit = cache.get(filePath);
  if (hit) {
    if (now - hit.checkedAt < FAST_TTL_MS) { hit.lastUsed = now; return hit.data; }
    try {
      const st = fs.statSync(filePath);
      if (st.mtimeMs === hit.mtimeMs && st.size === hit.size) {
        hit.checkedAt = now; hit.lastUsed = now; return hit.data;
      }
    } catch { /* fall through to a real read */ }
    dropCache(filePath);
  }
  let st, raw;
  try {
    st = fs.statSync(filePath);
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch (error) {
    console.error(`Error reading database: ${error.message}`);
    return {};
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    console.error(`Error reading database: ${error.message}`);
    quarantineCorrupt(filePath); // keep evidence instead of silently overwriting it later
    return {};
  }
  if (!data || typeof data !== 'object') data = {};
  putCache(filePath, data, st);
  return data;
};

/** Private, mutable copy (same contract as the old readDB). */
const readDB = (filePath) => cloneValue(loadShared(filePath));

const atomicWrite = (filePath, content) => {
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, content); // throws on ENOSPC etc. - original file is untouched
  try {
    fs.renameSync(tmp, filePath);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch {}
    fs.writeFileSync(filePath, content); // last-resort non-atomic fallback
  }
};

const writeDB = (filePath, data) => {
  try {
    const json = JSON.stringify(data, null, 2);
    atomicWrite(filePath, json);
    let st = null;
    try { st = fs.statSync(filePath); } catch {}
    putCache(filePath, data, st);
    return true;
  } catch (error) {
    dropCache(filePath);
    console.error(`Error writing database: ${error.message}`);
    return false;
  }
};

const cleanStaleTmpFiles = (dir) => {
  try {
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const f of fs.readdirSync(dir)) {
      if (!/\.json\.tmp-\d+-\d+$/.test(f)) continue;
      const full = path.join(dir, f);
      try { if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full); } catch {}
    }
  } catch {}
};

const getDbCacheStats = () => ({ files: cache.size, bytes: cacheBytes });

const createDatabase = (dbPath) => {
  const DB_PATH = dbPath || path.join(__dirname, 'database');
  const GROUPS_DB = path.join(DB_PATH, 'groups.json');
  const USERS_DB = path.join(DB_PATH, 'users.json');
  const WARNINGS_DB = path.join(DB_PATH, 'warnings.json');
  const MODS_DB = path.join(DB_PATH, 'mods.json');
  const GLOBAL_DB = path.join(DB_PATH, 'global.json');

  if (!fs.existsSync(DB_PATH)) fs.mkdirSync(DB_PATH, { recursive: true });
  initDB(GROUPS_DB, {});
  initDB(USERS_DB, {});
  initDB(WARNINGS_DB, {});
  initDB(MODS_DB, { moderators: [] });
  initDB(GLOBAL_DB, {});
  cleanStaleTmpFiles(DB_PATH);

  const getChatSettings = (jid) => {
    const shared = loadShared(GROUPS_DB);
    if (shared[jid]) return cloneValue(shared[jid]);
    const chats = readDB(GROUPS_DB);
    chats[jid] = cloneValue({ ...config.defaultGroupSettings });
    writeDB(GROUPS_DB, chats);
    return cloneValue(chats[jid]);
  };

  const updateChatSettings = (jid, settings) => {
    const chats = readDB(GROUPS_DB);
    chats[jid] = { ...chats[jid], ...settings };
    return writeDB(GROUPS_DB, chats);
  };

  const getGlobalSetting = (key) => {
    const globals = loadShared(GLOBAL_DB);
    return cloneValue(globals[key]);
  };

  const setGlobalSetting = (key, value) => {
    const globals = readDB(GLOBAL_DB);
    globals[key] = value;
    return writeDB(GLOBAL_DB, globals);
  };

  const getGroupSettings = (groupId) => getChatSettings(groupId);
  const updateGroupSettings = (groupId, settings) => updateChatSettings(groupId, settings);

  const getUser = (userId) => {
    const shared = loadShared(USERS_DB);
    if (shared[userId]) return cloneValue(shared[userId]);
    const users = readDB(USERS_DB);
    users[userId] = { registered: Date.now(), premium: false, banned: false };
    writeDB(USERS_DB, users);
    return cloneValue(users[userId]);
  };

  const updateUser = (userId, data) => {
    const users = readDB(USERS_DB);
    users[userId] = { ...users[userId], ...data };
    return writeDB(USERS_DB, users);
  };

  const getWarnings = (groupId, userId) => {
    const warnings = loadShared(WARNINGS_DB);
    const key = `${groupId}_${userId}`;
    return cloneValue(warnings[key]) || { count: 0, warnings: [] };
  };

  const addWarning = (groupId, userId, reason) => {
    const warnings = readDB(WARNINGS_DB);
    const key = `${groupId}_${userId}`;
    if (!warnings[key]) warnings[key] = { count: 0, warnings: [] };
    warnings[key].count++;
    warnings[key].warnings.push({ reason, date: Date.now() });
    writeDB(WARNINGS_DB, warnings);
    return cloneValue(warnings[key]);
  };

  const removeWarning = (groupId, userId) => {
    const warnings = readDB(WARNINGS_DB);
    const key = `${groupId}_${userId}`;
    if (warnings[key] && warnings[key].count > 0) {
      warnings[key].count--;
      warnings[key].warnings.pop();
      writeDB(WARNINGS_DB, warnings);
      return true;
    }
    return false;
  };

  const clearWarnings = (groupId, userId) => {
    const warnings = readDB(WARNINGS_DB);
    const key = `${groupId}_${userId}`;
    delete warnings[key];
    return writeDB(WARNINGS_DB, warnings);
  };

  const getModerators = () => {
    const mods = loadShared(MODS_DB);
    return cloneValue(mods.moderators) || [];
  };

  const addModerator = (userId) => {
    const mods = readDB(MODS_DB);
    if (!mods.moderators) mods.moderators = [];
    if (!mods.moderators.includes(userId)) {
      mods.moderators.push(userId);
      return writeDB(MODS_DB, mods);
    }
    return false;
  };

  const removeModerator = (userId) => {
    const mods = readDB(MODS_DB);
    if (mods.moderators) {
      mods.moderators = mods.moderators.filter(id => id !== userId);
      return writeDB(MODS_DB, mods);
    }
    return false;
  };

  const isModerator = (userId) => getModerators().includes(userId);

  return {
    getGroupSettings,
    updateGroupSettings,
    getUser,
    updateUser,
    getWarnings,
    addWarning,
    removeWarning,
    clearWarnings,
    getModerators,
    addModerator,
    removeModerator,
    isModerator,
    getChatSettings,
    updateChatSettings,
    getGlobalSetting,
    setGlobalSetting,
    _dbPath: DB_PATH
  };
};

// Default (single) DB instance (backwards compatible)
const defaultDb = createDatabase(path.join(__dirname, 'database'));

module.exports = { ...defaultDb, createDatabase, getDbCacheStats };
