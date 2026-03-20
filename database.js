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

const readDB = (filePath) => {
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading database: ${error.message}`);
    return {};
  }
};

const writeDB = (filePath, data) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error(`Error writing database: ${error.message}`);
    return false;
  }
};

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

  const getChatSettings = (jid) => {
    const chats = readDB(GROUPS_DB);
    if (!chats[jid]) {
      chats[jid] = { ...config.defaultGroupSettings };
      writeDB(GROUPS_DB, chats);
    }
    return chats[jid];
  };

  const updateChatSettings = (jid, settings) => {
    const chats = readDB(GROUPS_DB);
    chats[jid] = { ...chats[jid], ...settings };
    return writeDB(GROUPS_DB, chats);
  };

  const getGlobalSetting = (key) => {
    const globals = readDB(GLOBAL_DB);
    return globals[key];
  };

  const setGlobalSetting = (key, value) => {
    const globals = readDB(GLOBAL_DB);
    globals[key] = value;
    return writeDB(GLOBAL_DB, globals);
  };

  const getGroupSettings = (groupId) => getChatSettings(groupId);
  const updateGroupSettings = (groupId, settings) => updateChatSettings(groupId, settings);

  const getUser = (userId) => {
    const users = readDB(USERS_DB);
    if (!users[userId]) {
      users[userId] = { registered: Date.now(), premium: false, banned: false };
      writeDB(USERS_DB, users);
    }
    return users[userId];
  };

  const updateUser = (userId, data) => {
    const users = readDB(USERS_DB);
    users[userId] = { ...users[userId], ...data };
    return writeDB(USERS_DB, users);
  };

  const getWarnings = (groupId, userId) => {
    const warnings = readDB(WARNINGS_DB);
    const key = `${groupId}_${userId}`;
    return warnings[key] || { count: 0, warnings: [] };
  };

  const addWarning = (groupId, userId, reason) => {
    const warnings = readDB(WARNINGS_DB);
    const key = `${groupId}_${userId}`;
    if (!warnings[key]) warnings[key] = { count: 0, warnings: [] };
    warnings[key].count++;
    warnings[key].warnings.push({ reason, date: Date.now() });
    writeDB(WARNINGS_DB, warnings);
    return warnings[key];
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
    const mods = readDB(MODS_DB);
    return mods.moderators || [];
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

module.exports = { ...defaultDb, createDatabase };
