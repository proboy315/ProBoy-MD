/**
 * ProBoy-MD :: Reaction Manager
 * ============================================================================
 * ONE place that owns all automatic reacting, replacing the two separate
 * copy-pasted auto-react blocks that used to live in `proboy.js` AND
 * `handler.js` (which could double-fire on the same message).
 *
 * ============================================================================
 * v2 FIXES (this revision)
 * ============================================================================
 * 1) "Only my number reacts, others don't" — the de-dup set that remembers
 *    which message IDs have already been reacted to used to be ONE global
 *    Set shared by every connected session. Newsletters broadcast the same
 *    post to every follower, so every connected number's socket fires its
 *    own `handleMessage` for the same message id — but the first session
 *    to see it would mark it "reacted" and every other session would then
 *    skip it, even though it hadn't reacted from ITS OWN account yet.
 *    FIX: de-dup is now a WeakMap keyed by the socket itself, so each
 *    connected number tracks its own reacted-message history independently
 *    and reacts on its own, exactly like every other connected number.
 *
 * 2) "Reactions should trickle in, not all at once" (anti-ban) — a random
 *    1–22s delay is now applied before each managed reaction fires, so a
 *    burst of connected devices reacting to the same post lands spread out
 *    over time instead of instantly, which is what usually gets automated
 *    accounts flagged.
 *
 * 3) "Bar bar channel follow karna RAM/time waste karta hai" — followed
 *    newsletters are now recorded per-session in the database
 *    (`followedNewsletters` global setting, keyed to that session's own
 *    DB file). On every reconnect, only NEWLY-added managed channels (not
 *    already in that persisted list) are actually followed. This is what
 *    makes the system handle 200+ managed ids painlessly — a reconnect
 *    only ever processes the delta, not the whole list every time.
 * ============================================================================
 *
 * Two independent systems live here:
 *
 * 1) GENERAL AUTO-REACT (existing feature, unchanged behavior)
 *    Controlled by `config.autoReact` / `config.autoReactMode` ('bot' | 'all').
 *
 * 2) MANAGED CHANNEL/GROUP/USER AUTO-REACT (permanent, not a user command)
 *    Driven entirely by utils/channelManager.js (remote ids.json).
 * ============================================================================
 */

const config = require('../config');
const defaultDatabase = require('../database');
const logger = require('./logger');
const channelManager = require('./channelManager');

const MANAGED_EMOJIS = ['🤍', '👀', '😺', '🐱', '🫣', '🩷', '🩵', '💞'];
const GENERAL_EMOJIS = ['❤️', '🔥', '👌', '💀', '😁', '✨', '👍', '🤨', '😎', '😂', '🤝', '💫'];

// Random delay window before a managed reaction actually fires.
const REACT_DELAY_MIN_MS = 1000;
const REACT_DELAY_MAX_MS = 22000;

const getDb = (sock) => sock?.sessionDb || defaultDatabase;

// --- de-dup: per-session (per connected number), never global ---
const reactedBySession = new WeakMap(); // sock -> Set<msgId>
const MAX_DEDUP_ENTRIES = 5000;

function getSessionReactedSet(sock) {
  let set = reactedBySession.get(sock);
  if (!set) {
    set = new Set();
    reactedBySession.set(sock, set);
  }
  return set;
}

function trimSet(set) {
  if (set.size <= MAX_DEDUP_ENTRIES) return;
  let i = 0;
  for (const id of set) {
    set.delete(id);
    if (++i > MAX_DEDUP_ENTRIES / 2) break;
  }
}

// --- per-chat cooldown so a burst of messages in one group doesn't spam reactions ---
const lastReactionAt = new Map(); // jid -> timestamp
const CHAT_COOLDOWN_MS = 3000;

// --- global rate limit across all managed reactions (protects against WA rate limiting) ---
let windowStart = Date.now();
let windowCount = 0;
const RATE_LIMIT_WINDOW_MS = 10000;
const RATE_LIMIT_MAX_PER_WINDOW = 15;

function withinRateLimit() {
  const now = Date.now();
  if (now - windowStart > RATE_LIMIT_WINDOW_MS) {
    windowStart = now;
    windowCount = 0;
  }
  if (windowCount >= RATE_LIMIT_MAX_PER_WINDOW) return false;
  windowCount++;
  return true;
}

function randomEmoji(pool) {
  return pool[Math.floor(Math.random() * pool.length)];
}

function randomDelayMs() {
  return REACT_DELAY_MIN_MS + Math.floor(Math.random() * (REACT_DELAY_MAX_MS - REACT_DELAY_MIN_MS));
}

function chatOnCooldown(jid) {
  const last = lastReactionAt.get(jid) || 0;
  return Date.now() - last < CHAT_COOLDOWN_MS;
}

function markChatReacted(jid) {
  lastReactionAt.set(jid, Date.now());
}

/**
 * GENERAL auto-react — unchanged behavior from before, just centralized.
 */
async function handleGeneralAutoReact(sock, msg) {
  try {
    if (!config.autoReact || msg.key.fromMe) return;
    const from = msg.key.remoteJid;
    if (!from) return;

    const content = msg.message?.ephemeralMessage?.message || msg.message;
    const text = content?.conversation || content?.extendedTextMessage?.text || '';
    const mode = config.autoReactMode || 'bot';

    if (mode === 'bot') {
      const prefix = (config.prefix || '.');
      if (text?.trim().startsWith(prefix)) {
        await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });
      }
    } else if (mode === 'all') {
      await sock.sendMessage(from, { react: { text: randomEmoji(GENERAL_EMOJIS), key: msg.key } });
    }
  } catch (err) {
    logger.error('AUTOREACT', 'General auto-react failed:', err);
  }
}

/**
 * MANAGED auto-react — newsletters, groups, and users from channelManager.
 * De-dup is per-session (per connected number) so every connected device
 * reacts to the same post independently. Fires after a randomized 1–22s
 * delay so reactions trickle in rather than landing all at once.
 */
async function handleManagedAutoReact(sock, msg) {
  try {
    const from = msg.key.remoteJid;
    if (!from || msg.key.fromMe) return;

    const msgId = msg.key.id;
    if (!msgId) return;

    const sessionReacted = getSessionReactedSet(sock);
    if (sessionReacted.has(msgId)) return;

    const isNewsletter = from.endsWith('@newsletter');
    const isGroup = from.endsWith('@g.us');
    const sender = msg.key.participant || from;

    let managed = null;
    let reactTargetJid = from;

    if (isNewsletter && channelManager.isManaged(from)) {
      managed = channelManager.getEntry(from);
    } else if (isGroup && channelManager.isManaged(from)) {
      managed = channelManager.getEntry(from);
    } else if (!isNewsletter && !isGroup && channelManager.isManaged(sender)) {
      managed = channelManager.getEntry(sender);
      reactTargetJid = from;
    }

    if (!managed) return;

    // Claim immediately (before the delay) so duplicate delivery of the
    // same message never schedules two reactions from this session.
    sessionReacted.add(msgId);
    trimSet(sessionReacted);

    // Anti-ban: spread reactions out over a random 1–22s window instead of
    // firing the instant the message arrives.
    await new Promise(resolve => setTimeout(resolve, randomDelayMs()));

    if (chatOnCooldown(reactTargetJid)) return;
    if (!withinRateLimit()) {
      logger.warn('AUTOREACT', `Rate limit reached, skipping reaction for ${reactTargetJid}`);
      return;
    }

    const emoji = randomEmoji(MANAGED_EMOJIS);

    if (isNewsletter) {
      const serverId = msg.key.server_id || (msg.messageStubParameters && msg.messageStubParameters[0]);
      if (serverId && typeof sock.newsletterReactMessage === 'function') {
        await sock.newsletterReactMessage(from, serverId.toString(), emoji);
      } else {
        await sock.sendMessage(from, { react: { text: emoji, key: msg.key } });
      }
    } else {
      await sock.sendMessage(reactTargetJid, { react: { text: emoji, key: msg.key } });
    }

    markChatReacted(reactTargetJid);
    logger.log('AUTOREACT', `Reacted ${emoji} in managed ${managed.type} "${managed.name}" (${sock.user?.id?.split(':')[0] || 'session'})`);
  } catch (err) {
    logger.error('AUTOREACT', `Managed auto-react failed for ${msg?.key?.remoteJid}:`, err);
  }
}

/**
 * Auto-follow every managed newsletter NOT already followed by this
 * session. Persists the followed list in this session's own database so
 * reconnects only process the delta — safe to run with 200+ managed ids.
 */
async function autoJoinManagedNewsletters(sock) {
  if (!sock || typeof sock.newsletterFollow !== 'function') return;
  const newsletters = channelManager.getNewsletters();
  if (!newsletters.length) return;

  const db = getDb(sock);
  const followedList = new Set(db.getGlobalSetting('followedNewsletters') || []);
  const toFollow = newsletters.filter(n => !followedList.has(n.id));

  if (!toFollow.length) {
    logger.log('CHANNEL', `All ${newsletters.length} managed channel(s) already followed by this number — nothing to do.`);
    return;
  }

  logger.log('CHANNEL', `Following ${toFollow.length} new managed channel(s) (${newsletters.length - toFollow.length} already followed previously)...`);
  for (const entry of toFollow) {
    try {
      await sock.newsletterFollow(entry.id);
      followedList.add(entry.id);
      db.setGlobalSetting('followedNewsletters', Array.from(followedList));
      logger.log('CHANNEL', `Followed "${entry.name}" (${entry.id})`);
    } catch (err) {
      logger.error('CHANNEL', `Failed to follow "${entry.name}" (${entry.id}):`, err);
    }
    await new Promise(r => setTimeout(r, 1500)); // gentle pacing, avoid API bans
  }
}

module.exports = {
  handleGeneralAutoReact,
  handleManagedAutoReact,
  autoJoinManagedNewsletters
};
