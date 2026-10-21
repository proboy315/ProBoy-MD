/**
 * ProBoy-MD :: Memory Guard
 * ============================================================================
 * Why this exists
 * ---------------
 * The bot runs in a container with a hard cgroup memory limit (e.g. 256 MiB on
 * the Pterodactyl panel). When the limit is crossed the kernel OOM-killer
 * sends SIGKILL to the process: every WhatsApp session drops at once, files
 * can be left half-written, and on restart every session reconnects at the
 * same moment, which is the most memory-hungry moment of all (crash loop).
 *
 * This module lets the rest of the code *see* the limit and degrade
 * gracefully BEFORE the kernel intervenes:
 *   - level()            'ok' | 'high' | 'critical'   (cgroup-aware)
 *   - canAdmitSession()  should another WhatsApp session be started now?
 *   - canAllocate(n)     is it safe to buffer an n-byte media file in RAM?
 *   - BoundedMap         Map with max entries + TTL + LRU eviction (replaces
 *                        the unbounded Maps that used to grow forever)
 *   - registerPrune()    caches register a prune callback; a low-frequency
 *                        monitor calls them when memory is high.
 *
 * Everything is best-effort and never throws. If the limit cannot be
 * detected it falls back to BOT_MEM_LIMIT_MB or 256 MB (documented host spec).
 *
 * Tunables (env, all optional):
 *   BOT_MEM_LIMIT_MB        override detected limit
 *   BOT_MEM_HIGH_PCT        default 80
 *   BOT_MEM_CRIT_PCT        default 90
 *   BOT_SESSION_COST_MB     estimated RAM per connected session (default 14)
 *   BOT_SUPERVISOR_MB       RAM used by the index.js supervisor (default 40)
 * ============================================================================
 */

'use strict';

const fs = require('fs');
const os = require('os');

const MB = 1024 * 1024;

const envNum = (name, dflt) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : dflt;
};

const HIGH_PCT = () => envNum('BOT_MEM_HIGH_PCT', 80) / 100;
const CRIT_PCT = () => envNum('BOT_MEM_CRIT_PCT', 90) / 100;
const SESSION_COST = () => envNum('BOT_SESSION_COST_MB', 14) * MB;
const SUPERVISOR_MB = () => envNum('BOT_SUPERVISOR_MB', 40) * MB;

// ---------------------------------------------------------------------------
// cgroup helpers
// ---------------------------------------------------------------------------
const readText = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };
const readNum = (p) => {
  const t = readText(p);
  if (t == null) return null;
  const s = t.trim();
  if (!s || s === 'max') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const statValue = (text, key) => {
  if (!text) return 0;
  const m = text.match(new RegExp('^' + key + '\\s+(\\d+)', 'm'));
  return m ? Number(m[1]) : 0;
};

let limitInfo = null;
function detectLimit() {
  if (limitInfo) return limitInfo;
  const envMb = Number(process.env.BOT_MEM_LIMIT_MB);
  if (Number.isFinite(envMb) && envMb > 0) return (limitInfo = { bytes: envMb * MB, source: 'env', cgroup: false });
  const host = os.totalmem();
  const candidates = [
    [readNum('/sys/fs/cgroup/memory.max'), 'cgroup-v2', '/sys/fs/cgroup'],
    [readNum('/sys/fs/cgroup/memory/memory.limit_in_bytes'), 'cgroup-v1', '/sys/fs/cgroup/memory']
  ];
  for (const [bytes, source, dir] of candidates) {
    if (bytes && bytes > 16 * MB && bytes < host) return (limitInfo = { bytes, source, cgroup: true, dir });
  }
  try {
    if (typeof process.constrainedMemory === 'function') {
      const c = process.constrainedMemory();
      if (c && c > 16 * MB && c < host) return (limitInfo = { bytes: c, source: 'node-constrained', cgroup: false });
    }
  } catch { /* ignore */ }
  return (limitInfo = { bytes: 256 * MB, source: 'default-256MB', cgroup: false });
}

let usedCache = { at: 0, used: 0 };
function usedBytes() {
  const now = Date.now();
  if (now - usedCache.at < 1000) return usedCache.used;
  const info = detectLimit();
  let used = null;
  if (info.cgroup) {
    if (info.source === 'cgroup-v2') {
      const cur = readNum('/sys/fs/cgroup/memory.current');
      if (cur != null) used = cur - statValue(readText('/sys/fs/cgroup/memory.stat'), 'inactive_file');
    } else {
      const cur = readNum('/sys/fs/cgroup/memory/memory.usage_in_bytes');
      if (cur != null) used = cur - statValue(readText('/sys/fs/cgroup/memory/memory.stat'), 'total_inactive_file');
    }
  }
  if (used == null || !(used > 0)) used = process.memoryUsage.rss() + SUPERVISOR_MB();
  usedCache = { at: now, used };
  return used;
}

const limitBytes = () => detectLimit().bytes;
const ratio = () => usedBytes() / limitBytes();

function level() {
  const r = ratio();
  if (r >= CRIT_PCT()) return 'critical';
  if (r >= HIGH_PCT()) return 'high';
  return 'ok';
}

/** Can we afford to hold `bytes` of media in RAM (buffer + copies while sending)? */
function canAllocate(bytes, factor = 3) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return true;
  const headroom = limitBytes() * CRIT_PCT() - usedBytes();
  return headroom >= n * factor;
}

/** Should another WhatsApp session be started right now? */
function canAdmitSession() {
  const headroom = limitBytes() * 0.88 - usedBytes();
  return headroom >= SESSION_COST();
}

/** Rough upper bound on sessions that fit, given the current usage. */
function estimateAdditionalSessions() {
  const headroom = limitBytes() * 0.88 - usedBytes();
  return Math.max(0, Math.floor(headroom / SESSION_COST()));
}

function snapshot() {
  const m = process.memoryUsage();
  const info = detectLimit();
  return {
    limitMB: Math.round(info.bytes / MB),
    limitSource: info.source,
    usedMB: Math.round(usedBytes() / MB),
    rssMB: Math.round(m.rss / MB),
    heapUsedMB: Math.round(m.heapUsed / MB),
    externalMB: Math.round((m.external || 0) / MB),
    arrayBuffersMB: Math.round((m.arrayBuffers || 0) / MB),
    level: level()
  };
}

// ---------------------------------------------------------------------------
// BoundedMap: Map-compatible subset (get/set/has/delete/clear/size/keys/...)
// with max entries, per-entry TTL and LRU eviction.
// ---------------------------------------------------------------------------
class BoundedMap {
  constructor(maxEntries = 500, { ttlMs = 0 } = {}) {
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
    this._m = new Map(); // key -> { v, exp }
  }
  get size() { return this._m.size; }
  _alive(e, now) { return e && (!e.exp || e.exp > now); }
  has(k) {
    const e = this._m.get(k);
    if (!e) return false;
    if (!this._alive(e, Date.now())) { this._m.delete(k); return false; }
    return true;
  }
  get(k) {
    const e = this._m.get(k);
    if (!e) return undefined;
    if (!this._alive(e, Date.now())) { this._m.delete(k); return undefined; }
    // LRU touch
    this._m.delete(k); this._m.set(k, e);
    return e.v;
  }
  set(k, v, ttlMs) {
    const t = ttlMs === undefined ? this.ttlMs : ttlMs;
    this._m.delete(k);
    this._m.set(k, { v, exp: t > 0 ? Date.now() + t : 0 });
    while (this._m.size > this.maxEntries) {
      const oldest = this._m.keys().next().value;
      this._m.delete(oldest);
    }
    return this;
  }
  delete(k) { return this._m.delete(k); }
  clear() { this._m.clear(); }
  sweep() {
    const now = Date.now();
    let removed = 0;
    for (const [k, e] of this._m) if (!this._alive(e, now)) { this._m.delete(k); removed++; }
    return removed;
  }
  shrinkTo(n) {
    let removed = 0;
    while (this._m.size > n) { this._m.delete(this._m.keys().next().value); removed++; }
    return removed;
  }
  keys() { return this._m.keys(); }
}

// ---------------------------------------------------------------------------
// Slow-but-stable helpers: when memory is tight we WAIT instead of failing / crashing.
// ---------------------------------------------------------------------------
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

/** Make global.gc() available even though the process was started without --expose-gc (idempotent). */
function enableGc() {
  try {
    if (typeof global.gc !== 'function') {
      require('v8').setFlagsFromString('--expose-gc');
      global.gc = require('vm').runInNewContext('gc');
    }
  } catch { /* gc simply stays unavailable */ }
  return typeof global.gc === 'function';
}

let lastGcAt = 0;
/** Run a full GC at most once per `minGapMs`. Returns true when it ran. */
function maybeGc(minGapMs = 10000) {
  if (typeof global.gc !== 'function') return false;
  const now = Date.now();
  if (now - lastGcAt < minGapMs) return false;
  lastGcAt = now;
  try { global.gc(); return true; } catch { return false; }
}

/**
 * Wait (up to maxWaitMs) until `bytes` of working memory fit, nudging the GC meanwhile.
 * Resolves true when there is room, false when we gave up (caller may still try / fail politely).
 */
async function waitForRoom(bytes, { maxWaitMs = 90000, factor = 3, pollMs = 2000 } = {}) {
  const t0 = Date.now();
  for (;;) {
    if (canAllocate(bytes, factor)) return true;
    maybeGc(3000);
    if (Date.now() - t0 >= maxWaitMs) return false;
    await sleepMs(pollMs);
  }
}

// Concurrency gate for message processing across ALL sessions:
//   ok -> unlimited, high -> GATE_HIGH at a time, critical -> GATE_CRIT at a time.
// Messages are never dropped, they just queue (bot answers slower instead of running out of memory).
const GATE_HIGH = () => envNum('BOT_GATE_HIGH', 3);
const GATE_CRIT = () => envNum('BOT_GATE_CRIT', 1);
const GATE_MAX_WAIT_MS = () => envNum('BOT_GATE_MAX_WAIT_MS', 45000);
let gateActive = 0;
const gateQueue = [];
const gateLimit = () => { const lv = level(); return lv === 'critical' ? GATE_CRIT() : lv === 'high' ? GATE_HIGH() : Infinity; };
function gateWake() {
  while (gateQueue.length && gateActive < gateLimit()) {
    const w = gateQueue.shift();
    clearTimeout(w.timer);
    gateActive++;
    w.resolve(w.release);
  }
}
/** Await before doing heavy per-message work; call the returned function when done (always, in finally). */
function gate() {
  let released = false;
  const release = () => { if (released) return; released = true; gateActive = Math.max(0, gateActive - 1); gateWake(); };
  if (gateActive < gateLimit()) { gateActive++; return Promise.resolve(release); }
  maybeGc(5000);
  return new Promise((resolve) => {
    const w = { resolve, release, timer: null };
    // never starve a message forever: after the max wait it is let through anyway
    w.timer = setTimeout(() => {
      const i = gateQueue.indexOf(w);
      if (i >= 0) gateQueue.splice(i, 1);
      gateActive++;
      resolve(release);
    }, GATE_MAX_WAIT_MS());
    if (w.timer.unref) w.timer.unref();
    gateQueue.push(w);
  });
}

// ---------------------------------------------------------------------------
// Prune registry + monitor
// ---------------------------------------------------------------------------
const pruners = new Map(); // name -> fn(severity) -> any
function registerPrune(name, fn) { if (typeof fn === 'function') pruners.set(name, fn); }

function pruneAll(severity = 'soft') {
  const out = {};
  for (const [name, fn] of pruners) {
    try { out[name] = fn(severity); } catch (e) { out[name] = `error: ${e && e.message}`; }
  }
  return out;
}

let monitorTimer = null;
let lastLevel = 'ok';
let lastLogAt = 0;
function startMonitor({ intervalMs = 30000, log = console.log } = {}) {
  if (monitorTimer) return;
  enableGc();
  monitorTimer = setInterval(() => {
    try {
      const lv = level();
      if (lv === 'high') { pruneAll('soft'); maybeGc(30000); }
      if (lv === 'critical') {
        pruneAll('hard');
        maybeGc(10000);
      }
      gateWake();
      const now = Date.now();
      if (lv !== lastLevel || (lv !== 'ok' && now - lastLogAt > 5 * 60 * 1000)) {
        lastLevel = lv; lastLogAt = now;
        const s = snapshot();
        log(`[MEM] level=${lv} used=${s.usedMB}MB/${s.limitMB}MB (rss=${s.rssMB} heap=${s.heapUsedMB} ext=${s.externalMB}) ` +
            `~${estimateAdditionalSessions()} more session(s) would fit`);
      }
    } catch { /* never throw from a timer */ }
  }, intervalMs);
  if (monitorTimer.unref) monitorTimer.unref();
}

module.exports = {
  limitBytes, usedBytes, ratio, level, canAllocate, canAdmitSession,
  estimateAdditionalSessions, snapshot, BoundedMap,
  registerPrune, pruneAll, startMonitor, MB,
  enableGc, maybeGc, waitForRoom, gate
};
