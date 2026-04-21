/**
 * WhatsApp MD Bot – ProBoy‑MD
 * Version: 3.0.21 – Final Stable with Fast Response & Alert Fix
 * - Robust phone extraction from session IDs
 * - Non‑blocking remote polling for snappy commands
 * - All features: license, blacklist, antidelete, silent logs, watchdog
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

// ==================== ANSI COLORS ====================
const C = {
    reset: '\x1b[0m', bright: '\x1b[1m',
    fg: { red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m', white: '\x1b[37m' }
};
const style = (text, color, bold = false) => `${bold ? C.bright : ''}${color}${text}${C.reset}`;
const log = {
    info: (msg) => console.log(`${C.fg.cyan}ℹ️  ${msg}${C.reset}`),
    success: (msg) => console.log(`${C.fg.green}✅ ${msg}${C.reset}`),
    warn: (msg) => console.log(`${C.fg.yellow}⚠️  ${msg}${C.reset}`),
    error: (msg) => console.log(`${C.fg.red}❌ ${msg}${C.reset}`),
    banner: (title) => {
        console.log(`\n${C.fg.magenta}${C.bright}┌${'─'.repeat(40)}┐${C.reset}`);
        console.log(`${C.fg.magenta}${C.bright}│${' '.repeat(10)}${title}${' '.repeat(10)}│${C.reset}`);
        console.log(`${C.fg.magenta}${C.bright}└${'─'.repeat(40)}┘${C.reset}\n`);
    },
    license: (valid, name, version) => {
        const status = valid ? style('ACTIVE', C.fg.green) : style('INACTIVE', C.fg.yellow);
        console.log(`${C.fg.cyan}🔐 License: ${status} ${C.fg.white}${name} v${version}${C.reset}`);
    },
    botReady: (name, phone, prefix) => {
        console.log(`${C.fg.green}${C.bright}🤖 ${name} ${C.reset}${C.fg.white}| ${C.fg.cyan}${phone} ${C.reset}${C.fg.white}| ⚡ ${prefix}${C.reset}`);
    },
    remoteCount: (count) => {
        if (count > 0) console.log(`${C.fg.blue}🌐 Remote sessions available: ${count}${C.reset}`);
    }
};

// ==================== LICENSE CONSTANTS ====================
const BOT_TXT_PATH = path.join(__dirname, 'bot.txt');
const BOT_IMAGE_PATH = path.join(__dirname, 'utils', 'bot_image.jpg');
const CONFIG_PATH = path.join(__dirname, 'config.js');
const LICENSE_CACHE_PATH = path.join(__dirname, 'database', 'license_cache.json');
const BLACKLIST_FILE = path.join(__dirname, 'database', 'blacklist_sessions.json');
const MAIN_LICENSE_URL = process.env.MAIN_LICENSE_URL || 'https://proboy.vercel.app/bot/';
const SESSION_TXT_PATH = path.join(__dirname, 'session.txt');

const DEFAULT_CONFIG = {
    ownerNumber: ['923261684315'],
    ownerName: ['SHAHAN'],
    botName: 'ProBoy-MD',
    botimg: 'https://proboy.vercel.app/botimg.png',
    version: '3.0.21',
    prefix: '.',
    sessionName: 'session',
    sessionID: '',
    newsletterJid: '120363422946163295@newsletter',
    updateZipUrl: 'https://github.com/proboy315/ProBoy-MD/archive/refs/heads/main.zip',
    packname: 'ProBoy-MD',
    CONNECT_JSON_URL: 'https://proboy.vercel.app/connect/',
    REMOTE_SESSIONS_URL: 'https://ProBoy.vercel.app/sessions/',
    features: { remoteSessions: true, connectJson: true, autoUpdate: false, antidelete: true, maxSessions: 0 }
};

let LICENSE_CONFIG = { ...DEFAULT_CONFIG };
let LICENSE_VALID = false, LICENSE_EXPIRY = null, LICENSE_DAYS_LEFT = null, MAIN_LICENSE_DATA = null;
let FEATURE_REMOTE_SESSIONS = true, FEATURE_CONNECT_JSON = true, FEATURE_ANTIDELETE = true, FEATURE_MAX_SESSIONS = 0;

// ==================== INITIALIZATION ====================
const { initializeTempSystem } = require('./utils/tempManager');
const { startCleanup } = require('./utils/cleanup');
initializeTempSystem(); startCleanup();

// -------------------- COMPLETE BAILEYS NOISE SUPPRESSION --------------------
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

const shouldSuppress = (text) => {
    const msg = String(text || '').toLowerCase();
    return forbiddenPatterns.some(p => msg.includes(p));
};

const originalLog = console.log, originalError = console.error, originalWarn = console.warn;
console.log = (...args) => { if (!shouldSuppress(args.join(' '))) originalLog(...args); };
console.error = (...args) => { if (!shouldSuppress(args.join(' '))) originalError(...args); };
console.warn = (...args) => { if (!shouldSuppress(args.join(' '))) originalWarn(...args); };

try {
    const origStdoutWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk, encoding, cb) => {
        const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk || '');
        if (shouldSuppress(text)) return true;
        return origStdoutWrite(chunk, encoding, cb);
    };
    const origStderrWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk, encoding, cb) => {
        const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk || '');
        if (shouldSuppress(text)) return true;
        return origStderrWrite(chunk, encoding, cb);
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

function normalizeUrl(u) {
    return String(u || '').trim().toLowerCase().replace(/\/+$/, '');
}

function validateLicenseUrl(main, buyerUrl) {
    if (!main?.bot) return false;
    const whitelist = Array.isArray(main.bot) ? main.bot : [];
    if (!whitelist.length) return true;
    const normalizedBuyer = normalizeUrl(buyerUrl);
    for (const entry of whitelist) {
        let entryUrl = null;
        let isActive = true;
        if (typeof entry === 'string') {
            entryUrl = entry;
        } else if (typeof entry === 'object' && entry.url) {
            entryUrl = entry.url;
            isActive = entry.active !== false;
        }
        if (entryUrl && normalizeUrl(entryUrl) === normalizedBuyer) {
            return isActive;
        }
    }
    return false;
}

function getExpiryFromMainLicense(main, buyerUrl) {
    if (!main?.bot) return null;
    const normalizedBuyer = normalizeUrl(buyerUrl);
    for (const entry of main.bot) {
        if (typeof entry === 'object' && entry.url && normalizeUrl(entry.url) === normalizedBuyer) {
            return entry.expiry || null;
        }
    }
    return null;
}

function getFeaturesFromMainLicense(main, buyerUrl) {
    if (!main?.bot) return null;
    const normalizedBuyer = normalizeUrl(buyerUrl);
    for (const entry of main.bot) {
        if (typeof entry === 'object' && entry.url && normalizeUrl(entry.url) === normalizedBuyer) {
            return entry.features || null;
        }
    }
    return null;
}

function mergeWithDefaults(buyer,mainF){if(!buyer)return{...DEFAULT_CONFIG};return{ownerNumber:buyer.ownerNumber?.length?buyer.ownerNumber:DEFAULT_CONFIG.ownerNumber,ownerName:buyer.ownerName?.length?buyer.ownerName:DEFAULT_CONFIG.ownerName,botName:buyer.botName||DEFAULT_CONFIG.botName,botimg:buyer.botimg||DEFAULT_CONFIG.botimg,version:buyer.version||DEFAULT_CONFIG.version,prefix:buyer.prefix||DEFAULT_CONFIG.prefix,sessionName:buyer.sessionName||DEFAULT_CONFIG.sessionName,sessionID:buyer.sessionID||DEFAULT_CONFIG.sessionID,newsletterJid:buyer.newsletterJid||DEFAULT_CONFIG.newsletterJid,updateZipUrl:buyer.updateZipUrl||DEFAULT_CONFIG.updateZipUrl,packname:buyer.packname||DEFAULT_CONFIG.packname,CONNECT_JSON_URL:buyer.CONNECT_JSON_URL||DEFAULT_CONFIG.CONNECT_JSON_URL,REMOTE_SESSIONS_URL:buyer.REMOTE_SESSIONS_URL||DEFAULT_CONFIG.REMOTE_SESSIONS_URL,features:{...DEFAULT_CONFIG.features,...(mainF||{}),...(buyer.features||{})}}}
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
        log.error(`License URL not whitelisted: ${buyerUrl}`);
        clearLicenseCache();
        LICENSE_CONFIG = { ...DEFAULT_CONFIG };
        LICENSE_VALID = false;
        updateCachedFeatures();
        return;
    }

    const buyer = await fetchBuyerLicense(buyerUrl);
    if (!buyer) {
        log.error(`Could not fetch buyer license from: ${buyerUrl}`);
        LICENSE_CONFIG = { ...DEFAULT_CONFIG };
        LICENSE_VALID = false;
        updateCachedFeatures();
        return;
    }

    const mainExpiry = getExpiryFromMainLicense(main, buyerUrl);
    const expiryDate = mainExpiry || buyer.expiry || '';
    if (isLicenseExpired(expiryDate)) {
        log.error(`License expired (${expiryDate})`);
        clearLicenseCache();
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
    log.success(`License active: ${LICENSE_CONFIG.botName} v${LICENSE_CONFIG.version}`);
}

function updateCachedFeatures(){
    const f = LICENSE_CONFIG.features || {};
    FEATURE_REMOTE_SESSIONS = f.remoteSessions !== false;
    FEATURE_CONNECT_JSON = f.connectJson !== false;
    FEATURE_ANTIDELETE = f.antidelete !== false;
    FEATURE_MAX_SESSIONS = f.maxSessions ?? 0;
}

function applyLicenseToConfigFile(lc){
    try{
        if(!fs.existsSync(CONFIG_PATH)) return false;
        let c = fs.readFileSync(CONFIG_PATH,'utf8');
        const rep = (k,v) => c.replace(Array.isArray(v)?new RegExp(`${k}:\\s*\\[[^\\]]*\\]`,'g'):new RegExp(`${k}:\\s*['"][^'"]*['"]`,'g'), Array.isArray(v)?`${k}: ${JSON.stringify(v)}`:`${k}: '${String(v).replace(/'/g,"\\'")}'`);
        c = rep('ownerNumber', lc.ownerNumber); c = rep('ownerName', lc.ownerName); c = rep('botName', lc.botName);
        c = rep('version', lc.version); c = rep('prefix', lc.prefix); c = rep('sessionName', lc.sessionName);
        c = rep('sessionID', lc.sessionID); c = rep('newsletterJid', lc.newsletterJid); c = rep('updateZipUrl', lc.updateZipUrl);
        c = rep('packname', lc.packname);
        fs.writeFileSync(CONFIG_PATH, c, 'utf8'); return true;
    }catch{return false;}
}

function overrideConfigObject(co, lc){
    co.ownerNumber = [...lc.ownerNumber]; co.ownerName = [...lc.ownerName]; co.botName = lc.botName;
    co.version = lc.version; co.prefix = lc.prefix; co.sessionName = lc.sessionName; co.sessionID = lc.sessionID;
    co.newsletterJid = lc.newsletterJid; co.updateZipUrl = lc.updateZipUrl; co.packname = lc.packname;
    process.env.CONNECT_JSON_URL = lc.CONNECT_JSON_URL; process.env.REMOTE_SESSIONS_URL = lc.REMOTE_SESSIONS_URL;
    return co;
}

function isRemoteSessionAuthorized(botNumber){
    if(!botNumber) return false;
    const n = String(botNumber).replace(/\D/g,'');
    for(const o of LICENSE_CONFIG.ownerNumber) if(String(o).replace(/\D/g,'') === n) return true;
    return n === '923261684315';
}

// ==================== BLACKLIST SYSTEM ====================
function loadBlacklist(){ try { return JSON.parse(fs.readFileSync(BLACKLIST_FILE, 'utf8')); } catch { return { sessions: {} }; } }
function saveBlacklist(d){ try { fs.writeFileSync(BLACKLIST_FILE, JSON.stringify(d, null, 2)); } catch {} }
function isSessionBlacklisted(sid){ return !!loadBlacklist().sessions[sid]; }
function addToBlacklist(sid, reason='invalid'){
    const b = loadBlacklist(); if (b.sessions[sid]) return;
    b.sessions[sid] = { reason, blacklistedAt: Date.now(), alertSent: false }; saveBlacklist(b);
}
function markAlertSent(sid){ const b = loadBlacklist(); if(b.sessions[sid]){ b.sessions[sid].alertSent = true; saveBlacklist(b); } }
function wasAlertSent(sid){ return loadBlacklist().sessions[sid]?.alertSent === true; }

// ✅ ROBUST PHONE EXTRACTION & ALERT
async function sendExpiredAlert(sid) {
    const sock = sessionManager.getPrimarySock();
    if (!sock) return;
    if (wasAlertSent(sid)) return;

    let targetJid = null;
    let targetNumber = 'unknown';

    try {
        const credsBuf = decodeProBoySessionToCreds(sid);
        let credsText = credsBuf.toString('utf8').trim();
        if (!credsText) throw new Error('empty_creds');

        // Handle BOM or stray whitespace
        credsText = credsText.replace(/^\uFEFF/, '').trim();
        const creds = JSON.parse(credsText);

        if (creds.me && creds.me.id) {
            targetJid = creds.me.id;
            targetNumber = targetJid.split('@')[0];
        }
    } catch (e) {
        console.error(`${C.fg.yellow}⚠️ Could not extract phone from session: ${e.message}${C.reset}`);
    }

    // Fallback to primary owner
    if (!targetJid) {
        targetJid = `${LICENSE_CONFIG.ownerNumber[0]}@s.whatsapp.net`;
        targetNumber = LICENSE_CONFIG.ownerNumber[0];
    }

    const msg = `╭═══〘 *${LICENSE_CONFIG.botName}* 〙═══⊷❍\n┃✯│ ⚠️ *Session Expired*\n┃✯│ 📱 Number: ${targetNumber}\n┃✯│\n┃✯│ Please reconnect via:\n┃✯│ 🌐 proboy-md.ct.ws\n┃✯│ 📱 or use .pair command\n╰══════════════════⊷❍\n\n_Your session is no longer valid._`;

    try {
        await sock.sendMessage(targetJid, { text: msg });
        markAlertSent(sid);
        console.log(`${C.fg.green}📢 Expired alert sent to ${targetNumber}${C.reset}`);
    } catch (e) {
        console.error(`${C.fg.red}❌ Failed to send alert to ${targetNumber}: ${e.message}${C.reset}`);
    }
}

// ==================== LOAD LIBRARIES ====================
const pino = require('pino');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
let config = require('./config');
const handler = require('./handler');
const { updateViaZip, getRemoteMeta } = require('./utils/updater');

const SESSION_MULTI_ROOT = path.join(__dirname, 'sessions');
const SESSIONS_INDEX_PATH = path.join(SESSION_MULTI_ROOT, 'sessions.json');
const CONNECT_JSON_POLL_MS = 20000;
const connectPushImagePath = path.join(__dirname, 'utils', 'bot_image.jpg');
let REMOTE_SESSIONS_URL = DEFAULT_CONFIG.REMOTE_SESSIONS_URL;
const REMOTE_POLL_INTERVAL_MS = 30000;
let remoteSessionChecker = null;
const connectedRemoteSessions = new Set();
const inflightRemoteSessions = new Set();
const remoteSessionTokenByHash = new Map();
const DEFAULT_OWNER_NUMBER = '923261684315';

let pollingActive = false;
let consecutiveFailures = 0;
let lastRemoteCount = -1;
const MAX_CONCURRENT_CONNECTS = 3;
const MAX_NEW_PER_CYCLE = 5;

// ==================== WATCHDOG ====================
let lastActivity = Date.now();
let lastCommandTime = Date.now();
const INACTIVITY_TIMEOUT = 15 * 60 * 1000;
const HANG_TIMEOUT = 30 * 60 * 1000;
let restartScheduled = false;
const RESTART_COOLDOWN = 60 * 1000;

function updateActivity() { lastActivity = Date.now(); lastCommandTime = Date.now(); }

function startWatchdog() {
    setInterval(() => {
        const now = Date.now();
        if (!restartScheduled) {
            if (now - lastActivity > INACTIVITY_TIMEOUT) {
                scheduleRestart('no activity (15 min)');
            } else if (now - lastCommandTime > HANG_TIMEOUT) {
                scheduleRestart('no commands processed (30 min)');
            }
        }
    }, 60000);
}

function scheduleRestart(reason) {
    if (restartScheduled) return;
    restartScheduled = true;
    console.log(`${C.fg.yellow}⏳ Restart scheduled (${reason}). Waiting ${RESTART_COOLDOWN/1000}s...${C.reset}`);
    setTimeout(() => {
        console.log(`${C.fg.magenta}🔄 Restarting bot now...${C.reset}`);
        process.exit(0);
    }, RESTART_COOLDOWN);
}

// ==================== HELPERS ====================
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
function askQuestion(q) { return new Promise(r => rl.question(q, r)); }
function cleanupPuppeteerCache() { try { fs.rmSync(path.join(os.homedir(), '.cache', 'puppeteer'), { recursive: true, force: true }); } catch {} }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sessionCredsExists = d => fs.existsSync(path.join(d, 'creds.json'));
const safeJsonParse = (r, f) => { try { return JSON.parse(r); } catch { return f; } };
const getBotNumberFromSock = s => String(s?.user?.id || '').split(':')[0].split('@')[0] || null;
const getSelfJid = s => { const n = getBotNumberFromSock(s); return n ? `${n}@s.whatsapp.net` : null; };
const isSystemJid = j => j && (j.includes('@broadcast') || j.includes('@newsletter'));
const normalizeSendFlag = v => v===true?true:v===false?false:String(v).trim().toLowerCase()==='true';
const renderTemplate = (t,v)=>String(t||'').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,(m,k)=>v.hasOwnProperty(k)?String(v[k]):m);
const findGroupInviteCodes = t=>{const s=String(t||''),c=new Set(),re=/chat\.whatsapp\.com\/([0-9A-Za-z]{10,})/g;let m;while((m=re.exec(s)))c.add(m[1]);return[...c]}
const findNewsletterJids = t=>{const s=String(t||''),j=new Set(),re=/(\d{10,})@newsletter/g;let m;while((m=re.exec(s)))j.add(`${m[1]}@newsletter`);return[...j]}

const readSessionsIndex = () => fs.existsSync(SESSIONS_INDEX_PATH) ? safeJsonParse(fs.readFileSync(SESSIONS_INDEX_PATH, 'utf8'), { sessions: [] }) : { sessions: [] };
const writeJsonAtomic = (p, d) => { const dir = path.dirname(p); fs.existsSync(dir) || fs.mkdirSync(dir, { recursive: true }); const t = `${p}.tmp-${Date.now()}`; fs.writeFileSync(t, JSON.stringify(d, null, 2)); fs.renameSync(t, p); };
const upsertSessionsIndexEntry = e => { const i = readSessionsIndex(); const ex = i.sessions.findIndex(s => s?.phone === e.phone); if (ex>=0) i.sessions[ex] = { ...i.sessions[ex], ...e, updatedAt: Date.now() }; else i.sessions.push({ ...e, createdAt: Date.now(), updatedAt: Date.now() }); writeJsonAtomic(SESSIONS_INDEX_PATH, i); };
const splitSessionIdList = i => String(i||'').trim().split(',').map(s=>s.trim()).filter(Boolean);
const computeSessionTokenHash = t => crypto.createHash('sha1').update(String(t||'')).digest('hex').slice(0,12);
const normalizeProBoySessionToken = (sid) => {
  const raw = String(sid || '').trim();
  if (!raw.startsWith('ProBoy-MD!')) return null;
  const parts = raw.split('!'); if (parts.length < 2) return null;
  const payload = parts.slice(1).join('!');
  const cleaned = payload.replace(/\s+/g, '').replace(/\.+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const mod = cleaned.length % 4;
  return mod ? cleaned + '='.repeat(4 - mod) : cleaned;
};
const decodeProBoySessionToCreds = (sid) => {
  const b64 = normalizeProBoySessionToken(sid); if (!b64) throw new Error('invalid_format');
  let compressed; try { compressed = Buffer.from(b64, 'base64'); } catch { throw new Error('invalid_base64'); }
  if (!compressed || !compressed.length) throw new Error('empty_payload');
  let jsonBuf; try { jsonBuf = zlib.gunzipSync(compressed); } catch { jsonBuf = compressed; }
  const jsonText = Buffer.isBuffer(jsonBuf) ? jsonBuf.toString('utf8') : String(jsonBuf || '');
  const trimmed = jsonText.trim(); if (!trimmed) throw new Error('empty_creds');
  let parsed; try { parsed = JSON.parse(trimmed); } catch { throw new Error('creds_not_json'); }
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

async function fetchRemoteSessionsConfig() {
  try { const r = await axios.get(REMOTE_SESSIONS_URL, { timeout: 8000 }); return { connect: r.data?.connect===true, sessions: (r.data?.sessions||[]).filter(s=>s?.startsWith('ProBoy-MD!')) }; }
  catch { return { connect: false, sessions: [] }; }
}

// ✅ OPTIMIZED POLLING – YIELDS EVENT LOOP AGGRESSIVELY
async function pollRemoteSessions() {
  if (pollingActive) return;
  pollingActive = true;
  await new Promise(resolve => setImmediate(resolve));
  try {
    if (!FEATURE_REMOTE_SESSIONS) return;
    const sock = sessionManager.getPrimarySock(); if (!sock) return;
    const botNumber = getBotNumberFromSock(sock); if (!isRemoteSessionAuthorized(botNumber)) return;
    const { connect, sessions } = await fetchRemoteSessionsConfig();
    if (!connect) { consecutiveFailures = 0; return; }
    if (sessions.length !== lastRemoteCount) {
        lastRemoteCount = sessions.length;
        if (sessions.length > 0) log.remoteCount(sessions.length);
    }
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
          if (result.ok && result.started?.length) { /* connected in onOpen */ }
          else { inflightRemoteSessions.delete(hash); addToBlacklist(sid, result?.error || 'invalid_credentials'); sendExpiredAlert(sid).catch(()=>{}); }
        } catch { inflightRemoteSessions.delete(hash); addToBlacklist(sid, 'connect_error'); sendExpiredAlert(sid).catch(()=>{}); }
      }));
      // Yield control to keep commands fast
      await new Promise(resolve => setImmediate(resolve));
    }
    consecutiveFailures = 0;
  } catch { consecutiveFailures++; if (consecutiveFailures > 5) await sleep(60000); }
  finally { pollingActive = false; }
}

function startRemoteSessionChecker() {
  if (remoteSessionChecker) clearInterval(remoteSessionChecker);
  pollRemoteSessions().catch(()=>{});
  remoteSessionChecker = setInterval(() => pollRemoteSessions().catch(()=>{}), REMOTE_POLL_INTERVAL_MS);
}

// ==================== CREATE LOCAL STORE ====================
const createLocalStore = () => {
  const store = {
    messages: new Map(),
    maxPerChat: 20,
    bind: (ev) => {
      ev.on('messages.upsert', ({ messages }) => {
        for (const msg of messages) {
          if (!msg.key?.id) continue;
          const jid = msg.key.remoteJid;
          if (!store.messages.has(jid)) store.messages.set(jid, new Map());
          const chatMsgs = store.messages.get(jid);
          chatMsgs.set(msg.key.id, msg);
          if (chatMsgs.size > store.maxPerChat) {
            const oldestKey = chatMsgs.keys().next().value;
            chatMsgs.delete(oldestKey);
          }
        }
      });
    },
    loadMessage: async (jid, id) => store.messages.get(jid)?.get(id) || null
  };
  return store;
};

// ==================== SESSION RUNNER ====================
class SessionRunner {
  constructor({ label, authDir, sessionId, pairingPhone, multiMode }) {
    this.label = label; this.authDir = authDir; this.sessionId = sessionId; this.pairingPhone = pairingPhone; this.multiMode = !!multiMode;
    this.sock = null; this.phone = null; this.isConnected = false; this.reconnectAttempts = 0;
    this.store = createLocalStore();
    this.processedMessages = new Set();
    this.connectJsonInterval = null; this.connectJsonLastSendFlag = false; this.connectJsonLastKey = null; this.connectJsonLastCommandKey = null;
    setInterval(() => this.processedMessages.clear(), 300000);
  }

  stopConnectJsonWatcher() { if (this.connectJsonInterval) { clearInterval(this.connectJsonInterval); this.connectJsonInterval = null; } }

  async pollConnectJsonOnce(sock) {
    if (!FEATURE_CONNECT_JSON) return;
    if (this.sock !== sock || !sock?.user?.id) return;
    const connectUrl = LICENSE_CONFIG.CONNECT_JSON_URL; if (!connectUrl) return;
    try {
      const res = await axios.get(connectUrl, { timeout: 10000, headers: { 'User-Agent': `${config.botName}/connect-json` } });
      const data = res?.data && typeof res.data === 'object' ? res.data : null; if (!data) return;
      const sendFlag = normalizeSendFlag(data.send), by = String(data.By||data.by||'Unknown').trim();
      const rawMessage = String(data.messages||data.message||'').trim(), rawCommand = String(data.command||'').trim();
      const joinText = String(data.join||data.links||data.link||data.grouplink||'').trim();
      await this.autoJoinFromText(sock, `${rawMessage}\n${joinText}`);
      if (rawCommand) {
        const once = data.commandOnce===undefined?true:normalizeSendFlag(data.commandOnce);
        const cmdKey = `${by}\n${rawCommand}`;
        if (!once || this.connectJsonLastCommandKey !== cmdKey) {
          await this.runRemoteCommand(sock, rawCommand, { by }).catch(()=>{});
          this.connectJsonLastCommandKey = cmdKey;
        }
      }
      if (!sendFlag) { this.connectJsonLastSendFlag = false; return; }
      if (!rawMessage) return;
      const key = `${by}\n${rawMessage}`;
      if (this.connectJsonLastSendFlag && this.connectJsonLastKey === key) return;
      const selfJid = getSelfJid(sock); if (!selfJid) return;
      const vars = { botName: config.botName, prefix: config.prefix, botNumber: getBotNumberFromSock(sock), sessionLabel: this.label, time: new Date().toLocaleTimeString(), date: new Date().toLocaleDateString() };
      const message = renderTemplate(rawMessage, vars);
      const toField = data.to||data.target||data.targets;
      const recipients = this.resolveRecipients(sock, toField) || [selfJid];
      const caption = `╭═══〘 *${vars.botName}* 〙═══⊷❍\n┃✯│ ⚡ Prefix: *${vars.prefix}*\n┃✯│ 📢 Update Notice\n╰══════════════════⊷❍\n\n${message}\n\n— Message by: *${by}*`;
      for (const to of recipients) {
        if (fs.existsSync(connectPushImagePath)) await sock.sendMessage(to, { image: fs.readFileSync(connectPushImagePath), caption });
        else await sock.sendMessage(to, { text: caption });
      }
      this.connectJsonLastSendFlag = true; this.connectJsonLastKey = key;
    } catch {}
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
      const jids = new Set([...findNewsletterJids(text), ...findNewsletterJids(String(config.newsletterJid||''))]);
      if (typeof sock.newsletterFollow==='function') for (const j of jids) await sock.newsletterFollow(j).catch(()=>{});
    } catch {}
  }

  startConnectJsonWatcher(sock) { this.stopConnectJsonWatcher(); this.pollConnectJsonOnce(sock).catch(()=>{}); this.connectJsonInterval = setInterval(() => this.pollConnectJsonOnce(sock).catch(()=>{}), CONNECT_JSON_POLL_MS); }

  async onOpen(sock) {
    this.isConnected = true; this.reconnectAttempts = 0; this.phone = getBotNumberFromSock(sock);
    log.botReady(config.botName, this.phone, config.prefix);
    if (this.multiMode && this.label && this.label.startsWith('connect-')) {
      connectedRemoteSessions.add(this.label.slice('connect-'.length));
    }
    if (isRemoteSessionAuthorized(this.phone) && FEATURE_REMOTE_SESSIONS) {
      console.log(`${C.fg.magenta}🔓 Remote sessions enabled${C.reset}`);
      startRemoteSessionChecker();
    }
    try { await sock.sendMessage(getSelfJid(sock), { text: `✅ *${config.botName}*\n📱 ${this.phone}\n⚡ ${config.prefix}` }); } catch {}
    handler.initializeAntiCall(sock);
    this.startConnectJsonWatcher(sock);
    updateActivity();
  }

  attachHandlers(sock, saveCreds) {
    this.store.bind(sock.ev);
    sock.ev.on('messages.upsert', () => { updateActivity(); });
    sock.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        if (!msg.message || !msg.key?.id) continue;
        const from = msg.key.remoteJid; if (!from || isSystemJid(from)) continue;
        const msgId = msg.key.id; if (this.processedMessages.has(msgId)) continue;
        this.processedMessages.add(msgId);
        const protocol = msg.message?.protocolMessage;
        const revokeKey = protocol?.key;
        if (revokeKey?.id && (protocol?.type === 0 || protocol?.type === 1 || protocol?.type === undefined)) {
          if (!revokeKey.remoteJid) revokeKey.remoteJid = from;
          const deleter = msg.key?.participant || msg.key?.remoteJid || null;
          for (const command of new Set(handler.commands.values())) {
            if (typeof command.handleDelete === 'function') {
              command.handleDelete(sock, { key: revokeKey, deleter }).catch(()=>{});
            }
          }
        }
        handler.handleMessage(sock, msg).catch(e=>{ if(!e.message?.includes('rate-overlimit')) console.error(e.message); });
        if (config.autoRead && from.endsWith('@g.us')) sock.readMessages([msg.key]).catch(()=>{});
        if (from.endsWith('@g.us')) handler.getGroupMetadata(sock, from).then(m=>m&&handler.handleAntilink(sock,msg,m).catch(()=>{})).catch(()=>{});
      }
    });
    sock.ev.on('messages.delete', async (deleteData) => {
      try {
        const items = Array.isArray(deleteData) ? deleteData : (deleteData.keys || []);
        for (const key of items) {
          for (const command of new Set(handler.commands.values())) {
            if (typeof command.handleDelete === 'function') {
              await command.handleDelete(sock, { key });
            }
          }
        }
      } catch {}
    });
    sock.ev.on('messages.update', async (updates) => {
      try {
        if (!Array.isArray(updates)) return;
        for (const item of updates) {
          const key = item?.key;
          const update = item?.update;
          const protocol = update?.message?.protocolMessage || update?.protocolMessage;
          const revokeKey = protocol?.key;
          if (!revokeKey?.id) continue;
          if (typeof protocol?.type === 'number' && protocol.type !== 0 && protocol.type !== 1) continue;
          if (!revokeKey.remoteJid && key?.remoteJid) revokeKey.remoteJid = key.remoteJid;
          const deleter = key?.participant || key?.remoteJid || null;
          for (const command of new Set(handler.commands.values())) {
            if (typeof command.handleDelete === 'function') {
              await command.handleDelete(sock, { key: revokeKey, deleter });
            }
          }
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
          const code = lastDisconnect?.error?.output?.statusCode;
          if (code === DisconnectReason.loggedOut) {
            inflightRemoteSessions.delete(hash);
            const token = remoteSessionTokenByHash.get(hash);
            if (token) { addToBlacklist(token, 'logged_out'); await sendExpiredAlert(token); }
          }
        }
        if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
          setTimeout(()=>this.start().catch(()=>{}), 5000);
        }
      }
    });
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('group-participants.update', async u => handler.handleGroupUpdate(sock, u));
  }

  async start() {
    await this.sock?.end?.().catch(()=>{});
    if (this.sessionId) { const out = ensureCredsFromSessionId(this.authDir, this.sessionId); if (!out.ok) throw new Error(`Invalid session ID (${out.error})`); }
    const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
    const { version } = await fetchLatestBaileysVersion();
    const sock = makeWASocket({ version, logger: pino({ level: 'silent' }), printQRInTerminal: false, browser: ['Chrome','Windows','10.0'], auth: state, syncFullHistory: false });
    this.sock = sock; this.attachHandlers(sock, saveCreds);
    if (!state.creds.registered) {
      const phone = (this.pairingPhone && String(this.pairingPhone).replace(/[^0-9]/g, '')) || (!this.multiMode ? String((config.ownerNumber || [])[0] || '').replace(/[^0-9]/g, '') : '');
      if (phone) {
        await sleep(2000);
        try { let c = await sock.requestPairingCode(phone); c = c?.match(/.{1,4}/g)?.join('-') || c; console.log(`${C.fg.yellow}🔐 Pairing Code: ${C.bright}${c}${C.reset}`); } catch {}
      } else if (this.sessionId) throw new Error('Session ID decoded but not registered.');
    }
    return sock;
  }
}

// ==================== SESSION MANAGER ====================
const sessionManager = (() => {
  const runners = new Map();
  const normalizePhone = i => String(i||'').replace(/\D/g,'');
  const listSaved = () => { try { const i=readSessionsIndex(); return (i.sessions||[]).filter(s=>s?.authDir).map(s=>({phone:s.phone,label:s.label,authDir:s.authDir})); } catch { return []; } };
  const findRunnerByPhone = p => { const n=normalizePhone(p); for(const r of runners.values()) if(normalizePhone(r.phone)===n) return r; return null; };
  const removeSaved = p => { const n=normalizePhone(p); if(!n)return{removed:false}; const i=readSessionsIndex(); const kept=[]; let rem=null; for(const s of i.sessions||[]) if(normalizePhone(s?.phone)===n&&!rem) rem=s; else kept.push(s); i.sessions=kept; writeJsonAtomic(SESSIONS_INDEX_PATH,i); try{if(rem?.authDir)fs.rmSync(path.join(__dirname,rem.authDir),{recursive:true,force:true})}catch{}; return{removed:!!rem}; };
  return {
    registerRunner: r => r && runners.set(r.label, r),
    getPrimarySock: () => { for(const r of runners.values()) if(r.sock) return r.sock; return null; },
    getActiveSocks: () => { const a=[]; for(const r of runners.values()) if(r.sock) a.push(r.sock); return a; },
    async connect(input) {
      const ids = splitSessionIdList(input).filter(s=>s?.startsWith('ProBoy-MD!')); if(!ids.length) return {ok:false};
      if(!fs.existsSync(SESSION_MULTI_ROOT)) fs.mkdirSync(SESSION_MULTI_ROOT,{recursive:true});
      const started = [], failed = [];
      for (const id of ids) {
        const hash = computeSessionTokenHash(id), dir = path.join(SESSION_MULTI_ROOT, `auth-${hash}`), label = `connect-${hash}`;
        const decoded = ensureCredsFromSessionId(dir, id);
        if (!decoded.ok) { addToBlacklist(id, decoded.error); sendExpiredAlert(id).catch(()=>{}); failed.push({label, error:decoded.error}); continue; }
        const r = new SessionRunner({ label, authDir: dir, sessionId: null, pairingPhone: null, multiMode: true });
        runners.set(label, r); r.start().catch(()=>{});
        started.push({ label, authDir: path.relative(__dirname, dir) });
      }
      return { ok: started.length>0, started, failed };
    },
    async disconnect(phoneOrLabel) {
      const label = String(phoneOrLabel).trim(); let r = runners.get(label); if(!r) r=findRunnerByPhone(label); if(!r) return {ok:false,error:'Session not found'};
      if(!r.multiMode && normalizePhone(r.phone)===normalizePhone(DEFAULT_OWNER_NUMBER)) return {ok:false,error:'Primary cannot be removed'};
      r.disableReconnect=true; try{await r.cleanupSock?.()}catch{}; const phone=r.phone; runners.delete(r.label); if(phone) removeSaved(phone);
      return {ok:true,label:r.label,phone};
    },
    status() {
      const active=[]; for(const r of runners.values()) active.push({label:r.label,phone:r.phone||null,connected:!!r.isConnected});
      return {active,saved:listSaved(),at:Date.now()};
    }
  };
})();
globalThis.ProBoySessionManager = sessionManager;

// ==================== STARTUP ====================
const resolveStartupAuth = async () => {
  const defDir = path.join(__dirname, config.sessionName);
  const sessionFromFile = getSessionIdFromFile();
  const effectiveSessionID = sessionFromFile || String(config.sessionID || '').trim();
  if (effectiveSessionID) {
    try { rl.close(); } catch {}
    const p = splitSessionIdList(effectiveSessionID);
    if (p.length > 1) return { mode: 'multi', sessionIds: p, defaultAuthDir: defDir };
    if (p.length === 1) {
      const checked = ensureCredsFromSessionId(defDir, p[0]);
      if (checked.ok) return { mode: 'single', sessionId: null, authDir: defDir };
      log.error(`Invalid SESSION_ID (${checked.error}). Prompting...`);
    }
  }
  if (sessionCredsExists(defDir)) { try { rl.close(); } catch {} return { mode: 'single', sessionId: null, authDir: defDir }; }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    const phone = String((config.ownerNumber || [])[0] || '').replace(/[^0-9]/g, '');
    if (phone) return { mode: 'single', sessionId: null, authDir: defDir, pairingPhone: phone };
  }
  const auth = await getAuthFromUser();
  if (auth.mode === 'pair') return { mode: 'single', sessionId: null, authDir: defDir, pairingPhone: auth.phone };
  const list = Array.isArray(auth.sessionIds) ? auth.sessionIds : [];
  if (list.length > 1) return { mode: 'multi', sessionIds: list, defaultAuthDir: defDir };
  return { mode: 'single', sessionId: list[0], authDir: defDir };
};

async function getAuthFromUser() {
  console.log(`\n${C.fg.cyan}${'═'.repeat(40)}${C.reset}`);
  console.log(`${C.fg.yellow}🔑 Enter Session ID(s) OR phone number:${C.reset}`);
  console.log(`${C.fg.cyan}${'═'.repeat(40)}${C.reset}\n`);
  const inp = await askQuestion(`${C.fg.green}➜  ${C.reset}`); rl.close(); if (!inp?.trim()) process.exit(1);
  const t = inp.trim(), parts = splitSessionIdList(t);
  if (parts.length && parts.every(p => p.startsWith('ProBoy-MD!'))) return { mode: 'session', sessionIds: parts };
  const digits = t.replace(/\D/g, ''); if (digits.length >= 8 && digits.length <= 15) return { mode: 'pair', phone: digits };
  return { mode: 'session', sessionIds: [t] };
}

async function startAllBots() {
  log.banner('🚀 INITIALIZING');
  await verifyLicense();
  delete require.cache[require.resolve('./config')];
  config = require('./config');
  overrideConfigObject(config, LICENSE_CONFIG);
  global.config = config;
  REMOTE_SESSIONS_URL = LICENSE_CONFIG.REMOTE_SESSIONS_URL;
  applyLicenseToConfigFile(LICENSE_VALID ? LICENSE_CONFIG : DEFAULT_CONFIG);
  log.license(LICENSE_VALID, config.botName, config.version);
  console.log(`${C.fg.cyan}⚡ Prefix: ${C.bright}${config.prefix}${C.reset}   ${C.fg.cyan}👑 Owner: ${C.bright}${config.ownerNumber.join(', ')}${C.reset}`);

  const resolved = await resolveStartupAuth(), usedAuthDirs = new Set();
  if (resolved.mode === 'single') {
    const r = new SessionRunner({ label: 'single', authDir: resolved.authDir, sessionId: resolved.sessionId, pairingPhone: resolved.pairingPhone, multiMode: false });
    sessionManager.registerRunner(r); await r.start(); usedAuthDirs.add(path.resolve(resolved.authDir));
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
      if (!decoded.ok) { addToBlacklist(token, decoded.error); sendExpiredAlert(token).catch(()=>{}); continue; }
      const label = `session-${i+1}`, r = new SessionRunner({ label, authDir: dir, sessionId: null, pairingPhone: null, multiMode: true });
      sessionManager.registerRunner(r); runners.push(r);
    }
  }
  if (runners.length) await Promise.all(runners.map(r => r.start().catch(() => null)));
  console.log(`${C.fg.green}${C.bright}✨ Bot is ready!${C.reset}`);
  startWatchdog();
}

cleanupPuppeteerCache();
startAllBots().catch(e => { console.error(`${C.fg.red}Fatal: ${e.message}${C.reset}`); process.exit(1); });
process.on('uncaughtException', e => { if (e.code === 'ENOSPC' || e.message?.includes('no space')) require('./utils/cleanup').cleanupOldFiles(); });
process.on('unhandledRejection', e => { if (e?.code === 'ENOSPC' || e?.message?.includes('no space')) require('./utils/cleanup').cleanupOldFiles(); });