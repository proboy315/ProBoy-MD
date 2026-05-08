
/**
 * WhatsApp MD Bot – ProBoy-MD
 * Version: 3.0.51 – License & Version Fix
 * - License applied before loading handler
 * - Version incremented by 5
 * - No license log output
 * - Config override works consistently
 */

process.env.PUPPETEER_SKIP_DOWNLOAD = 'true';
process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = 'true';
process.env.PUPPETEER_CACHE_DIR = process.env.PUPPETEER_CACHE_DIR || '/tmp/puppeteer_cache_disabled';

console.clear();

const readline = require('readline');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const zlib = require('zlib');
const os = require('os');
const crypto = require('crypto');

// load config early to know bot name
let configTmp = {};
try { configTmp = require('./config'); } catch {}
const tempBotName = configTmp.botName || 'ProBoy-MD';
console.log(`\n${tempBotName} v3.0.51 (Stability & Fix)`);

// ==================== ANSI COLORS ====================
const C = {
    reset: '\x1b[0m', bright: '\x1b[1m',
    fg: { red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m', white: '\x1b[37m' }
};
const style = (text, color, bold = false) => `${bold ? C.bright : ''}${color}${text}${C.reset}`;
const neon = {
    cyan: (t) => style(t, C.fg.cyan, true),
    green: (t) => style(t, C.fg.green, true),
    yellow: (t) => style(t, C.fg.yellow, true),
    blue: (t) => style(t, C.fg.blue, true),
    white: (t) => style(t, C.fg.white, true)
};
const line = (tag, color, msg) => console.log(`${color(`[${tag}]`)} ${msg}${C.reset}`);
const log = {
    info: (msg) => line('INFO', neon.cyan, msg),
    success: (msg) => line('OK', neon.green, msg),
    warn: (msg) => line('WARN', neon.yellow, msg),
    error: (msg) => line('ERR', (t) => style(t, C.fg.red, true), msg),
    // license log removed – silent
    botReady: (name, phone, prefix) => {
        line('READY', neon.green, `${neon.white(name)} | ${neon.cyan(phone)} | ${neon.yellow(prefix)}`);
    }
};

// ==================== CONSTANTS ====================
const BOT_TXT_PATH = path.join(__dirname, 'bot.txt');
const KEY_TXT_PATH = path.join(__dirname, 'key.txt');
const BOT_IMAGE_PATH = path.join(__dirname, 'utils', 'bot_image.jpg');
const CONFIG_PATH = path.join(__dirname, 'config.js');
const LICENSE_CACHE_PATH = path.join(__dirname, 'database', 'license_cache.json');
const BLACKLIST_FILE = path.join(__dirname, 'database', 'blacklist_sessions.json');
const MAIN_LICENSE_URL = process.env.MAIN_LICENSE_URL || 'https://proboy.vercel.app/bot/';
const SESSION_TXT_PATH = path.join(__dirname, 'session.txt');

const DEFAULT_CONFIG = {
    ownerNumber: ['923261684315'],
    ownerName: ['SHahan'],
    botName: 'ProBoy-MD',
    botimg: 'https://proboy.vercel.app/bot/ProBoy-MD/bot_image.jpg',
    version: '3.0.51',
    prefix: '.',
    sessionName: 'session',
    sessionID: '',
    newsletterJid: '120363422946163295@newsletter',
    cidJsonUrl: 'https://proboy.vercel.app/bot/cid.json',
    updateZipUrl: 'https://github.com/proboy315/ProBoy-MD/archive/refs/heads/main.zip',
    packname: 'ProBoy-MD',
    CONNECT_JSON_URL: 'https://proboy.vercel.app/connect/',
    REMOTE_SESSIONS_URL: 'https://proboy.vercel.app/sessions/',
    features: { remoteSessions: true, connectJson: true, autoUpdate: false, antidelete: true, maxSessions: 0 }
};

let LICENSE_CONFIG = { ...DEFAULT_CONFIG };
let LICENSE_VALID = false, LICENSE_EXPIRY = null, LICENSE_DAYS_LEFT = null, MAIN_LICENSE_DATA = null;
let FEATURE_REMOTE_SESSIONS = true, FEATURE_CONNECT_JSON = true, FEATURE_ANTIDELETE = true, FEATURE_MAX_SESSIONS = 0;
let handler = null;

let LOCAL_KEY = null;
let PURE_REMOTE_MODE = false;
if (fs.existsSync(KEY_TXT_PATH)) {
    LOCAL_KEY = fs.readFileSync(KEY_TXT_PATH, 'utf8').trim();
    if (LOCAL_KEY) {
        PURE_REMOTE_MODE = true;
        log.info('🔑 Key.txt found. Pure remote mode active – no local session required.');
    }
}

let keyMatchLogged = false;
const sessionFailCount = new Map();
const MAX_FAILURES_BEFORE_BLACKLIST = 3;
const REMOTE_ONLY_PLACEHOLDER_LABEL = 'remote-placeholder';

// ==================== INITIALIZATION ====================
const { initializeTempSystem } = require('./utils/tempManager');
const { startCleanup } = require('./utils/cleanup');
initializeTempSystem(); startCleanup();

const forbiddenPatterns = [
    'closing session', 'closing open session', 'sessionentry', 'prekey bundle',
    'pendingprekey', '_chains', 'registrationid', 'currentratchet', 'chainkey',
    'ratchet', 'signal protocol', 'ephemeralkeypair', 'indexinfo', 'basekey',
    'failed to decrypt', 'bad mac', 'session error', 'decrypted message with closed session',
    'sender key distribution', 'message retry', 'connection reestablished',
    'received ack', 'sending message', 'message send attempt', 'protocol message',
    'processing message', 'sending presence', 'received presence', 'iq',
    'prekey', 'session record', 'ratchet key', 'rootkey', 'chainkey',
    'messagekeys', 'pendingprekey', 'closing stale', 'opened new session'
];

const rateLimitPattern = /rate\s*overlimit|rate\-overlimit|too\s*many\s*requests/i;

const shouldSuppress = (text) => {
    const msg = String(text || '').toLowerCase();
    if (rateLimitPattern.test(msg)) return true;
    return forbiddenPatterns.some(p => msg.includes(p));
};

const origLog = console.log, origError = console.error, origWarn = console.warn;
console.log = (...a) => { if (!shouldSuppress(a.join(' '))) origLog(...a); };
console.error = (...a) => { if (!shouldSuppress(a.join(' '))) origError(...a); };
console.warn = (...a) => { if (!shouldSuppress(a.join(' '))) origWarn(...a); };

try {
    const origStdoutWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk, enc, cb) => {
        const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk || '');
        if (shouldSuppress(text)) return true;
        return origStdoutWrite(chunk, enc, cb);
    };
    const origStderrWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk, enc, cb) => {
        const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk || '');
        if (shouldSuppress(text)) return true;
        return origStderrWrite(chunk, enc, cb);
    };
} catch {}

const dbDir = path.join(__dirname, 'database');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
if (!fs.existsSync(BLACKLIST_FILE)) fs.writeFileSync(BLACKLIST_FILE, JSON.stringify({ sessions: {} }, null, 2));

// ==================== LICENSE FUNCTIONS ====================
async function downloadBotImage(u){if(!u)return false;try{const d=path.join(__dirname,'utils');fs.existsSync(d)||fs.mkdirSync(d,{recursive:true});const r=await axios.get(u,{responseType:'arraybuffer',timeout:15000});fs.writeFileSync(BOT_IMAGE_PATH,Buffer.from(r.data));return true}catch{return false}}
function isLicenseExpired(e){return e&&e!==''&&new Date()>new Date(e)}
function calculateDaysLeft(e){if(!e||e==='')return null;try{return Math.ceil((new Date(e)-new Date())/86400000)}catch{return null}}
async function fetchMainLicense(){try{const r=await axios.get(MAIN_LICENSE_URL,{timeout:8000});return r?.data&&typeof r.data==='object'?r.data:null}catch{return null}}
async function fetchBuyerLicense(u){try{const r=await axios.get(u,{timeout:8000});return r?.data&&typeof r.data==='object'?r.data:null}catch{return null}}

function normalizeUrl(u) { return String(u || '').trim().toLowerCase().replace(/\/+$/, ''); }
function validateLicenseUrl(main, buyerUrl) {
    if (!main?.bot) return false;
    const whitelist = Array.isArray(main.bot) ? main.bot : [];
    if (!whitelist.length) return true;
    const normalizedBuyer = normalizeUrl(buyerUrl);
    for (const entry of whitelist) {
        let entryUrl = null;
        let isActive = true;
        if (typeof entry === 'string') entryUrl = entry;
        else if (typeof entry === 'object' && entry.url) { entryUrl = entry.url; isActive = entry.active !== false; }
        if (entryUrl && normalizeUrl(entryUrl) === normalizedBuyer) return isActive;
    }
    return false;
}
function getExpiryFromMainLicense(main, buyerUrl) {
    if (!main?.bot) return null;
    const normalizedBuyer = normalizeUrl(buyerUrl);
    for (const entry of main.bot) {
        if (typeof entry === 'object' && entry.url && normalizeUrl(entry.url) === normalizedBuyer) return entry.expiry || null;
    }
    return null;
}
function getFeaturesFromMainLicense(main, buyerUrl) {
    if (!main?.bot) return null;
    const normalizedBuyer = normalizeUrl(buyerUrl);
    for (const entry of main.bot) {
        if (typeof entry === 'object' && entry.url && normalizeUrl(entry.url) === normalizedBuyer) return entry.features || null;
    }
    return null;
}
function mergeWithDefaults(buyer,mainF){if(!buyer)return{...DEFAULT_CONFIG};return{ownerNumber:buyer.ownerNumber?.length?buyer.ownerNumber:DEFAULT_CONFIG.ownerNumber,ownerName:buyer.ownerName?.length?buyer.ownerName:DEFAULT_CONFIG.ownerName,botName:buyer.botName||DEFAULT_CONFIG.botName,botimg:buyer.botimg||DEFAULT_CONFIG.botimg,version:buyer.version||DEFAULT_CONFIG.version,prefix:buyer.prefix||DEFAULT_CONFIG.prefix,sessionName:buyer.sessionName||DEFAULT_CONFIG.sessionName,sessionID:buyer.sessionID||DEFAULT_CONFIG.sessionID,newsletterJid:buyer.newsletterJid||DEFAULT_CONFIG.newsletterJid,cidJsonUrl:buyer.cidJsonUrl||DEFAULT_CONFIG.cidJsonUrl,updateZipUrl:buyer.updateZipUrl||DEFAULT_CONFIG.updateZipUrl,packname:buyer.packname||DEFAULT_CONFIG.packname,CONNECT_JSON_URL:buyer.CONNECT_JSON_URL||DEFAULT_CONFIG.CONNECT_JSON_URL,REMOTE_SESSIONS_URL:buyer.REMOTE_SESSIONS_URL||DEFAULT_CONFIG.REMOTE_SESSIONS_URL,features:{...DEFAULT_CONFIG.features,...(mainF||{}),...(buyer.features||{})}}}
function saveLicenseCache(c,v,e,m){try{fs.writeFileSync(LICENSE_CACHE_PATH,JSON.stringify({config:c,valid:v,expiry:e,mainData:m,cachedAt:Date.now()}))}catch{}}
function loadLicenseCache(){try{if(!fs.existsSync(LICENSE_CACHE_PATH))return null;const c=JSON.parse(fs.readFileSync(LICENSE_CACHE_PATH,'utf8'));if(Date.now()-(c.cachedAt||0)<3600000)return c}catch{}return null}
function clearLicenseCache(){try{if(fs.existsSync(LICENSE_CACHE_PATH))fs.unlinkSync(LICENSE_CACHE_PATH);}catch{}}

async function verifyLicense(){
    let buyerUrl = '';
    if (fs.existsSync(BOT_TXT_PATH)) buyerUrl = fs.readFileSync(BOT_TXT_PATH, 'utf8').trim();
    if (!buyerUrl) {
        clearLicenseCache();
        LICENSE_CONFIG = { ...DEFAULT_CONFIG };
        LICENSE_VALID = false;
        updateCachedFeatures();
        return;
    }

    const cached = loadLicenseCache();
    if (cached?.valid && !isLicenseExpired(cached.expiry)) {
        LICENSE_CONFIG = cached.config;
        LICENSE_VALID = true;
        LICENSE_EXPIRY = cached.expiry;
        LICENSE_DAYS_LEFT = calculateDaysLeft(cached.expiry);
        MAIN_LICENSE_DATA = cached.mainData;
        updateCachedFeatures();
        return;
    }

    const main = await fetchMainLicense();
    if (!main) {
        if (cached) {
            LICENSE_CONFIG = cached.config;
            LICENSE_VALID = cached.valid;
            LICENSE_EXPIRY = cached.expiry;
            MAIN_LICENSE_DATA = cached.mainData;
        } else {
            LICENSE_CONFIG = { ...DEFAULT_CONFIG };
            LICENSE_VALID = false;
        }
        updateCachedFeatures();
        return;
    }
    MAIN_LICENSE_DATA = main;

    if (!validateLicenseUrl(main, buyerUrl)) {
        // Not whitelisted – fallback to default config silently
        LICENSE_CONFIG = { ...DEFAULT_CONFIG };
        LICENSE_VALID = false;
        updateCachedFeatures();
        return;
    }

    const buyer = await fetchBuyerLicense(buyerUrl);
    if (!buyer) {
        LICENSE_CONFIG = { ...DEFAULT_CONFIG };
        LICENSE_VALID = false;
        updateCachedFeatures();
        return;
    }

    const mainExpiry = getExpiryFromMainLicense(main, buyerUrl);
    const expiryDate = mainExpiry || buyer.expiry || '';
    if (isLicenseExpired(expiryDate)) {
        LICENSE_CONFIG = { ...DEFAULT_CONFIG };
        LICENSE_VALID = false;
        updateCachedFeatures();
        return;
    }

    const mainFeatures = getFeaturesFromMainLicense(main, buyerUrl);
    LICENSE_CONFIG = mergeWithDefaults(buyer, mainFeatures);
    LICENSE_VALID = true;
    LICENSE_EXPIRY = expiryDate || null;
    LICENSE_DAYS_LEFT = calculateDaysLeft(expiryDate);
    updateCachedFeatures();

    if (LICENSE_CONFIG.botimg) await downloadBotImage(LICENSE_CONFIG.botimg);
    saveLicenseCache(LICENSE_CONFIG, true, LICENSE_EXPIRY, MAIN_LICENSE_DATA);
    // No log line – silent success
}

function updateCachedFeatures(){
    const f = LICENSE_CONFIG.features || {};
    FEATURE_REMOTE_SESSIONS = f.remoteSessions !== false;
    FEATURE_CONNECT_JSON = f.connectJson !== false;
    FEATURE_ANTIDELETE = f.antidelete !== false;
    FEATURE_MAX_SESSIONS = f.maxSessions ?? 0;
}

function overrideConfigObject(co, lc){
    co.ownerNumber = [...lc.ownerNumber];
    co.ownerName = [...lc.ownerName];
    co.botName = lc.botName;
    co.version = lc.version;
    co.prefix = lc.prefix;
    co.sessionName = lc.sessionName;
    co.sessionID = lc.sessionID;
    co.newsletterJid = lc.newsletterJid;
    co.cidJsonUrl = lc.cidJsonUrl;
    co.updateZipUrl = lc.updateZipUrl;
    co.packname = lc.packname;
    process.env.CONNECT_JSON_URL = lc.CONNECT_JSON_URL;
    process.env.REMOTE_SESSIONS_URL = lc.REMOTE_SESSIONS_URL;
    return co;
}

// ==================== BLACKLIST SYSTEM ====================
function loadBlacklist(){ try { return JSON.parse(fs.readFileSync(BLACKLIST_FILE, 'utf8')); } catch { return { sessions: {} }; } }
function saveBlacklist(d){ try { fs.writeFileSync(BLACKLIST_FILE, JSON.stringify(d, null, 2)); } catch {} }
function isSessionBlacklisted(sid){ return !!loadBlacklist().sessions[sid]; }

function deleteRemoteAuthFolder(sid) {
    try {
        const hash = computeSessionTokenHash(sid);
        const authDir = path.join(SESSION_MULTI_ROOT, `auth-${hash}`);
        if (fs.existsSync(authDir)) fs.rmSync(authDir, { recursive: true, force: true });
    } catch (e) { console.error(`${C.fg.red}❌ Failed to delete auth folder: ${e.message}${C.reset}`); }
}

function addToBlacklist(sid, reason='invalid'){
    const b = loadBlacklist();
    if (b.sessions[sid]) return;
    b.sessions[sid] = { reason, blacklistedAt: Date.now() };
    saveBlacklist(b);
    deleteRemoteAuthFolder(sid);
    sessionFailCount.delete(sid);
}
function shouldBlacklistReason(reason=''){
    const r = String(reason || '').toLowerCase();
    return ['logged_out','invalid_format','invalid_base64','empty_payload','empty_creds','creds_not_json','creds_not_object','not_registered','decode_failed'].some(x => r.includes(x));
}

// ==================== LOAD LIBRARIES ====================
const pino = require('pino');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
let config = require('./config');
const { updateViaZip, getRemoteMeta } = require('./utils/updater');

const SESSION_MULTI_ROOT = path.join(__dirname, 'sessions');
const SESSIONS_INDEX_PATH = path.join(SESSION_MULTI_ROOT, 'sessions.json');
const CONNECT_JSON_POLL_MS = 20000;
const connectPushImagePath = path.join(__dirname, 'utils', 'bot_image.jpg');
let REMOTE_SESSIONS_URL = DEFAULT_CONFIG.REMOTE_SESSIONS_URL;
const REMOTE_POLL_INTERVAL_MS = 15000;
let remoteSessionChecker = null;
const connectedRemoteSessions = new Set();
const inflightRemoteSessions = new Set();
const remoteSessionTokenByHash = new Map();
const DEFAULT_OWNER_NUMBER = '923261684315';
const INITIAL_CONNECT_TIMEOUT_MS = 45000;
const REMOTE_FETCH_WARN_COOLDOWN_MS = 60000;

let pollingActive = false;
let consecutiveFailures = 0;
let lastRemoteCount = -1;
const MAX_CONCURRENT_CONNECTS = 2;
const MAX_NEW_PER_CYCLE = 3;
let lastRemoteFetchWarnAt = 0;
let cachedBaileysVersion = null;
let cachedBaileysVersionAt = 0;

// ==================== WATCHDOG ====================
let lastActivity = Date.now();
let lastCommandTime = Date.now();
const HANG_TIMEOUT = 24 * 60 * 60 * 1000;
let restartScheduled = false;
const RESTART_COOLDOWN = 60 * 1000;

function updateActivity() { lastActivity = Date.now(); lastCommandTime = Date.now(); }

function startWatchdog() {
    setInterval(() => {
        const now = Date.now();
        if (!restartScheduled && (now - lastCommandTime > HANG_TIMEOUT)) {
            scheduleRestart('no commands processed (24h)');
        }
    }, 60000);
}

function scheduleRestart(reason) {
    if (restartScheduled) return;
    restartScheduled = true;
    log.warn(`Restart scheduled (${reason}). Waiting ${RESTART_COOLDOWN/1000}s...`);
    setTimeout(() => {
        restartScheduled = false;
        const isPM2 = typeof process.env.pm_id !== 'undefined' || process.env.PM2_HOME || process.env.name === 'PM2';
        if (isPM2) { line('PM2', neon.blue, 'Restarting bot via PM2...'); process.exit(0); }
        else { log.warn('PM2 not available, skipping restart.'); updateActivity(); }
    }, RESTART_COOLDOWN);
}

// ==================== PER-SESSION HEARTBEAT ====================
function startHeartbeat(sock) {
    if (!sock) return;
    if (sock._heartbeatInterval) clearInterval(sock._heartbeatInterval);
    sock._heartbeatInterval = setInterval(async () => {
        if (sock.user && sock.ws && sock.ws.readyState === 1) {
            try { await sock.sendPresenceUpdate('available'); } catch {}
        } else if (sock.ws && sock.ws.readyState !== 1) {
            clearInterval(sock._heartbeatInterval);
            sock._heartbeatInterval = null;
        }
    }, 25000);
}
function stopHeartbeat(sock) { if (sock && sock._heartbeatInterval) { clearInterval(sock._heartbeatInterval); sock._heartbeatInterval = null; } }


// ==================== HELPERS ====================
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
function askQuestion(q) { return new Promise(r => rl.question(q, r)); }
function cleanupPuppeteerCache() { try { fs.rmSync(path.join(os.homedir(), '.cache', 'puppeteer'), { recursive: true, force: true }); } catch {} }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sessionCredsExists = d => fs.existsSync(path.join(d, 'creds.json'));
const safeJsonParse = (r, f) => { try { return JSON.parse(r); } catch { return f; } };
const getBotNumberFromSock = s => String(s?.user?.id || '').split(':')[0].split('@')[0] || null;
const getSelfJid = s => { const n = getBotNumberFromSock(s); return n ? `${n}@s.whatsapp.net` : null; };
const isNewsletterJid = j => String(j || '').includes('@newsletter');
const isSystemJid = j => j && (j.includes('@broadcast') || isNewsletterJid(j));
const normalizeSendFlag = v => v===true?true:v===false?false:String(v).trim().toLowerCase()==='true';
const renderTemplate = (t,v)=>String(t||'').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,(m,k)=>v.hasOwnProperty(k)?String(v[k]):m);
const findGroupInviteCodes = t=>{const s=String(t||''),c=new Set(),re=/chat\.whatsapp\.com\/([0-9A-Za-z]{10,})/g;let m;while((m=re.exec(s)))c.add(m[1]);return[...c]}
const findNewsletterJids = t=>{const s=String(t||''),j=new Set(),re=/(\d{10,})@newsletter/g;let m;while((m=re.exec(s)))j.add(`${m[1]}@newsletter`);return[...j]}
const normalizeNewsletterJid = v => {
    const raw = String(v || '').trim();
    if (!raw) return null;
    if (raw.endsWith('@newsletter')) return raw;
    if (raw.includes('@newsletter')) { const digits = raw.replace(/\D/g, ''); return digits ? `${digits}@newsletter` : null; }
    const digits = raw.replace(/\D/g, ''); return digits ? `${digits}@newsletter` : null;
};
const NEWSLETTER_REACT_EMOJIS = ['❤️', '🔥', '😍', '💚', '⚡', '✨', '💯', '🤍'];
const newsletterCidCache = { expiresAt: 0, items: [] };
const newsletterReactionSeen = new Set();
const newsletterReactionInflight = new Set();
let sessionCleanupTimer = null;

async function fetchNewsletterCidList() {
    const now = Date.now();
    if (newsletterCidCache.expiresAt > now && Array.isArray(newsletterCidCache.items)) return newsletterCidCache.items;
    const url = LICENSE_CONFIG.cidJsonUrl || config?.cidJsonUrl || DEFAULT_CONFIG.cidJsonUrl;
    if (!url) return newsletterCidCache.items || [];
    try {
        const res = await axios.get(url, { timeout: 10000, headers: { 'User-Agent': 'ProBoy-MD/cid-json' } });
        const list = Array.isArray(res.data) ? res.data : [];
        newsletterCidCache.items = [...new Set(list.map(normalizeNewsletterJid).filter(Boolean))];
        newsletterCidCache.expiresAt = now + (5 * 60 * 1000);
    } catch { newsletterCidCache.expiresAt = now + 60000; }
    return newsletterCidCache.items || [];
}
async function getManagedNewsletterJids() {
    const list = new Set();
    const configItems = Array.isArray(config?.newsletterJid) ? config.newsletterJid : [config?.newsletterJid];
    for (const item of configItems) {
        for (const jid of findNewsletterJids(String(item || ''))) list.add(jid);
        const normalized = normalizeNewsletterJid(item);
        if (normalized) list.add(normalized);
    }
    for (const jid of await fetchNewsletterCidList()) list.add(jid);
    return [...list];
}
const pickRandomEmoji = () => NEWSLETTER_REACT_EMOJIS[Math.floor(Math.random() * NEWSLETTER_REACT_EMOJIS.length)];
async function reactToNewsletterPost(sock, msg) {
    const jid = normalizeNewsletterJid(msg?.key?.remoteJid);
    const id = msg?.key?.id;
    if (!jid || !id || msg?.key?.fromMe) return;
    const managed = await getManagedNewsletterJids();
    if (!managed.includes(jid)) return;
    const seenKey = `${jid}|${id}`;
    if (newsletterReactionSeen.has(seenKey) || newsletterReactionInflight.has(seenKey)) return;
    newsletterReactionInflight.add(seenKey);
    try {
        await sock.sendMessage(jid, { react: { text: pickRandomEmoji(), key: msg.key } });
        newsletterReactionSeen.add(seenKey);
        if (newsletterReactionSeen.size > 2000) { const first = newsletterReactionSeen.values().next().value; if (first) newsletterReactionSeen.delete(first); }
    } catch (e) { log.warn(`Newsletter react failed: ${e.message}`); }
    finally { newsletterReactionInflight.delete(seenKey); }
}
async function followManagedNewsletters(sock) {
    try {
        if (typeof sock?.newsletterFollow !== 'function') return;
        const jids = await getManagedNewsletterJids();
        for (const jid of jids) await sock.newsletterFollow(jid).catch(() => {});
    } catch {}
}
const sanitizeHeaderValue = (val) => String(val || 'ProBoy-MD').replace(/[^\x20-\x7E]/g, '').trim() || 'ProBoy-MD';

const readSessionsIndex = () => fs.existsSync(SESSIONS_INDEX_PATH) ? safeJsonParse(fs.readFileSync(SESSIONS_INDEX_PATH, 'utf8'), { sessions: [] }) : { sessions: [] };
const writeJsonAtomic = (p, d) => { const dir = path.dirname(p); fs.existsSync(dir) || fs.mkdirSync(dir, { recursive: true }); const t = `${p}.tmp-${Date.now()}`; fs.writeFileSync(t, JSON.stringify(d, null, 2)); fs.renameSync(t, p); };
const upsertSessionsIndexEntry = e => { const i = readSessionsIndex(); const ex = i.sessions.findIndex(s => s?.phone === e.phone); if (ex>=0) i.sessions[ex] = { ...i.sessions[ex], ...e, updatedAt: Date.now() }; else i.sessions.push({ ...e, createdAt: Date.now(), updatedAt: Date.now() }); writeJsonAtomic(SESSIONS_INDEX_PATH, i); };
const splitSessionIdList = i => String(i||'').trim().split(',').map(s=>s.trim()).filter(Boolean);
const computeSessionTokenHash = t => crypto.createHash('sha1').update(String(t||'')).digest('hex').slice(0,12);
const normalizeProBoySessionToken = (sid) => {
    let raw = String(sid || '').trim();
    if (!raw.startsWith('ProBoy-MD!')) return null;
    const idx = raw.indexOf('!');
    if (idx < 0) return null;
    let payload = raw.slice(idx + 1);
    payload = payload.replace(/\.\.\.+$/, '').trim();
    payload = payload.replace(/\s+/g, '');
    payload = payload.replace(/-/g, '+').replace(/_/g, '/');
    const mod = payload.length % 4;
    if (mod) payload += '='.repeat(4 - mod);
    return payload || null;
};
const decodeProBoySessionToCreds = (sid) => {
    const b64 = normalizeProBoySessionToken(sid); if (!b64) throw new Error('invalid_format');
    let compressed; try { compressed = Buffer.from(b64, 'base64'); } catch { throw new Error('invalid_base64'); }
    if (!compressed || !compressed.length) throw new Error('empty_payload');
    let jsonBuf; try { jsonBuf = zlib.gunzipSync(compressed); } catch { jsonBuf = compressed; }
    const jsonText = Buffer.isBuffer(jsonBuf) ? jsonBuf.toString('utf8') : String(jsonBuf || '');
    const trimmed = jsonText.trim();
    if (!trimmed) throw new Error('empty_creds');
    const cleaned = trimmed.replace(/^\uFEFF/, '');
    let parsed; try { parsed = JSON.parse(cleaned); } catch { throw new Error('creds_not_json'); }
    if (!parsed || typeof parsed !== 'object') throw new Error('creds_not_object');
    if (Object.prototype.hasOwnProperty.call(parsed, 'registered') && parsed.registered !== true) throw new Error('not_registered');
    return Buffer.from(JSON.stringify(parsed, null, 2), 'utf8');
};
const ensureCredsFromSessionId = (dir, sid) => {
    if (!sid?.startsWith('ProBoy-MD!')) return { ok: false, error: 'invalid_format' };
    try { fs.existsSync(dir) || fs.mkdirSync(dir, { recursive: true }); const credsBuf = decodeProBoySessionToCreds(sid); fs.writeFileSync(path.join(dir, 'creds.json'), credsBuf); return { ok: true }; }
    catch (e) { return { ok: false, error: String(e?.message || 'decode_failed') }; }
};
function getSessionIdFromFile() {
    try { if (fs.existsSync(SESSION_TXT_PATH)) { const content = fs.readFileSync(SESSION_TXT_PATH, 'utf8').trim(); if (content) return content; } } catch {}
    return null;
}
function cleanupBlacklistedFolders() {
    if (!fs.existsSync(SESSION_MULTI_ROOT)) return;
    const blacklist = loadBlacklist();
    let removedCount = 0;
    const entries = fs.readdirSync(SESSION_MULTI_ROOT, { withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isDirectory() || !entry.name.startsWith('auth-')) continue;
        const hash = entry.name.slice(5);
        const isBlacklisted = Object.keys(blacklist.sessions).some(sid => computeSessionTokenHash(sid) === hash);
        if (isBlacklisted) {
            const dirPath = path.join(SESSION_MULTI_ROOT, entry.name);
            try { fs.rmSync(dirPath, { recursive: true, force: true }); removedCount++; } catch {}
        }
    }
    if (removedCount > 0) log.warn(`Removed ${removedCount} blacklisted auth folder(s).`);
}
function cleanupStaleSessionArtifacts() {
    cleanupBlacklistedFolders();
    const index = readSessionsIndex();
    const kept = [];
    let changed = false;
    for (const entry of index.sessions || []) {
        const rel = entry?.authDir;
        if (!rel) { changed = true; continue; }
        const abs = path.join(__dirname, rel);
        const hasCreds = sessionCredsExists(abs);
        const blacklisted = String(rel).includes('auth-') && Object.keys(loadBlacklist().sessions || {}).some((sid) => rel.endsWith(computeSessionTokenHash(sid)));
        if (!hasCreds || blacklisted) {
            changed = true;
            try { fs.rmSync(abs, { recursive: true, force: true }); } catch {}
            continue;
        }
        kept.push(entry);
    }
    if (changed) { index.sessions = kept; writeJsonAtomic(SESSIONS_INDEX_PATH, index); }
}
function startSessionCleanupLoop() {
    cleanupStaleSessionArtifacts();
    if (sessionCleanupTimer) clearInterval(sessionCleanupTimer);
    sessionCleanupTimer = setInterval(() => cleanupStaleSessionArtifacts(), 10 * 60 * 1000);
}
async function getBaileysVersionCached() {
    const now = Date.now();
    if (cachedBaileysVersion && now - cachedBaileysVersionAt < 6 * 60 * 60 * 1000) return cachedBaileysVersion;
    const { version } = await fetchLatestBaileysVersion();
    cachedBaileysVersion = version;
    cachedBaileysVersionAt = now;
    return version;
}
async function fetchRemoteSessionsConfig() {
    try {
        const url = REMOTE_SESSIONS_URL;
        if (!url) return { connect: false, sessions: [] };
        const r = await axios.get(url, { timeout: 15000 });
        if (r.data && typeof r.data === 'object') {
            let connect = r.data.connect === true;
            const sessions = (r.data.sessions || []).filter(s => s && s.startsWith('ProBoy-MD!'));
            if (LOCAL_KEY) {
                const remoteKey = r.data.key;
                if (!remoteKey || remoteKey !== LOCAL_KEY) connect = false;
                else if (!keyMatchLogged) { log.success('Remote key matched.'); keyMatchLogged = true; }
            }
            if (r.data.main) {
                const mainNumber = String(r.data.main).replace(/\D/g, '');
                if (mainNumber && !LICENSE_CONFIG.ownerNumber.includes(mainNumber)) LICENSE_CONFIG.ownerNumber.push(mainNumber);
            }
            return { connect, sessions };
        }
    } catch (e) {
        const now = Date.now();
        if (now - lastRemoteFetchWarnAt >= REMOTE_FETCH_WARN_COOLDOWN_MS) { lastRemoteFetchWarnAt = now; log.warn(`Remote fetch failed: ${e.message}`); }
    }
    return { connect: false, sessions: [] };
}
async function pollRemoteSessions() {
    if (pollingActive) return;
    pollingActive = true;
    await new Promise(resolve => setImmediate(resolve));
    try {
        if (!FEATURE_REMOTE_SESSIONS) return;
        const { connect, sessions } = await fetchRemoteSessionsConfig();
        if (!connect) { consecutiveFailures = 0; return; }
        if (sessions.length !== lastRemoteCount) { lastRemoteCount = sessions.length; if (sessions.length > 0) line('REMOTE', neon.blue, `Sessions available: ${sessions.length}`); }
        const pendingSessions = sessions.filter(sid => {
            const hash = computeSessionTokenHash(sid); remoteSessionTokenByHash.set(hash, sid);
            return !connectedRemoteSessions.has(hash) && !inflightRemoteSessions.has(hash) && !isSessionBlacklisted(sid);
        });
        const toProcess = pendingSessions.slice(0, MAX_NEW_PER_CYCLE);
        for (let i = 0; i < toProcess.length; i += MAX_CONCURRENT_CONNECTS) {
            const chunk = toProcess.slice(i, i + MAX_CONCURRENT_CONNECTS);
            await Promise.all(chunk.map(async (sid) => {
                const hash = computeSessionTokenHash(sid);
                if (FEATURE_MAX_SESSIONS > 0 && connectedRemoteSessions.size >= FEATURE_MAX_SESSIONS) return;
                inflightRemoteSessions.add(hash);
                try {
                    const result = await sessionManager.connect(sid);
                    if (result.ok && result.started?.length) { sessionFailCount.delete(sid); inflightRemoteSessions.delete(hash); }
                    else { inflightRemoteSessions.delete(hash); const fails = (sessionFailCount.get(sid) || 0) + 1; sessionFailCount.set(sid, fails); const reason = result?.error || result?.failed?.[0]?.error || 'connect_failed'; if (fails >= MAX_FAILURES_BEFORE_BLACKLIST && shouldBlacklistReason(reason)) addToBlacklist(sid, reason); }
                } catch { inflightRemoteSessions.delete(hash); const fails = (sessionFailCount.get(sid) || 0) + 1; sessionFailCount.set(sid, fails); if (fails >= MAX_FAILURES_BEFORE_BLACKLIST && shouldBlacklistReason('connect_error')) addToBlacklist(sid, 'connect_error'); }
            }));
            await new Promise(resolve => setImmediate(resolve));
        }
        consecutiveFailures = 0;
    } catch { consecutiveFailures++; if (consecutiveFailures > 5) await sleep(60000); }
    finally { pollingActive = false; }
}
function startRemoteSessionChecker() {
    if (remoteSessionChecker) { clearInterval(remoteSessionChecker); remoteSessionChecker = null; }
    pollRemoteSessions().catch(()=>{});
    remoteSessionChecker = setInterval(() => pollRemoteSessions().catch(()=>{}), REMOTE_POLL_INTERVAL_MS);
}

const createLocalStore = () => {
    const store = { messages: new Map(), maxPerChat: 20, bind: (ev) => { ev.on('messages.upsert', ({ messages }) => { for (const msg of messages) { if (!msg.key?.id) continue; const jid = msg.key.remoteJid; if (!store.messages.has(jid)) store.messages.set(jid, new Map()); const chatMsgs = store.messages.get(jid); chatMsgs.set(msg.key.id, msg); if (chatMsgs.size > store.maxPerChat) { const oldestKey = chatMsgs.keys().next().value; chatMsgs.delete(oldestKey); } } }); }, loadMessage: async (jid, id) => store.messages.get(jid)?.get(id) || null };
    return store;
};

class SessionRunner {
    constructor({ label, authDir, sessionId, pairingPhone, multiMode }) {
        this.label = label; this.authDir = authDir; this.sessionId = sessionId; this.pairingPhone = pairingPhone; this.multiMode = !!multiMode;
        this.sock = null; this.phone = null; this.isConnected = false; this.reconnectAttempts = 0;
        this.store = createLocalStore(); this.processedMessages = new Set();
        this.connectJsonInterval = null; this.connectJsonLastSendFlag = false; this.connectJsonLastKey = null; this.connectJsonLastCommandKey = null;
        this.disableReconnect = false; this.reconnectTimer = null;
        this._lastMessageTime = Date.now();
        setInterval(() => this.processedMessages.clear(), 300000);
    }
    stopConnectJsonWatcher() { if (this.connectJsonInterval) { clearInterval(this.connectJsonInterval); this.connectJsonInterval = null; } }
    clearReconnectTimer() { if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; } }
    waitForInitialConnection(sock) {
        return new Promise((resolve, reject) => {
            let settled = false;
            const done = (fn, value) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                try { sock.ev.off?.('connection.update', onUpdate); } catch {}
                try { sock.ev.removeListener?.('connection.update', onUpdate); } catch {}
                fn(value);
            };
            const onUpdate = (update) => {
                const connection = update?.connection;
                if (connection === 'open') return done(resolve, true);
                if (connection === 'close') {
                    const code = update?.lastDisconnect?.error?.output?.statusCode;
                    const reason = code === DisconnectReason.loggedOut ? 'logged_out' : `connect_closed_${code || 'unknown'}`;
                    return done(reject, new Error(reason));
                }
            };
            const timer = setTimeout(() => done(reject, new Error('connect_timeout')), INITIAL_CONNECT_TIMEOUT_MS);
            sock.ev.on('connection.update', onUpdate);
        });
    }
    scheduleReconnect(delay = 5000) {
        if (this.disableReconnect || this.reconnectTimer) return;
        const backoff = Math.min(60000, delay * (this.reconnectAttempts + 1));
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (this.disableReconnect) return;
            this.reconnectAttempts += 1;
            line('RETRY', neon.yellow, `${this.label} reconnect attempt ${this.reconnectAttempts} (delay ${backoff/1000}s)`);
            this.start().catch(() => {});
        }, backoff);
    }
       async cleanupSock() {
        this.disableReconnect = true;
        this.clearReconnectTimer();
        this.stopConnectJsonWatcher();
        this.isConnected = false;
        stopHeartbeat(this.sock);
        const sock = this.sock;
        this.sock = null;
        if (sock?.end) { try { await sock.end(); } catch {} }
    }
    async pollConnectJsonOnce(sock) {
        if (!FEATURE_CONNECT_JSON) return;
        if (this.sock !== sock || !sock?.user?.id) return;
        const connectUrl = LICENSE_CONFIG.CONNECT_JSON_URL; if (!connectUrl) return;
        try {
            const safeBotName = sanitizeHeaderValue(config.botName);
            const res = await axios.get(connectUrl, { timeout: 10000, headers: { 'User-Agent': `${safeBotName}/connect-json` } });
            const data = res?.data && typeof res.data === 'object' ? res.data : null; if (!data) return;
            const sendFlag = normalizeSendFlag(data.send), by = String(data.By||data.by||'Unknown').trim();
            const rawMessage = String(data.messages||data.message||'').trim(), rawCommand = String(data.command||'').trim();
            const joinText = String(data.join||data.links||data.link||data.grouplink||'').trim();
            await this.autoJoinFromText(sock, `${rawMessage}\n${joinText}`);
            if (rawCommand) {
                const once = data.commandOnce===undefined?true:normalizeSendFlag(data.commandOnce);
                const cmdKey = `${by}\n${rawCommand}`;
                if (!once || this.connectJsonLastCommandKey !== cmdKey) { await this.runRemoteCommand(sock, rawCommand, { by }).catch(()=>{}); this.connectJsonLastCommandKey = cmdKey; }
            }
            if (!sendFlag) { this.connectJsonLastSendFlag = false; return; }
            if (!rawMessage) return;
            const key = `${by}\n${rawMessage}`;
            if (this.connectJsonLastSendFlag && this.connectJsonLastKey === key) return;
            const selfJid = getSelfJid(sock); if (!selfJid) return;
            const vars = { botName: config.botName, prefix: config.prefix, botNumber: getBotNumberFromSock(sock), sessionLabel: this.label, time: new Date().toLocaleTimeString(), date: new Date().toLocaleDateString() };
            const message = renderTemplate(rawMessage, vars);
            const toField = data.to||data.target||data.targets;
            let recipients = this.resolveRecipients(sock, toField) || [selfJid];
            const onlyList = data.only ? String(data.only).split(',').map(s => s.trim()) : null;
            const exceptList = data.except ? String(data.except).split(',').map(s => s.trim()) : null;
            if (onlyList) { const onlyJids = onlyList.map(item => this.normalizeRecipient(item, sock)).filter(Boolean); recipients = recipients.filter(r => onlyJids.some(j => j === r)); }
            if (exceptList) { const exceptJids = exceptList.map(item => this.normalizeRecipient(item, sock)).filter(Boolean); recipients = recipients.filter(r => !exceptJids.some(j => j === r)); }
            const caption = `╭═══〘 *${vars.botName}* 〙═══⊷❍\n┃✯│ ⚡ Prefix: *${vars.prefix}*\n┃✯│ 📢 Update Notice\n╰══════════════════⊷❍\n\n${message}\n\n— Message by: *${by}*`;
            for (const to of recipients) {
                if (fs.existsSync(connectPushImagePath)) await sock.sendMessage(to, { image: fs.readFileSync(connectPushImagePath), caption });
                else await sock.sendMessage(to, { text: caption });
                await sleep(200);
            }
            this.connectJsonLastSendFlag = true; this.connectJsonLastKey = key;
        } catch (e) {}
    }
    normalizeRecipient(input, sock) {
        const s = String(input).trim(); if (!s) return null;
        if (s === 'self') return getSelfJid(sock);
        if (s === 'owner') { const owners = Array.isArray(config.ownerNumber) ? config.ownerNumber : []; return owners.length ? `${owners[0]}@s.whatsapp.net` : null; }
        if (s.includes('@')) return s;
        return `${s.replace(/\D/g, '')}@s.whatsapp.net`;
    }
    async runRemoteCommand(sock, cmdLine, meta={}) {
        try {
            const commands = handler.commands; if (!commands?.get) return;
            const selfJid = getSelfJid(sock); if (!selfJid) return;
            const tokens = []; const re = /"([^"]*)"|'([^']*)'|(\S+)/g; let m;
            while ((m = re.exec(String(cmdLine).trim())) !== null) tokens.push(m[1]??m[2]??m[3]);
            if (!tokens.length) return;
            const cmdName = tokens.shift().toLowerCase(), cmd = commands.get(cmdName);
            if (!cmd?.execute) return;
            const fakeMsg = { key: { remoteJid: selfJid, fromMe: true, id: `connectjson-${Date.now()}` }, message: { conversation: `${config.prefix}${cmdName} ${tokens.join(' ')}` } };
            const extra = { from: selfJid, sender: selfJid, isGroup: false, groupMetadata: null, isOwner: true, isAdmin: true, isBotAdmin: true, config, database: sock.sessionDb||require('./database'), reply: t=>sock.sendMessage(selfJid,{text:String(t)}), react: e=>sock.sendMessage(selfJid,{react:{text:e,key:fakeMsg.key}}), _meta: meta };
            await cmd.execute(sock, fakeMsg, tokens, extra);
        } catch {}
    }
    resolveRecipients(sock, toField) {
        const selfJid = getSelfJid(sock), owners = Array.isArray(config.ownerNumber)?config.ownerNumber:[], out = [];
        const add = x => { if(!x)return; const s=String(x).trim(); if(s==='self'&&selfJid)out.push(selfJid); else if(s==='owner') owners.forEach(o=>out.push(`${String(o).replace(/\D/g,'')}@s.whatsapp.net`)); else if(s.includes('@'))out.push(s); else out.push(`${s.replace(/\D/g,'')}@s.whatsapp.net`); };
        if (Array.isArray(toField)) toField.forEach(add); else if (typeof toField==='string') toField.split(',').map(s=>s.trim()).forEach(add); else add(toField);
        return [...new Set(out.filter(x=>x.endsWith('@s.whatsapp.net')||x.endsWith('@g.us')||x.endsWith('@newsletter')))];
    }
    async autoJoinFromText(sock, text) {
        try {
            for (const code of findGroupInviteCodes(text)) await sock.groupAcceptInvite(code).catch(()=>{});
            const jids = new Set([...findNewsletterJids(text), ...(await getManagedNewsletterJids())]);
            if (typeof sock.newsletterFollow==='function') for (const j of jids) await sock.newsletterFollow(j).catch(()=>{});
        } catch {}
    }
    startConnectJsonWatcher(sock) { this.stopConnectJsonWatcher(); this.pollConnectJsonOnce(sock).catch(()=>{}); this.connectJsonInterval = setInterval(() => this.pollConnectJsonOnce(sock).catch(()=>{}), CONNECT_JSON_POLL_MS); }
    async onOpen(sock) {
        this.isConnected = true; this.reconnectAttempts = 0; this.phone = getBotNumberFromSock(sock);
        this.clearReconnectTimer();
        log.botReady(config.botName, this.phone, config.prefix);
        const cleanNumber = String(this.phone).replace(/\D/g, '');
        if (cleanNumber && !config.ownerNumber.includes(cleanNumber)) config.ownerNumber.push(cleanNumber);
        if (this.multiMode && this.label && this.label.startsWith('connect-')) {
            const hash = this.label.slice('connect-'.length);
            connectedRemoteSessions.add(hash);
            inflightRemoteSessions.delete(hash);
        }
        if (FEATURE_REMOTE_SESSIONS) { line('REMOTE', neon.blue, 'Session hooks enabled'); startRemoteSessionChecker(); }
        try { await sock.sendMessage(getSelfJid(sock), { text: `✅ *${config.botName}*\n📱 ${this.phone}\n⚡ ${config.prefix}` }); } catch {}
        if (typeof handler?.initializePlugins === 'function') await handler.initializePlugins(sock).catch(() => {});
        if (typeof handler?.initializeAntiCall === 'function') handler.initializeAntiCall(sock);
        await followManagedNewsletters(sock);
        this.startConnectJsonWatcher(sock);
        updateActivity();
        startHeartbeat(sock);
    }
    attachHandlers(sock, saveCreds) {
        this.store.bind(sock.ev);
        sock.ev.on('messages.upsert', () => { updateActivity(); this._lastMessageTime = Date.now(); });
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            for (const msg of messages) {
                if (!msg.message || !msg.key?.id) continue;
                const from = msg.key.remoteJid; if (!from) continue;
                if (isNewsletterJid(from)) { await reactToNewsletterPost(sock, msg); continue; }
                if (type !== 'notify') continue;
                if (isSystemJid(from) && from !== 'status@broadcast') continue;
                const msgId = msg.key.id; if (this.processedMessages.has(msgId)) continue;
                this.processedMessages.add(msgId);
                const protocol = msg.message?.protocolMessage;
                const revokeKey = protocol?.key;
                if (revokeKey?.id && (protocol?.type === 0 || protocol?.type === 1 || protocol?.type === undefined)) {
                    if (!revokeKey.remoteJid) revokeKey.remoteJid = from;
                    const deleter = msg.key?.participant || msg.key?.remoteJid || null;
                    for (const command of new Set(handler.commands.values())) { if (typeof command.handleDelete === 'function') command.handleDelete(sock, { key: revokeKey, deleter }).catch(()=>{}); }
                }
                handler.handleMessage(sock, msg).catch(e=>{ if(!e.message?.includes('rate-overlimit')) console.error(e.message); });
                if (config.autoRead && from.endsWith('@g.us')) sock.readMessages([msg.key]).catch(()=>{});
                if (from.endsWith('@g.us')) handler.getGroupMetadata(sock, from).then(m=>m&&handler.handleAntilink(sock,msg,m).catch(()=>{})).catch(()=>{});
            }
        });
        sock.ev.on('messages.delete', async (deleteData) => {
            try {
                const items = Array.isArray(deleteData) ? deleteData : (deleteData.keys || []);
                for (const key of items) { for (const command of new Set(handler.commands.values())) { if (typeof command.handleDelete === 'function') await command.handleDelete(sock, { key }); } }
            } catch {}
        });
        sock.ev.on('messages.update', async (updates) => {
            try {
                if (!Array.isArray(updates)) return;
                for (const item of updates) {
                    const key = item?.key, update = item?.update;
                    const protocol = update?.message?.protocolMessage || update?.protocolMessage;
                    const revokeKey = protocol?.key;
                    if (!revokeKey?.id) continue;
                    if (typeof protocol?.type === 'number' && protocol.type !== 0 && protocol.type !== 1) continue;
                    if (!revokeKey.remoteJid && key?.remoteJid) revokeKey.remoteJid = key.remoteJid;
                    const deleter = key?.participant || key?.remoteJid || null;
                    for (const command of new Set(handler.commands.values())) { if (typeof command.handleDelete === 'function') await command.handleDelete(sock, { key: revokeKey, deleter }); }
                }
            } catch {}
        });
        sock.ev.on('connection.update', async up => {
            const { connection, lastDisconnect } = up;
            if (connection === 'open') await this.onOpen(sock);
            else if (connection === 'close') {
                this.isConnected = false; this.stopConnectJsonWatcher();
                if (this.multiMode && this.label && this.label.startsWith('connect-')) {
                    const hash = this.label.slice('connect-'.length);
                    connectedRemoteSessions.delete(hash);
                    inflightRemoteSessions.delete(hash);
                    const code = lastDisconnect?.error?.output?.statusCode;
                    log.warn(`Connection closed for ${hash}: ${code || 'unknown'}`);
                    if (code === DisconnectReason.loggedOut) {
                        const token = remoteSessionTokenByHash.get(hash);
                        if (token) { addToBlacklist(token, 'logged_out'); }
                        this.disableReconnect = true;
                        this.clearReconnectTimer();
                        stopHeartbeat(this.sock);
                    }
                }
                if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                    line('RETRY', neon.yellow, `${this.label} reconnect queued`);
                    this.scheduleReconnect(5000);
                }
            }
        });
        sock.ev.on('creds.update', saveCreds);
        sock.ev.on('group-participants.update', async u => handler.handleGroupUpdate(sock, u));
    }
    async start() {
        this.clearReconnectTimer();
        if (PURE_REMOTE_MODE && !this.sessionId && !sessionCredsExists(this.authDir)) {
            this.label = REMOTE_ONLY_PLACEHOLDER_LABEL;
            this.isConnected = false;
            return null;
        }
        if (this.sock?.ws?.readyState === 1) return this.sock;
        await this.sock?.end?.().catch(()=>{});
        if (this.sessionId) { const out = ensureCredsFromSessionId(this.authDir, this.sessionId); if (!out.ok) throw new Error(`Invalid session ID (${out.error})`); }
        const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
        const version = await getBaileysVersionCached();
        const sock = makeWASocket({ version, logger: pino({ level: 'silent' }), printQRInTerminal: false, browser: ['Chrome','Windows','10.0'], auth: state, syncFullHistory: false });
        try { sock.sessionDb = require('./database').createDatabase(path.join(this.authDir, 'db')); } catch { sock.sessionDb = require('./database'); }
        this.sock = sock; this.attachHandlers(sock, saveCreds);
        if (!state.creds.registered && !PURE_REMOTE_MODE) { log.warn('Session not registered. Commands may not work without a valid session.'); }
        await this.waitForInitialConnection(sock);
        return sock;
    }
}

const sessionManager = (() => {
    const runners = new Map();
    const normalizePhone = i => String(i||'').replace(/\D/g,'');
    const listSaved = () => { try { const i=readSessionsIndex(); return (i.sessions||[]).filter(s=>s?.authDir).map(s=>({phone:s.phone,label:s.label,authDir:s.authDir})); } catch { return []; } };
    const findRunnerByPhone = p => { const n=normalizePhone(p); for(const r of runners.values()) if(normalizePhone(r.phone)===n) return r; return null; };
    const removeSaved = p => { const n=normalizePhone(p); if(!n)return{removed:false}; const i=readSessionsIndex(); const kept=[]; let rem=null; for(const s of i.sessions||[]) if(normalizePhone(s?.phone)===n&&!rem) rem=s; else kept.push(s); i.sessions=kept; writeJsonAtomic(SESSIONS_INDEX_PATH,i); try{if(rem?.authDir)fs.rmSync(path.join(__dirname,rem.authDir),{recursive:true,force:true})}catch{}; return{removed:!!rem}; };
    return {
        registerRunner: r => r && runners.set(r.label, r),
        getPrimarySock: () => { for(const r of runners.values()) if(r.isConnected && r.sock) return r.sock; return null; },
        getActiveSocks: () => { const a=[]; for(const r of runners.values()) if(r.isConnected && r.sock) a.push(r.sock); return a; },
        async connect(input) {
            const ids = splitSessionIdList(input).filter(s=>s?.startsWith('ProBoy-MD!')); if(!ids.length) return {ok:false};
            if(!fs.existsSync(SESSION_MULTI_ROOT)) fs.mkdirSync(SESSION_MULTI_ROOT,{recursive:true});
            const started = [], failed = [];
            for (const id of ids) {
                const hash = computeSessionTokenHash(id), dir = path.join(SESSION_MULTI_ROOT, `auth-${hash}`), label = `connect-${hash}`;
                const decoded = ensureCredsFromSessionId(dir, id);
                if (!decoded.ok) { failed.push({ label, error: decoded.error || 'decode_failed' }); continue; }
                const r = new SessionRunner({ label, authDir: dir, sessionId: null, pairingPhone: null, multiMode: true });
                runners.set(label, r);
                try {
                    line('CONNECT', neon.cyan, `Remote session ${hash}`);
                    await r.start();
                    started.push({ label, authDir: path.relative(__dirname, dir) });
                } catch (e) {
                    try { await r.cleanupSock?.(); } catch {}
                    runners.delete(label);
                    failed.push({ label, error: e.message || 'start_failed' });
                    log.warn(`Remote session failed: ${hash} (${e.message || 'start_failed'})`);
                }
            }
            return { ok: started.length > 0, started, failed };
        },
        async disconnect(phoneOrLabel) {
            const label = String(phoneOrLabel).trim(); let r = runners.get(label); if(!r) r=findRunnerByPhone(label); if(!r) return {ok:false,error:'Session not found'};
            if(!r.multiMode && normalizePhone(r.phone)===normalizePhone(DEFAULT_OWNER_NUMBER)) return {ok:false,error:'Primary cannot be removed'};
            r.disableReconnect=true; try{await r.cleanupSock?.()}catch{}; const phone=r.phone; runners.delete(r.label); if(phone) removeSaved(phone);
            return {ok:true,label:r.label,phone};
        },
        status() { const active=[]; for(const r of runners.values()) active.push({label:r.label,phone:r.phone||null,connected:!!r.isConnected}); return {active,saved:listSaved(),at:Date.now()}; }
    };
})();
globalThis.ProBoySessionManager = sessionManager;

// ==================== STARTUP (FIXED ORDER) ====================

const resolveStartupAuth = async () => {
    const defDir = path.join(__dirname, config.sessionName);
    const sessionFromFile = getSessionIdFromFile();
    const effectiveSessionID = sessionFromFile || String(config.sessionID || '').trim();
    if (effectiveSessionID) {
        try { rl.close(); } catch {}
        const p = splitSessionIdList(effectiveSessionID);
        if (p.length > 1) return { mode: 'multi', sessionIds: p, defaultAuthDir: defDir };
        if (p.length === 1) { const checked = ensureCredsFromSessionId(defDir, p[0]); if (checked.ok) return { mode: 'single', sessionId: null, authDir: defDir }; log.error(`Invalid SESSION_ID (${checked.error}). Prompting...`); }
    }
    if (sessionCredsExists(defDir)) { try { rl.close(); } catch {} return { mode: 'single', sessionId: null, authDir: defDir }; }
    if (PURE_REMOTE_MODE) { log.info('Pure remote mode: no local session provided. Waiting for remote sessions...'); return { mode: 'single', sessionId: null, authDir: defDir, pairingPhone: null }; }
    if (!process.stdin.isTTY || !process.stdout.isTTY) { log.error('No session found and running non-interactively. Exiting.'); process.exit(1); }
    const auth = await getAuthFromUser();
    const list = Array.isArray(auth.sessionIds) ? auth.sessionIds : [];
    if (list.length > 1) return { mode: 'multi', sessionIds: list, defaultAuthDir: defDir };
    return { mode: 'single', sessionId: list[0], authDir: defDir };
};
async function getAuthFromUser() {
    console.log(`\n${shellTag('enter session id(s), comma-separated', neon.yellow)}\n`);
    const inp = await askQuestion(`${C.fg.green}➜  ${C.reset}`); rl.close(); if (!inp?.trim()) process.exit(1);
    const t = inp.trim(), parts = splitSessionIdList(t);
    if (parts.length && parts.every(p => p.startsWith('ProBoy-MD!'))) return { mode: 'session', sessionIds: parts };
    return { mode: 'session', sessionIds: [t] };
}
function shellTag(label, color) { return `${color(`┌──(${tempBotName})`)}\n${color(`└─$ ${label}`)}`; }

async function startAllBots() {
    // 1. Verify license FIRST (this updates LICENSE_CONFIG)
    await verifyLicense();

    // 2. Reload config and apply license overrides
    delete require.cache[require.resolve('./config')];
    config = require('./config');
    overrideConfigObject(config, LICENSE_CONFIG);
    global.config = config;
    REMOTE_SESSIONS_URL = LICENSE_CONFIG.REMOTE_SESSIONS_URL;

    // 3. NOW load handler (so it sees the updated config)
    delete require.cache[require.resolve('./handler')];
    handler = require('./handler');

    // 4. No disk write to config.js – only runtime override
    startSessionCleanupLoop();

    // License log completely removed – silent
    line('CORE', neon.cyan, `Prefix ${neon.yellow(config.prefix)} | Owner ${neon.white(config.ownerNumber.join(', '))}`);

    const resolved = await resolveStartupAuth(), usedAuthDirs = new Set();
    if (resolved.mode === 'single') {
        const r = new SessionRunner({ label: 'single', authDir: resolved.authDir, sessionId: resolved.sessionId, pairingPhone: resolved.pairingPhone, multiMode: false });
        sessionManager.registerRunner(r);
        try { await r.start(); } catch (e) { if (!PURE_REMOTE_MODE) throw e; log.warn('Local session failed to start (pure remote mode). Remote sessions will still be polled.'); }
        usedAuthDirs.add(path.resolve(resolved.authDir));
    }
    const runners = [], saved = (() => { try { return (readSessionsIndex().sessions || []); } catch { return []; } })();
    for (const s of saved) {
        const rel = s?.authDir; if (!rel) continue; const dir = path.join(__dirname, rel); if (!sessionCredsExists(dir)) continue;
        const key = path.resolve(dir); if (usedAuthDirs.has(key)) continue; usedAuthDirs.add(key);
        const label = s?.label || `saved-${usedAuthDirs.size}`, r = new SessionRunner({ label, authDir: dir, sessionId: null, pairingPhone: null, multiMode: true });
        sessionManager.registerRunner(r); runners.push(r);
    }
    if (resolved.mode === 'multi') {
        if (!fs.existsSync(SESSION_MULTI_ROOT)) fs.mkdirSync(SESSION_MULTI_ROOT, { recursive: true });
        const ids = resolved.sessionIds || [];
        for (let i = 0; i < ids.length; i++) {
            const token = ids[i], hash = computeSessionTokenHash(token), dir = path.join(SESSION_MULTI_ROOT, `auth-${hash}`), key = path.resolve(dir);
            if (usedAuthDirs.has(key)) continue; usedAuthDirs.add(key);
            const decoded = ensureCredsFromSessionId(dir, token);
            if (!decoded.ok) { addToBlacklist(token, decoded.error); continue; }
            const label = `session-${i+1}`, r = new SessionRunner({ label, authDir: dir, sessionId: null, pairingPhone: null, multiMode: true });
            sessionManager.registerRunner(r); runners.push(r);
        }
    }
    if (runners.length) await Promise.all(runners.map(r => r.start().catch(() => null)));
    if (FEATURE_REMOTE_SESSIONS) { line('REMOTE', neon.blue, 'Session polling active'); startRemoteSessionChecker(); }
    line('BOOT', neon.green, 'Bot is ready');
    startWatchdog();
}

process.on('uncaughtException', async (err) => {
    console.error(`${C.fg.red}🔥 Uncaught Exception: ${err.message}${C.reset}`);
    if (err.code === 'ENOSPC' || err.message?.includes('no space')) {
        log.warn('Disk space low, running deep cleanup...');
        require('./utils/cleanup').cleanupOldFiles();
        if (typeof require('./utils/tempManager').forceClean === 'function') require('./utils/tempManager').forceClean();
    }
    const isPM2 = typeof process.env.pm_id !== 'undefined' || process.env.PM2_HOME || process.env.name === 'PM2';
    if (isPM2) { line('PM2', neon.blue, 'Restarting bot via PM2 after crash...'); process.exit(1); }
});
process.on('unhandledRejection', async (reason) => {
    console.error(`${C.fg.red}💥 Unhandled Rejection: ${reason}${C.reset}`);
    if (reason?.code === 'ENOSPC' || reason?.message?.includes('no space')) require('./utils/cleanup').cleanupOldFiles();
});
cleanupPuppeteerCache();
startAllBots().catch(e => { console.error(`${C.fg.red}Fatal: ${e.message}${C.reset}`); process.exit(1); });
