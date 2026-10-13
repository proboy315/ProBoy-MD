/**
 * ProBoy-MD :: Channel Hub
 * ============================================================================
 * Shared engine for WhatsApp Channels ("newsletters") used by
 *   - commands/dev/channels.js   (.channels  - list / manage channels)
 *   - commands/dev/cforward.js   (.cforward  - post to all my channels)
 *   - commands/general/antidelete.js (channel-post deletion records)
 *   - handler.js                 (observe(): caches posts of tracked channels)
 *
 * WHAT THE LIBRARY REALLY OFFERS (@whiskeysockets/baileys 7.0.0-rc14):
 *   sock.newsletterMetadata('jid'|'invite', key)  -> name, invite code, subscribers,
 *                                                    viewer_metadata.role (OWNER/ADMIN/SUBSCRIBER/GUEST)
 *   sock.newsletterFetchMessages(jid, count, since, after) -> raw binary node
 *   sock.sendMessage('<id>@newsletter', {text|image|video|audio|document|sticker})
 *   events: messages.upsert (posts of followed channels, key.server_id),
 *           newsletter.reaction / newsletter.view / newsletter-settings.update /
 *           newsletter-participants.update
 * WHAT IT DOES NOT OFFER (so this module does not pretend to):
 *   - there is NO call that lists "all channels I admin". Channels are therefore
 *     discovered from (a) channelManager's remote ids.json, (b) channel posts the
 *     bot sees, (c) `.channels add <jid|link>`; every candidate is then VERIFIED
 *     with newsletterMetadata() and only OWNER/ADMIN ones are treated as mine.
 *   - there is NO "post deleted" event for channels. Deletions are detected by
 *     comparing the cached posts with newsletterFetchMessages() (polling), and
 *     by any revoke event that does arrive (handled in antidelete.handleDelete).
 *   - a post can only be recovered if this module cached it BEFORE deletion.
 * ============================================================================
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const memoryGuard = require('./memoryGuard');

let _baileys = null;
const baileys = () => _baileys || (_baileys = require('@whiskeysockets/baileys'));

const DB_DIR = path.join(__dirname, '..', 'database');
const STORE_FILE = path.join(DB_DIR, 'channels_v1.json');
const MEDIA_DIR = path.join(DB_DIR, 'channel_media');
const MB = 1024 * 1024;

const envNum = (name, d) => { const n = Number(process.env[name]); return Number.isFinite(n) && n > 0 ? n : d; };
const cfg = () => ({
  pollMs: Math.max(60000, envNum('CHANNEL_POLL_MS', Number(config.channelSettings?.pollMs) || 5 * 60 * 1000)),
  fetchWindow: Math.min(100, envNum('CHANNEL_FETCH_WINDOW', Number(config.channelSettings?.fetchWindow) || 40)),
  postTtlMs: envNum('CHANNEL_POST_TTL_MS', 14 * 24 * 3600 * 1000),
  maxPostsPerChannel: envNum('CHANNEL_MAX_POSTS', 150),
  maxMediaBytes: envNum('CHANNEL_MAX_MEDIA_BYTES', 15 * MB),
  maxMediaTotal: envNum('CHANNEL_MAX_MEDIA_TOTAL_BYTES', 100 * MB),
  verifyTtlMs: envNum('CHANNEL_VERIFY_TTL_MS', 6 * 3600 * 1000),
  logDeletes: config.channelSettings?.logDeletes !== false
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ADMIN_ROLES = new Set(['OWNER', 'ADMIN']);
const isNewsletterJid = (j) => typeof j === 'string' && j.endsWith('@newsletter');
const accountOf = (sock) => String(sock?.user?.id || '').split(':')[0].split('@')[0];
/** Baileys rc14 wraps the websocket: `ws.isOpen` is a getter, `ws.readyState` does not exist. Support both. */
const isOpen = (sock) => { const w = sock && sock.ws; if (!w) return false; if (typeof w.isOpen === 'boolean') return w.isOpen; return w.readyState === 1; };
const toInt = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
const txt = (v) => (v && typeof v === 'object' ? v.text : v) || null;

// ---------------------------------------------------------------------------
// Persistent state (atomic, debounced)
// ---------------------------------------------------------------------------
let state = { v: 1, channels: {}, posts: {}, deleted: {}, forwarded: {}, deleteLog: [] };
let dirty = false, saveTimer = null, loaded = false;

function load() {
  if (loaded) return;
  loaded = true;
  try {
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
    if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });
    if (fs.existsSync(STORE_FILE)) {
      const obj = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
      if (obj && typeof obj === 'object') state = { ...state, ...obj };
    }
  } catch (e) {
    try { fs.renameSync(STORE_FILE, `${STORE_FILE}.corrupt-${Date.now()}`); } catch { /* ignore */ }
    console.error('[channelHub] store unreadable, starting fresh:', e.message);
  }
  for (const k of ['channels', 'posts', 'deleted', 'forwarded']) if (!state[k] || typeof state[k] !== 'object') state[k] = {};
  if (!Array.isArray(state.deleteLog)) state.deleteLog = [];
}
function markDirty() {
  dirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; flush(); }, 5000);
  if (saveTimer.unref) saveTimer.unref();
}
function flush() {
  if (!dirty) return;
  dirty = false;
  const tmp = `${STORE_FILE}.tmp-${process.pid}`;
  try { fs.writeFileSync(tmp, JSON.stringify(state)); fs.renameSync(tmp, STORE_FILE); }
  catch (e) { try { fs.unlinkSync(tmp); } catch { /* ignore */ } dirty = true; console.error('[channelHub] save failed:', e.message); }
}

// ---------------------------------------------------------------------------
// Metadata parsing / verification
// ---------------------------------------------------------------------------
/** Accepts what sock.newsletterMetadata() returns (raw GraphQL object) and normalises it. */
function parseMeta(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw.result && typeof raw.result === 'object' ? raw.result : raw;
  if (typeof r.id !== 'string') return null;
  const thread = r.thread_metadata || {};
  const viewer = r.viewer_metadata || {};
  const role = String(viewer.role || r.role || r.viewer_role || '').toUpperCase() || null;
  return {
    jid: r.id,
    name: txt(thread.name) || r.name || null,
    description: txt(thread.description) || r.description || null,
    invite: thread.invite || r.invite || null,
    subscribers: toInt(thread.subscribers_count ?? r.subscribers),
    verification: thread.verification || r.verification || null,
    creationTime: toInt(thread.creation_time ?? r.creation_time),
    muted: viewer.mute ?? r.mute_state ?? null,
    role
  };
}

function ensureChannel(jid, source = 'observed') {
  load();
  if (!isNewsletterJid(jid)) return null;
  if (!state.channels[jid]) { state.channels[jid] = { jid, name: null, invite: null, source, addedAt: Date.now(), accounts: {} }; markDirty(); }
  return state.channels[jid];
}
const getChannel = (jid) => { load(); return state.channels[jid] || null; };
function removeChannel(jid) {
  load();
  const had = !!state.channels[jid];
  delete state.channels[jid];
  dropPosts(jid);
  markDirty();
  return had;
}
function listChannels() { load(); return Object.values(state.channels); }

const roleFor = (rec, sock) => rec?.accounts?.[accountOf(sock)]?.role || null;
const isAdminFor = (rec, sock) => ADMIN_ROLES.has(roleFor(rec, sock));
const verifiedFresh = (rec, sock, ttl) => {
  const a = rec?.accounts?.[accountOf(sock)];
  return !!a && Date.now() - (a.verifiedAt || 0) < ttl;
};
const hasAnyAdmin = (rec) => Object.values(rec?.accounts || {}).some((a) => ADMIN_ROLES.has(a.role));

const inflightVerify = new Map();
/** Ask WhatsApp who we are in this channel. Never throws. */
async function verifyChannel(sock, jid, { force = false } = {}) {
  load();
  const rec = ensureChannel(jid, 'manual');
  if (!rec) return { ok: false, error: 'not a channel jid' };
  if (!force && verifiedFresh(rec, sock, cfg().verifyTtlMs)) return { ok: true, rec, cached: true };
  const key = `${accountOf(sock)}|${jid}`;
  if (inflightVerify.has(key)) return inflightVerify.get(key);
  const p = (async () => {
    try {
      if (typeof sock?.newsletterMetadata !== 'function') throw new Error('newsletterMetadata is not supported by this library build');
      const meta = parseMeta(await sock.newsletterMetadata('jid', jid));
      if (!meta) throw new Error('WhatsApp returned no metadata (channel not found / not accessible)');
      rec.name = meta.name || rec.name;
      rec.invite = meta.invite || rec.invite;
      rec.description = meta.description ?? rec.description;
      rec.subscribers = meta.subscribers ?? rec.subscribers;
      rec.verification = meta.verification ?? rec.verification;
      rec.creationTime = meta.creationTime ?? rec.creationTime;
      rec.accounts[accountOf(sock)] = { role: meta.role, verifiedAt: Date.now(), error: null };
      markDirty();
      return { ok: true, rec };
    } catch (e) {
      const msg = String(e?.message || e).slice(0, 160);
      rec.accounts[accountOf(sock)] = { ...(rec.accounts[accountOf(sock)] || {}), error: msg, errorAt: Date.now() };
      markDirty();
      return { ok: false, rec, error: msg };
    } finally { inflightVerify.delete(key); }
  })();
  inflightVerify.set(key, p);
  return p;
}

const channelLink = (rec) => (rec?.invite ? `https://whatsapp.com/channel/${rec.invite}` : null);
const postLink = (rec, serverId) => (rec?.invite && serverId ? `https://whatsapp.com/channel/${rec.invite}/${serverId}` : null);

/** Accepts https://whatsapp.com/channel/<code>[/<postId>] ; returns {code, postId|null} or null */
function parseChannelLink(input) {
  const m = /whatsapp\.com\/channel\/([A-Za-z0-9_-]{8,})(?:\/([A-Za-z0-9_-]+))?/i.exec(String(input || ''));
  if (!m) return null;
  return { code: m[1], postId: m[2] || null };
}

/** Resolve an invite code to a channel (also registers it). */
async function resolveInvite(sock, code) {
  const meta = parseMeta(await sock.newsletterMetadata('invite', code));
  if (!meta) throw new Error('Channel not found for that link');
  const rec = ensureChannel(meta.jid, 'manual');
  rec.name = meta.name || rec.name; rec.invite = meta.invite || code; rec.subscribers = meta.subscribers ?? rec.subscribers;
  if (meta.role) rec.accounts[accountOf(sock)] = { role: meta.role, verifiedAt: Date.now(), error: null };
  markDirty();
  return { rec, meta };
}

// ---------------------------------------------------------------------------
// Message normalisation (shared by observe / poll / reply / link modes)
// ---------------------------------------------------------------------------
function unwrap(m) {
  let c = m;
  for (let i = 0; i < 4 && c; i++) {
    if (c.ephemeralMessage?.message) c = c.ephemeralMessage.message;
    else if (c.viewOnceMessageV2?.message) c = c.viewOnceMessageV2.message;
    else if (c.viewOnceMessage?.message) c = c.viewOnceMessage.message;
    else if (c.documentWithCaptionMessage?.message) c = c.documentWithCaptionMessage.message;
    else break;
  }
  return c || null;
}
const MEDIA_TYPES = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];
const SKIP = new Set(['protocolMessage', 'senderKeyDistributionMessage', 'messageContextInfo']);
const sizeOf = (mc) => { const v = mc?.fileLength; const n = Number(v && typeof v.toString === 'function' ? v.toString() : v); return Number.isFinite(n) ? n : 0; };

/** -> { type, text, caption, mime, fileName, ptt, gif, size } or null if unsupported/empty */
function describeContent(message) {
  const c = unwrap(message);
  if (!c) return null;
  const type = Object.keys(c).find((k) => !SKIP.has(k) && c[k] != null);
  if (!type) return null;
  const mc = c[type];
  const out = { type, text: null, caption: null, mime: null, fileName: null, ptt: false, gif: false, size: 0 };
  if (type === 'conversation') out.text = typeof mc === 'string' ? mc : null;
  else if (type === 'extendedTextMessage') out.text = mc?.text || null;
  else if (MEDIA_TYPES.includes(type)) {
    out.caption = mc?.caption || null; out.mime = mc?.mimetype || null; out.fileName = mc?.fileName || null;
    out.ptt = !!mc?.ptt; out.gif = !!mc?.gifPlayback; out.size = sizeOf(mc);
  } else return { ...out, unsupported: true };
  if (!out.text && !out.caption && !MEDIA_TYPES.includes(type)) return null;
  return out;
}

const extFor = (d) => {
  if (d.fileName && d.fileName.includes('.')) return path.extname(d.fileName).slice(1).replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin';
  if (d.type === 'stickerMessage') return 'webp';
  if (d.type === 'imageMessage') return 'jpg';
  if (d.type === 'videoMessage') return 'mp4';
  if (d.type === 'audioMessage') return d.mime?.includes('ogg') ? 'ogg' : 'mp3';
  return 'bin';
};

let activeDownloads = 0;
/**
 * Save the media of `message` to MEDIA_DIR. Handles both
 *  - channel media (not end-to-end encrypted: url/directPath, no mediaKey) and
 *  - normal encrypted media (e.g. a channel post forwarded into a chat).
 * Returns { path, mime, fileName, ptt, gif } or null (too big / no memory / failed).
 */
async function saveMedia(sock, key, message, tag) {
  const S = cfg();
  const c = unwrap(message);
  const d = describeContent(message);
  if (!c || !d || !MEDIA_TYPES.includes(d.type)) return null;
  const mc = c[d.type];
  if (d.size && d.size > S.maxMediaBytes) return null;
  if (activeDownloads >= 1) return null; // one at a time (RAM)
  if (!memoryGuard.canAllocate(d.size || 2 * MB)) return null;
  activeDownloads++;
  const file = path.join(MEDIA_DIR, `${Date.now()}_${String(tag || 'm').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40)}.${extFor(d)}`);
  try {
    load();
    const encrypted = mc.mediaKey && mc.mediaKey.length > 0;
    if (encrypted) {
      const buf = await baileys().downloadMediaMessage({ key, message: c }, 'buffer', {}, { logger: undefined, reuploadRequest: sock?.updateMediaMessage });
      if (!buf || !buf.length || buf.length > S.maxMediaBytes) return null;
      fs.writeFileSync(file, buf);
    } else {
      const url = mc.url && /^https?:/.test(mc.url) ? mc.url : (mc.directPath ? `https://mmg.whatsapp.net${mc.directPath}` : null);
      if (!url) return null;
      const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      let total = 0;
      const ws = fs.createWriteStream(file);
      try {
        for await (const chunk of res.body) {
          total += chunk.length;
          if (total > S.maxMediaBytes) throw new Error('media too large');
          if (!ws.write(chunk)) await new Promise((r) => ws.once('drain', r));
        }
      } finally { await new Promise((r) => ws.end(r)); }
      if (total === 0) throw new Error('empty download');
    }
    return { path: file, mime: d.mime, fileName: d.fileName, ptt: d.ptt, gif: d.gif };
  } catch (e) {
    try { fs.unlinkSync(file); } catch { /* ignore */ }
    return null;
  } finally { activeDownloads--; }
}

// ---------------------------------------------------------------------------
// Post cache
// ---------------------------------------------------------------------------
function dropPosts(jid) {
  const posts = state.posts[jid];
  if (posts) for (const p of Object.values(posts)) if (p.media?.path) try { fs.unlinkSync(p.media.path); } catch { /* ignore */ }
  delete state.posts[jid];
}

/** Store (or refresh) one channel post. */
async function cachePost(sock, jid, serverId, message, ts, { withMedia = true, msgId = null } = {}) {
  load();
  serverId = String(serverId);
  const d = describeContent(message);
  if (!d || d.unsupported) return null;
  const posts = (state.posts[jid] = state.posts[jid] || {});
  if (posts[serverId]) return posts[serverId];
  const rec = { serverId, msgId, jid, ts: Number(ts) || Math.floor(Date.now() / 1000), savedAt: Date.now(), type: d.type, text: d.text, caption: d.caption, mime: d.mime, fileName: d.fileName, ptt: d.ptt, gif: d.gif, size: d.size, media: null, miss: 0 };
  posts[serverId] = rec;
  markDirty();
  if (withMedia && MEDIA_TYPES.includes(d.type)) {
    rec.media = await saveMedia(sock, { remoteJid: jid, id: msgId || serverId }, message, `${serverId}`);
    markDirty();
  }
  prunePosts(jid);
  return rec;
}

function prunePosts(jid) {
  const S = cfg();
  const now = Date.now();
  const posts = state.posts[jid];
  if (!posts) return;
  for (const [id, p] of Object.entries(posts)) {
    if (now - p.savedAt > S.postTtlMs) { if (p.media?.path) try { fs.unlinkSync(p.media.path); } catch { /* ignore */ } delete posts[id]; }
  }
  const ids = Object.keys(posts);
  if (ids.length > S.maxPostsPerChannel) {
    ids.sort((a, b) => posts[a].savedAt - posts[b].savedAt);
    for (const id of ids.slice(0, ids.length - S.maxPostsPerChannel)) {
      if (posts[id].media?.path) try { fs.unlinkSync(posts[id].media.path); } catch { /* ignore */ }
      delete posts[id];
    }
  }
}

function pruneAll(severity = 'soft') {
  load();
  const S = cfg();
  for (const jid of Object.keys(state.posts)) prunePosts(jid);
  const now = Date.now();
  for (const [k, ts] of Object.entries(state.deleted)) if (now - ts > 30 * 24 * 3600 * 1000) delete state.deleted[k];
  for (const [k, v] of Object.entries(state.forwarded)) if (now - (v.at || 0) > 7 * 24 * 3600 * 1000) delete state.forwarded[k];
  if (state.deleteLog.length > 50) state.deleteLog = state.deleteLog.slice(-50);
  // media dir: remove files nobody references, then enforce the total-size cap
  try {
    const referenced = new Set();
    for (const posts of Object.values(state.posts)) for (const p of Object.values(posts)) if (p.media?.path) referenced.add(path.resolve(p.media.path));
    const files = fs.readdirSync(MEDIA_DIR).map((n) => { const full = path.join(MEDIA_DIR, n); try { const st = fs.statSync(full); return st.isFile() ? { full, m: st.mtimeMs, s: st.size } : null; } catch { return null; } }).filter(Boolean);
    let total = 0;
    const keep = [];
    for (const f of files) {
      if (!referenced.has(path.resolve(f.full)) && now - f.m > 10 * 60 * 1000) { try { fs.unlinkSync(f.full); } catch { /* ignore */ } continue; }
      total += f.s; keep.push(f);
    }
    const cap = severity === 'hard' ? S.maxMediaTotal / 2 : S.maxMediaTotal;
    keep.sort((a, b) => a.m - b.m);
    for (const f of keep) {
      if (total <= cap) break;
      try { fs.unlinkSync(f.full); total -= f.s; } catch { /* ignore */ }
      for (const posts of Object.values(state.posts)) for (const p of Object.values(posts)) if (p.media && path.resolve(p.media.path) === path.resolve(f.full)) p.media = null;
    }
  } catch { /* ignore */ }
  markDirty();
}
memoryGuard.registerPrune('channelHub', (sev) => { try { pruneAll(sev); return 'ok'; } catch (e) { return String(e.message); } });

/** Called by handler.js for every @newsletter message (never throws). */
async function observe(sock, msg) {
  try {
    const jid = msg?.key?.remoteJid;
    if (!isNewsletterJid(jid) || !msg.message) return;
    const serverId = msg.key.server_id;
    if (!serverId) return;
    load();
    const rec = ensureChannel(jid, 'observed');
    if (!hasAnyAdmin(rec)) {
      // unknown channel: verify in the background, cache starts once we know we admin it
      if (!rec.accounts[accountOf(sock)] || !verifiedFresh(rec, sock, cfg().verifyTtlMs)) {
        const lastTry = rec.accounts[accountOf(sock)]?.errorAt || 0;
        if (Date.now() - lastTry > 30 * 60 * 1000) verifyChannel(sock, jid).catch(() => {});
      }
      return;
    }
    if (!isAdminFor(rec, sock)) return; // another session (not the admin account) - ignore
    registerSock(sock);
    await cachePost(sock, jid, serverId, msg.message, msg.messageTimestamp, { msgId: msg.key.id });
  } catch { /* never break message handling */ }
}

// ---------------------------------------------------------------------------
// Fetching posts (link mode + polling)
// ---------------------------------------------------------------------------
const bufOf = (c) => (typeof c === 'string' ? Buffer.from(c, 'binary') : Buffer.from(c));
/** Walk a binary node tree and decode every <message> that has a server id. */
function parseFetched(node) {
  const out = [];
  const { proto } = baileys();
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (n.tag === 'message' && n.attrs && (n.attrs.server_id || n.attrs.id)) {
      const entry = { serverId: String(n.attrs.server_id || n.attrs.id), msgId: n.attrs.id || null, ts: toInt(n.attrs.t), message: null, deleted: false };
      const kids = Array.isArray(n.content) ? n.content : [];
      const pt = kids.find((k) => k && k.tag === 'plaintext' && k.content);
      if (pt) { try { entry.message = proto.Message.decode(bufOf(pt.content)); } catch { /* undecodable */ } }
      const t = String(n.attrs.type || n.attrs.status || '').toLowerCase();
      if (/revoke|removed|deleted/.test(t) || n.attrs.is_deleted === 'true') entry.deleted = true;
      out.push(entry);
      return;
    }
    if (Array.isArray(n.content)) for (const k of n.content) walk(k);
  };
  walk(node);
  return out;
}

async function fetchRecent(sock, jid, count, after) {
  if (typeof sock?.newsletterFetchMessages !== 'function') throw new Error('newsletterFetchMessages is not supported by this library build');
  const node = await sock.newsletterFetchMessages(jid, count, undefined, after || undefined);
  return parseFetched(node);
}

/** Find one post: cache first, then ask WhatsApp. Returns {post, source} or throws with a clear reason. */
async function getPostById(sock, jid, serverId) {
  load();
  serverId = String(serverId);
  const cached = state.posts[jid]?.[serverId];
  if (cached) return { post: cached, source: 'cache' };
  const n = Number(serverId);
  const attempts = [];
  if (Number.isFinite(n) && n > 1) attempts.push({ count: 5, after: n - 1 });
  attempts.push({ count: cfg().fetchWindow, after: 0 });
  let lastErr = null, sawAny = false;
  for (const a of attempts) {
    try {
      const msgs = await fetchRecent(sock, jid, a.count, a.after);
      if (msgs.length) sawAny = true;
      const hit = msgs.find((m) => m.serverId === serverId && m.message && !m.deleted);
      if (hit) return { post: { serverId, jid, ts: hit.ts, message: hit.message }, source: 'fetch' };
    } catch (e) { lastErr = e; }
  }
  const why = lastErr ? `WhatsApp refused the request (${String(lastErr.message).slice(0, 100)})` : (sawAny ? 'the post is not in the range WhatsApp returned (too old, deleted, or not visible to this account)' : 'WhatsApp returned no messages for that channel (the bot may need to follow it first)');
  const err = new Error(why); err.limitation = true; throw err;
}

// ---------------------------------------------------------------------------
// Sockets (to poll with the right account) + poller
// ---------------------------------------------------------------------------
const socks = new Map(); // account -> sock
function registerSock(sock) { const a = accountOf(sock); if (a && sock?.ws) socks.set(a, sock); }
function liveSockFor(account) {
  const s = socks.get(account);
  if (s && isOpen(s)) return s;
  try {
    for (const x of globalThis.ProBoySessionManager?.getActiveSocks?.() || []) if (accountOf(x) === account && isOpen(x)) { socks.set(account, x); return x; }
  } catch { /* ignore */ }
  return null;
}

let pollTimer = null, polling = false, lastPoll = { at: 0, channels: 0, newPosts: 0, deletions: 0 };
function ensurePoller(sock) {
  if (sock) registerSock(sock);
  if (pollTimer) return;
  const S = cfg();
  pollTimer = setInterval(() => { pollOnce().catch(() => {}); }, S.pollMs);
  if (pollTimer.unref) pollTimer.unref();
  const first = setTimeout(() => { pollOnce().catch(() => {}); }, 60000);
  if (first.unref) first.unref();
}

async function pollOnce() {
  if (polling) return lastPoll;
  polling = true;
  const stat = { at: Date.now(), channels: 0, newPosts: 0, deletions: 0 };
  try {
    load();
    if (memoryGuard.level() === 'critical') return stat;
    const S = cfg();
    for (const rec of listChannels()) {
      const adminAcct = Object.entries(rec.accounts || {}).find(([, a]) => ADMIN_ROLES.has(a.role));
      if (!adminAcct) continue;
      const sock = liveSockFor(adminAcct[0]);
      if (!sock) continue;
      stat.channels++;
      try {
        const msgs = await fetchRecent(sock, rec.jid, S.fetchWindow, 0);
        const ids = msgs.map((m) => Number(m.serverId)).filter(Number.isFinite);
        if (!ids.length) continue; // nothing parsed: make no judgement
        const lo = Math.min(...ids), hi = Math.max(...ids);
        const present = new Set(msgs.filter((m) => !m.deleted).map((m) => m.serverId));
        for (const m of msgs) {
          if (m.deleted) { await reportChannelDelete(sock, { jid: rec.jid, serverId: m.serverId, via: 'poll-flag' }); stat.deletions++; continue; }
          if (m.message && !state.posts[rec.jid]?.[m.serverId] && !state.deleted[`${rec.jid}|${m.serverId}`]) {
            if (await cachePost(sock, rec.jid, m.serverId, m.message, m.ts, { msgId: m.msgId })) stat.newPosts++;
          }
        }
        // cached posts inside the returned range that WhatsApp no longer lists -> deleted (2 consecutive misses)
        for (const p of Object.values(state.posts[rec.jid] || {})) {
          const n = Number(p.serverId);
          if (!Number.isFinite(n) || n < lo || n > hi) { p.miss = 0; continue; }
          if (present.has(p.serverId)) { p.miss = 0; continue; }
          p.miss = (p.miss || 0) + 1;
          if (p.miss >= 2) { await reportChannelDelete(sock, { jid: rec.jid, serverId: p.serverId, via: 'poll' }); stat.deletions++; }
        }
        markDirty();
      } catch { /* one channel failing must not stop the others */ }
      await sleep(1500);
    }
  } finally { polling = false; lastPoll = stat; }
  return stat;
}

// ---------------------------------------------------------------------------
// Deletion records
// ---------------------------------------------------------------------------
const fmtTime = (d = new Date()) => {
  try { return d.toLocaleString('en-GB', { timeZone: config.timezone || 'Asia/Karachi', hour12: false }); } catch { return d.toISOString(); }
};

function resolveLogJid(sock) {
  const getDb = () => sock?.sessionDb || require('../database');
  let dest = null;
  try {
    const db = getDb();
    dest = db.getGlobalSetting?.('channelLogDest') || null;
    if (!dest) { const ad = db.getGlobalSetting?.('antideleteDest') || config.antideleteSettings?.dest; if (ad && ad !== 'chat') dest = ad; }
  } catch { /* ignore */ }
  const me = accountOf(sock);
  if (!dest || dest === 'bot' || dest === 'owner' || dest === 'chat') return me ? `${me}@s.whatsapp.net` : null; // 'chat' is meaningless for a channel: use the private chat
  return dest.includes('@') ? dest : `${dest.replace(/\D/g, '')}@s.whatsapp.net`;
}

function loggingEnabled(sock) {
  try {
    const v = (sock?.sessionDb || require('../database')).getGlobalSetting?.('antidelete');
    const on = v === undefined ? (config.antideleteSettings?.enabled ?? true) : !!v;
    return on && cfg().logDeletes;
  } catch { return true; }
}

/**
 * Send ONE record for a deleted channel post (deduped, persistent).
 * Only the session that administers the channel reports (others are ignored).
 */
async function reportChannelDelete(sock, { jid, serverId, msgId = null, via = 'event', deletedBy = null }) {
  try {
    load();
    if (!isNewsletterJid(jid)) return false;
    const rec = getChannel(jid);
    if (!rec || !isAdminFor(rec, sock)) return false;
    // locate cached post by server id or message id
    const posts = state.posts[jid] || {};
    let post = serverId ? posts[String(serverId)] : null;
    if (!post && msgId) post = Object.values(posts).find((p) => p.msgId === msgId || p.serverId === String(msgId)) || null;
    const sid = String(post?.serverId || serverId || msgId || '');
    if (!sid) return false;
    const dkey = `${jid}|${sid}`;
    if (state.deleted[dkey]) return false;               // already reported (persisted: survives restarts)
    state.deleted[dkey] = Date.now();
    markDirty();
    if (!loggingEnabled(sock)) { if (post) { delete posts[sid]; } return false; }
    const target = resolveLogJid(sock);
    if (!target) return false;

    const name = rec.name || 'Unknown channel';
    const link = channelLink(rec), plink = postLink(rec, sid);
    const lines = [
      '*📢 CHANNEL POST DELETED*',
      `*Channel:* ${name}`,
      `*Channel ID:* ${jid}`,
      link ? `*Channel link:* ${link}` : null,
      `*Deleted post ID:* ${sid}`,
      plink ? `*Post link:* ${plink}` : null,
      post?.ts ? `*Originally posted:* ${fmtTime(new Date(post.ts * 1000))}` : null,
      `*Deleted (detected):* ${fmtTime()}`,
      `*Detected via:* ${via === 'event' ? 'WhatsApp delete event' : `comparison with channel feed (checked every ${Math.round(cfg().pollMs / 60000)} min)`}`,
      deletedBy ? `*Deleted by:* @${String(deletedBy).split('@')[0]}` : null
    ].filter(Boolean);
    const body = post ? (post.text || post.caption || '') : '';
    let text = lines.join('\n');
    if (post && body) text += `\n\n📝 *${post.text ? 'Text' : 'Caption'}:*\n${body}`;
    else if (post) text += `\n\n📎 Post type: ${post.type.replace('Message', '')} (no text/caption)`;
    else text += '\n\n⚠️ This post was never cached by the bot (it was deleted before it was seen), so its content cannot be recovered.';
    text += `\n\n\`\`\`${jid}|${sid}\`\`\``;

    const contextInfo = { forwardingScore: 1, isForwarded: true, forwardedNewsletterMessageInfo: { newsletterJid: jid, newsletterName: name, serverMessageId: Number(sid) || -1 } };
    const mentions = deletedBy ? [deletedBy] : undefined;
    let sentMedia = false;
    if (post?.media?.path && fs.existsSync(post.media.path)) {
      const content = buildSendContent(post, post.media.path, text);
      if (content) { try { await sock.sendMessage(target, { ...content, contextInfo, mentions }); sentMedia = true; } catch { /* fall back to text */ } }
    }
    if (!sentMedia) {
      if (post?.media === null && MEDIA_TYPES.includes(post?.type)) text += '\n\n⚠️ The media file was not stored (too large / low memory / expired), only the details above were kept.';
      await sock.sendMessage(target, { text, contextInfo, mentions });
    }
    if (post?.media?.path) { try { fs.unlinkSync(post.media.path); } catch { /* ignore */ } }
    state.deleteLog.push({ at: Date.now(), jid, name, serverId: sid, type: post?.type || null, snippet: body.slice(0, 120), cached: !!post });
    if (state.deleteLog.length > 50) state.deleteLog.shift();
    if (post) delete posts[sid];
    markDirty();
    return true;
  } catch (e) {
    console.error('[channelHub] reportChannelDelete failed:', e?.message || e);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Sending to channels
// ---------------------------------------------------------------------------
/** record-like {type,text,caption,mime,fileName,ptt,gif} + local file -> Baileys content (or null) */
function buildSendContent(p, file, captionOverride) {
  const caption = captionOverride !== undefined ? captionOverride : (p.caption || undefined);
  switch (p.type) {
    case 'conversation': case 'extendedTextMessage': return { text: captionOverride !== undefined ? captionOverride : (p.text || '') };
    case 'imageMessage': return file ? { image: { url: file }, caption } : null;
    case 'videoMessage': return file ? { video: { url: file }, caption, gifPlayback: !!p.gif, ...(p.mime ? { mimetype: p.mime } : {}) } : null;
    case 'audioMessage': return file ? { audio: { url: file }, mimetype: p.mime || 'audio/mpeg', ptt: !!p.ptt } : null;
    case 'documentMessage': return file ? { document: { url: file }, mimetype: p.mime || 'application/octet-stream', fileName: p.fileName || 'file', caption } : null;
    case 'stickerMessage': return file ? { sticker: { url: file } } : null;
    default: return null;
  }
}

const withTimeout = (p, ms, label) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timed out`)), ms))]);

const forwardLocks = new Set();
async function newestServerId(sock, jid) {
  try {
    const ids = (await fetchRecent(sock, jid, 10, 0)).map((m) => Number(m.serverId)).filter(Number.isFinite);
    return ids.length ? Math.max(...ids) : null;
  } catch { return null; }
}
/** Stable fingerprint of the content, used to stop duplicate sends. */
function fingerprint(p, file) {
  const h = crypto.createHash('sha1');
  h.update(`${p.type}|${p.text || ''}|${p.caption || ''}|${p.fileName || ''}|${p.size || ''}`);
  if (file) {
    try { // chunked read: never hold a whole media file in memory just to hash it
      const fd = fs.openSync(file, 'r'); const buf = Buffer.allocUnsafe(256 * 1024); let n;
      try { while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n)); } finally { fs.closeSync(fd); }
    } catch { /* ignore */ }
  }
  return h.digest('hex');
}

// ---------------------------------------------------------------------------
// Live list of MY channels straight from WhatsApp (w:mex "subscribed newsletters")
// ---------------------------------------------------------------------------
// Baileys rc14 has no method for this, so we send the same GraphQL IQ the other newsletter calls use.
// Query id + response path (xwa2_newsletter_subscribed) are taken from the whatsmeow project (web-client id).
// WhatsApp can rotate query ids: override with env CHANNEL_SUBSCRIBED_QID if it ever stops working.
const SUBSCRIBED_QID = () => process.env.CHANNEL_SUBSCRIBED_QID || '6388546374527196';
const ADMIN_FILE = path.join(DB_DIR, 'my_admin_channels.json');

async function fetchSubscribed(sock) {
  if (typeof sock?.query !== 'function' || typeof sock?.generateMessageTag !== 'function') throw new Error('this socket has no query()/generateMessageTag()');
  const res = await sock.query({
    tag: 'iq',
    attrs: { id: sock.generateMessageTag(), type: 'get', to: 's.whatsapp.net', xmlns: 'w:mex' },
    content: [{ tag: 'query', attrs: { query_id: SUBSCRIBED_QID() }, content: Buffer.from(JSON.stringify({ variables: {} }), 'utf-8') }]
  });
  const child = Array.isArray(res?.content) ? res.content.find((c) => c?.tag === 'result') : null;
  if (!child?.content) throw new Error('WhatsApp sent an empty answer to the subscribed-channels query');
  const data = JSON.parse(Buffer.from(child.content).toString('utf8'));
  if (Array.isArray(data.errors) && data.errors.length) throw new Error(`GraphQL: ${data.errors.map((e) => e.message || 'error').join(', ')}`);
  const list = data?.data?.xwa2_newsletter_subscribed;
  if (!Array.isArray(list)) throw new Error('unexpected answer (no xwa2_newsletter_subscribed list) - the query id may have changed');
  return list.map(parseMeta).filter(Boolean);
}

function readAdminFile() {
  try { const o = JSON.parse(fs.readFileSync(ADMIN_FILE, 'utf8')); if (o && typeof o === 'object') return o; } catch { /* missing/corrupt -> fresh */ }
  return { v: 1, accounts: {} };
}
/** Separate, human-readable file with ONLY the owner/admin channels of each account (atomic write). */
function writeAdminFile(account, admin) {
  load();
  const obj = readAdminFile();
  if (!obj.accounts || typeof obj.accounts !== 'object') obj.accounts = {};
  obj.updatedAt = new Date().toISOString();
  obj.accounts[account] = {
    syncedAt: new Date().toISOString(),
    count: admin.length,
    channels: admin.map((r) => ({ jid: r.jid, name: r.name || null, role: r.accounts?.[account]?.role || null, link: channelLink(r), followers: r.subscribers ?? null }))
  };
  const tmp = `${ADMIN_FILE}.tmp-${process.pid}`;
  try { fs.writeFileSync(tmp, JSON.stringify(obj, null, 2)); fs.renameSync(tmp, ADMIN_FILE); return true; }
  catch (e) { try { fs.unlinkSync(tmp); } catch { /* ignore */ } console.error('[channelHub] admin file save failed:', e.message); return false; }
}

const syncCache = new Map(); // account -> { at, result }
/**
 * Ask WhatsApp for every channel this account follows/owns/administers, with the role.
 * Updates the registry and rewrites database/my_admin_channels.json. Never throws.
 * -> { ok, source:'live', total, all:[rec], admin:[rec], saved, noRole } | { ok:false, error }
 */
async function syncMyChannels(sock, { force = false } = {}) {
  load();
  const acct = accountOf(sock);
  const c = syncCache.get(acct);
  if (!force && c && Date.now() - c.at < 2 * 60 * 1000) return c.result;
  let metas;
  try { metas = await fetchSubscribed(sock); }
  catch (e) { return { ok: false, source: 'live', error: String(e?.message || e).slice(0, 200) }; }
  const now = Date.now();
  const recs = [], noRole = [];
  for (const m of metas) {
    const rec = ensureChannel(m.jid, 'subscribed');
    if (!rec) continue;
    rec.name = m.name || rec.name;
    rec.invite = m.invite || rec.invite;
    rec.description = m.description ?? rec.description;
    rec.subscribers = m.subscribers ?? rec.subscribers;
    rec.verification = m.verification ?? rec.verification;
    rec.creationTime = m.creationTime ?? rec.creationTime;
    if (m.role) rec.accounts[acct] = { role: m.role, verifiedAt: now, error: null };
    else noRole.push(rec);
    recs.push(rec);
  }
  // the list did not carry a role for these: ask WhatsApp per channel (bounded)
  for (const rec of noRole.slice(0, 40)) { await verifyChannel(sock, rec.jid, { force: true }); await sleep(300); }
  markDirty();
  const admin = recs.filter((r) => ADMIN_ROLES.has(r.accounts?.[acct]?.role));
  const saved = writeAdminFile(acct, admin);
  const result = { ok: true, source: 'live', total: recs.length, all: recs, admin, saved, noRole: noRole.length, file: ADMIN_FILE };
  syncCache.set(acct, { at: now, result });
  return result;
}

/**
 * Eligible destinations for this session's account: channels where role is OWNER/ADMIN
 * (freshly verified). Returns { eligible:[rec], rejected:[{rec,reason}] }.
 */
async function eligibleDestinations(sock, { excludeJid = null } = {}) {
  load();
  // preferred: the live list from WhatsApp itself (roles included)
  const live = await syncMyChannels(sock);
  if (live.ok) return { eligible: live.admin.filter((r) => r.jid !== excludeJid), rejected: [], source: 'live' };
  try { for (const e of require('./channelManager').getNewsletters()) ensureChannel(e.id, 'managed'); } catch { /* optional */ }
  const eligible = [], rejected = [];
  const S = cfg();
  for (const rec of listChannels()) {
    if (rec.jid === excludeJid) continue;
    const v = await verifyChannel(sock, rec.jid, { force: !verifiedFresh(rec, sock, Math.min(S.verifyTtlMs, 60 * 60 * 1000)) });
    if (!v.ok) { if (hasAnyAdmin(rec) || rec.source === 'manual') rejected.push({ rec, reason: `cannot verify: ${v.error}` }); await sleep(300); continue; }
    if (isAdminFor(rec, sock)) eligible.push(rec); // not admin -> silently not eligible (just a followed channel)
    await sleep(300);
  }
  return { eligible, rejected };
}

/**
 * Send one post to many channels. `post` = {type,text,caption,mime,fileName,ptt,gif,size}, `file` = local media path or null.
 * Per-channel errors never abort the run. Returns { sent[], skipped[], failed[] , hash }.
 */
async function forwardToChannels(sock, post, file, dests, { force = false, delayMs = 1500, onProgress, confirm = true } = {}) {
  load();
  const hash = fingerprint(post, file);
  const result = { hash, sent: [], skipped: [], failed: [] };
  if (forwardLocks.has(hash)) { result.busy = true; return result; }
  forwardLocks.add(hash);
  try {
    const history = (state.forwarded[hash] = state.forwarded[hash] || { at: Date.now(), sent: [] });
    for (const rec of dests) {
      if (!force && history.sent.includes(rec.jid)) { result.skipped.push({ rec, reason: 'already sent earlier (use --force to resend)' }); continue; }
      const content = buildSendContent(post, file);
      if (!content) { result.failed.push({ rec, reason: `unsupported message type (${post.type})` }); continue; }
      if (!isOpen(sock)) { result.failed.push({ rec, reason: 'bot connection is down' }); continue; }
      try {
        const before = confirm ? await newestServerId(sock, rec.jid) : null;
        await withTimeout(sock.sendMessage(rec.jid, content), 120000, 'send');
        history.sent.push(rec.jid); history.at = Date.now(); markDirty();
        result.sent.push(rec);
        // sendMessage() only proves the message was handed to WhatsApp (rejections such as "not an admin" arrive
        // later and are not reported by Baileys). Best effort: look at the channel feed to see whether it appeared.
        rec._delivery = 'unconfirmed';
        if (confirm) {
          await sleep(2500);
          const after = await newestServerId(sock, rec.jid);
          if (before != null && after != null) rec._delivery = after > before ? 'confirmed' : 'not-seen';
        }
      } catch (e) {
        result.failed.push({ rec, reason: String(e?.message || e).slice(0, 120) });
      }
      if (onProgress) { try { onProgress(result); } catch { /* ignore */ } }
      await sleep(delayMs);
    }
  } finally { forwardLocks.delete(hash); markDirty(); }
  return result;
}

/** Registry entry for an explicit target (created if unknown; name filled in if WhatsApp tells us). */
async function targetRecord(sock, jid) {
  const rec = ensureChannel(jid, 'manual');
  if (!rec.name || !rec.accounts[accountOf(sock)]) await verifyChannel(sock, jid).catch(() => {});
  return rec;
}

function status() {
  load();
  const chans = listChannels();
  return { channels: chans.length, admin: chans.filter(hasAnyAdmin).length, cachedPosts: Object.values(state.posts).reduce((a, p) => a + Object.keys(p).length, 0), polling: !!pollTimer, lastPoll, deleteLog: state.deleteLog.slice(-10), pollMs: cfg().pollMs };
}

process.on('exit', () => { try { flush(); } catch { /* ignore */ } });

module.exports = {
  // registry
  ensureChannel, getChannel, removeChannel, listChannels, verifyChannel, parseMeta, roleFor, isAdminFor, hasAnyAdmin, ADMIN_ROLES,
  channelLink, postLink, parseChannelLink, resolveInvite, accountOf,
  // content
  unwrap, describeContent, saveMedia, buildSendContent, fingerprint,
  // observe / fetch / poll
  observe, parseFetched, fetchRecent, getPostById, cachePost, ensurePoller, pollOnce, registerSock,
  // delete log
  reportChannelDelete, resolveLogJid,
  // forwarding
  eligibleDestinations, forwardToChannels, targetRecord,
  // live list from WhatsApp + separate owner/admin file
  fetchSubscribed, syncMyChannels, readAdminFile, ADMIN_FILE, isOpen,
  // misc
  status, flush, pruneAll, _state: () => state, _reset: () => { loaded = false; state = { v: 1, channels: {}, posts: {}, deleted: {}, forwarded: {}, deleteLog: [] }; }
};
