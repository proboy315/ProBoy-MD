/**
 * ProBoy-MD :: Automatic "AI" Icon Attachment
 * ============================================================================
 * Wraps `sock.sendMessage` ONE time, right after the socket is created, so
 * that every eligible bot reply in a private chat automatically renders with
 * WhatsApp's AI badge (via gifted-btns' `aimode` flag) — without touching a
 * single command file. This works because `extra.reply` in handler.js (and
 * every direct `sock.sendMessage(...)` call across commands) ultimately goes
 * through this one function once patched.
 *
 * SAFE BY DESIGN — read before changing:
 * - Only touches plain text messages: `{ text: '...' }` with no media,
 *   buttons, reactions, edits, deletes, polls, location, or contacts keys.
 * - Only touches private (1:1) chats — NEVER groups (`@g.us`), broadcast,
 *   status, or newsletter JIDs. Group/media/reaction/button sends are passed
 *   straight through to the original sendMessage, completely untouched.
 * - If attaching the icon fails for ANY reason (package missing, WhatsApp
 *   rejects the interactive shape, network hiccup, whatever) it silently
 *   falls back to sending the exact plain message that would have been sent
 *   anyway. It NEVER throws and NEVER blocks a reply from going out.
 * - Idempotent: calling `attachAiIcon(sock)` twice on the same socket is a
 *   no-op the second time (checks `sock.__aiIconAttached`).
 * - Toggle: set `config.aiIcon = false` to disable this feature entirely
 *   without touching this file (defaults to ON if not set).
 * ============================================================================
 */

const config = require('../config');
const { sendInteractiveMessage } = require('./gifted-btns');

// Any of these keys present on `content` disqualifies the message from
// getting the AI-icon treatment — it's routed through untouched instead.
const EXCLUDED_CONTENT_KEYS = [
  'image', 'video', 'audio', 'sticker', 'document', 'location',
  'contacts', 'poll', 'buttons', 'templateButtons', 'interactiveButtons',
  'interactiveMessage', 'edit', 'delete', 'react', 'viewOnce',
  'listMessage', 'product', 'catalog'
];

function isPrivateChat(jid) {
  return typeof jid === 'string'
    && jid.endsWith('@s.whatsapp.net')
    && !jid.includes('@g.us')
    && !jid.includes('@broadcast')
    && !jid.includes('@newsletter');
}

function isEligibleForAiIcon(jid, content) {
  if (!isPrivateChat(jid)) return false;
  if (!content || typeof content !== 'object') return false;
  if (typeof content.text !== 'string' || !content.text.trim()) return false;
  for (const key of EXCLUDED_CONTENT_KEYS) {
    if (key in content) return false;
  }
  return true;
}

/**
 * Patch a live Baileys socket so eligible outgoing messages get the AI icon.
 * Call this once, right after `makeWASocket(...)`, before wiring up any
 * other event handlers.
 */
function attachAiIcon(sock) {
  if (!sock || typeof sock.sendMessage !== 'function') return sock;
  if (sock.__aiIconAttached) return sock; // idempotent guard

  const aiIconEnabled = config.aiIcon !== false; // default ON unless explicitly disabled
  if (!aiIconEnabled) return sock;

  const originalSendMessage = sock.sendMessage.bind(sock);

  sock.sendMessage = async (jid, content = {}, options = {}) => {
    // Recursion / opt-out guard: gifted-btns's own internal fallback path
    // may call sock.sendMessage again — this flag tells us to skip straight
    // to the original implementation instead of re-wrapping.
    if (options.__skipAiIcon || !isEligibleForAiIcon(jid, content)) {
      return originalSendMessage(jid, content, options);
    }

    try {
      return await sendInteractiveMessage(sock, jid, {
        text: content.text,
        footer: content.footer || config.botName,
        aimode: true,
        interactiveButtons: []
      }, { ...options, __skipAiIcon: true });
    } catch (err) {
      console.error('[AI-ICON] Could not attach AI icon, sending plain message instead:', err?.message || err);
      return originalSendMessage(jid, content, options);
    }
  };

  sock.__aiIconAttached = true;
  return sock;
}

module.exports = { attachAiIcon, isEligibleForAiIcon };
