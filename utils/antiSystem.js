/**
 * ProBoy-MD :: Anti-System (AntiLink + AntiCall)
 * ============================================================================
 * v3 CHANGELOG (this revision)
 * ============================================================================
 * ANTICALL:
 *  - Rejection message is now user-configurable per session
 *    (`.anticall message <text>`) instead of a hardcoded string.
 *  - Confirmed/hardened per-session scoping: anticall reads/writes through
 *    `getDb(sock)`, which resolves to `sock.sessionDb` — i.e. THIS
 *    connected number's own database file, not a shared one. Turning
 *    anticall on for your number never affects any other connected number;
 *    each one only enforces it if THEY turn it on for themselves. (This
 *    was already true architecturally, since every session gets its own
 *    `sock.sessionDb` per README's "Session-Scoped Settings" — if you're
 *    seeing cross-account behavior, check that `sock.sessionDb` is being
 *    assigned for every session, including ones added via `.connect`.)
 *
 * ANTILINK: now a full configurable system, not just an on/off flag.
 *  - EXCLUDE list (`groupSettings.antilinkWhitelist`) — domains that are
 *    always allowed through, even while antilink is on.
 *  - INCLUDE list (`groupSettings.antilinkInclude`, NEW) — specific
 *    substrings/patterns (e.g. a known phishing link fragment) that are
 *    ALWAYS enforced, regardless of whether general antilink is on or off.
 *    This is for "always nuke this specific bad link" rules independent of
 *    your general link policy. Example: adding `proboy-md.gt.tc` to
 *    include means any message containing that text gets deleted/kicked
 *    even if `.antilink off`.
 *  - Configurable per-group warning limit (`groupSettings.antilinkWarnLimit`,
 *    NEW, falls back to `config.maxWarnings`) and a way to reset a user's
 *    warning count (`.antilink resetwarn @user`).
 *  - All managed through the new `commands/general/antilink.js` command.
 * ============================================================================
 */

const config = require('../config');
const logger = require('./logger');

// ---------------------------------------------------------------------------
// ANTILINK
// ---------------------------------------------------------------------------

const LINK_PATTERN = /(https?:\/\/)?([a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.)+[a-zA-Z]{2,}(\/[^\s]*)?/i;

function getAntilinkWarnLimit(groupSettings) {
  const custom = Number(groupSettings?.antilinkWarnLimit);
  if (Number.isFinite(custom) && custom > 0) return custom;
  return config.maxWarnings || 3;
}

function matchesInclude(body, includeList) {
  if (!Array.isArray(includeList) || !includeList.length) return null;
  const lower = body.toLowerCase();
  return includeList.find(pattern => pattern && lower.includes(String(pattern).toLowerCase())) || null;
}

function isWhitelisted(urlLike, whitelist) {
  if (!urlLike || !Array.isArray(whitelist) || !whitelist.length) return false;
  try {
    const normalized = urlLike.startsWith('http') ? urlLike : `https://${urlLike}`;
    const hostname = new URL(normalized).hostname.toLowerCase();
    return whitelist
      .map(d => String(d || '').trim().toLowerCase())
      .some(d => d && (hostname === d || hostname.endsWith(`.${d}`)));
  } catch {
    return false;
  }
}

/**
 * Apply the configured antilink action (delete/kick/warn) for a violation.
 * `reason` is used in the warning log / message shown to the group.
 */
async function applyAntilinkAction(sock, msg, groupSettings, deps, reason) {
  const from = msg.key.remoteJid;
  const sender = msg.key.participant || msg.key.remoteJid;
  const { getDb } = deps;

  try {
    await sock.sendMessage(from, { delete: msg.key });
  } catch (e) {
    logger.error('ANTILINK', 'Failed to delete offending message:', e);
  }

  const action = (groupSettings.antilinkAction || 'delete').toLowerCase();

  if (action === 'warn') {
    const warnData = getDb(sock).addWarning(from, sender, reason);
    const maxWarnings = getAntilinkWarnLimit(groupSettings);
    if (warnData.count >= maxWarnings) {
      await sock.groupParticipantsUpdate(from, [sender], 'remove');
      await sock.sendMessage(from, { text: `🔗 *Anti-Link* triggered (${reason}).\n@${sender.split('@')[0]} was kicked for reaching ${maxWarnings} warnings.`, mentions: [sender] });
      getDb(sock).clearWarnings(from, sender); // reset after enforcement
    } else {
      await sock.sendMessage(from, { text: `🔗 *Anti-Link* triggered (${reason}).\nWarning ${warnData.count}/${maxWarnings}. Link removed.`, mentions: [sender] });
    }
  } else if (action === 'kick') {
    await sock.groupParticipantsUpdate(from, [sender], 'remove');
    await sock.sendMessage(from, { text: `🔗 *Anti-Link* triggered (${reason}).\nLink removed and @${sender.split('@')[0]} kicked.`, mentions: [sender] });
  } else {
    await sock.sendMessage(from, { text: `🔗 *Anti-Link* triggered (${reason}).\nLink removed from @${sender.split('@')[0]}.`, mentions: [sender] });
  }
}

/**
 * @returns {boolean} true if the message was handled (deleted/warned/kicked)
 * — caller should stop further processing.
 */
async function handleAntilink(sock, msg, groupMetadata, deps) {
  const { getDb, isOwner, isAdmin, isBotAdmin } = deps;
  try {
    const from = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;

    const groupSettings = getDb(sock).getGroupSettings(from);
    if (!groupSettings) return false;

    const body = msg.message?.conversation ||
                 msg.message?.extendedTextMessage?.text ||
                 msg.message?.imageMessage?.caption ||
                 msg.message?.videoMessage?.caption || '';
    if (!body) return false;

    // INCLUDE patterns are always enforced, independent of the general
    // antilink on/off toggle — these are explicit "always block this"
    // rules (e.g. a known phishing link).
    const includeHit = matchesInclude(body, groupSettings.antilinkInclude);
    const generalHit = groupSettings.antilink && LINK_PATTERN.test(body);

    if (!includeHit && !generalHit) return false;

    // Owner + group admin bypass (applies to both include and general hits —
    // these are still moderation actions, not a hard account-level block).
    const senderIsAdmin = await isAdmin(sock, sender, from, groupMetadata);
    if (senderIsAdmin || isOwner(sender)) return false;

    const botIsAdmin = await isBotAdmin(sock, from, groupMetadata);
    if (!botIsAdmin) {
      logger.log('ANTILINK', `Bot is not admin in ${from}, cannot enforce.`);
      return false;
    }

    if (includeHit) {
      await applyAntilinkAction(sock, msg, groupSettings, deps, `matched include pattern "${includeHit}"`);
      return true;
    }

    // General link detection — respect the EXCLUDE (whitelist) list.
    const match = body.match(LINK_PATTERN);
    const urlLike = match ? match[0] : null;
    if (isWhitelisted(urlLike, groupSettings.antilinkWhitelist)) return false;

    await applyAntilinkAction(sock, msg, groupSettings, deps, 'link detected');
    return true;
  } catch (error) {
    logger.error('ANTILINK', 'Handler error:', error);
    return false;
  }
}

// ---------------------------------------------------------------------------
// ANTICALL
// ---------------------------------------------------------------------------

const DEFAULT_ANTICALL_MESSAGE = '🚫 *Policy:* Voice and video calls are not permitted on this number. You have been blocked.';

/** Read the effective anticall state for THIS session only. */
function isAntiCallEnabled(sock, deps) {
  const { getDb } = deps;
  const dbValue = getDb(sock).getGlobalSetting('anticall');
  if (typeof dbValue === 'boolean') return dbValue;
  return Boolean(config.defaultGroupSettings?.anticall);
}

/** Toggle anticall for THIS session only. */
function setAntiCallEnabled(sock, deps, enabled) {
  const { getDb } = deps;
  return getDb(sock).setGlobalSetting('anticall', Boolean(enabled));
}

/** Get the configured rejection message for THIS session. */
function getAntiCallMessage(sock, deps) {
  const { getDb } = deps;
  const msgText = getDb(sock).getGlobalSetting('anticallMessage');
  return (typeof msgText === 'string' && msgText.trim()) ? msgText.trim() : DEFAULT_ANTICALL_MESSAGE;
}

/** Set the rejection message for THIS session. */
function setAntiCallMessage(sock, deps, text) {
  const { getDb } = deps;
  return getDb(sock).setGlobalSetting('anticallMessage', String(text || '').trim());
}

/**
 * Wire up the incoming-call listener. Call once per socket, right after
 * the socket is created. Only rejects/blocks calls made TO this specific
 * connected number, and only if THIS number has anticall enabled.
 */
function initializeAntiCall(sock, deps) {
  if (!sock?.ev) return;
  logger.log('ANTICALL', `Module armed for ${sock.user?.id?.split(':')[0] || 'session'}.`);

  sock.ev.on('call', async (calls) => {
    try {
      if (!isAntiCallEnabled(sock, deps)) return;
      const message = getAntiCallMessage(sock, deps);

      for (const call of calls) {
        if (call.status !== 'offer') continue;
        logger.log('ANTICALL', `Rejecting incoming call from ${call.from}`);
        try {
          await sock.rejectCall(call.id, call.from);
        } catch (e) {
          logger.error('ANTICALL', 'rejectCall failed:', e);
        }
        try {
          await sock.sendMessage(call.from, { text: message });
        } catch (e) { /* best effort */ }
        try {
          await sock.updateBlockStatus(call.from, 'block');
        } catch (e) {
          logger.error('ANTICALL', 'updateBlockStatus failed:', e);
        }
      }
    } catch (err) {
      logger.error('ANTICALL', 'Call handler crashed:', err);
    }
  });
}

module.exports = {
  handleAntilink,
  initializeAntiCall,
  isAntiCallEnabled,
  setAntiCallEnabled,
  getAntiCallMessage,
  setAntiCallMessage,
  getAntilinkWarnLimit
};
