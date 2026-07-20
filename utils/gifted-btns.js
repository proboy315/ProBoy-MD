/**
 * ProBoy-MD :: Gifted-Buttons Wrapper
 * ============================================================================
 * This is the REAL wrapper around the `gifted-btns` npm package
 * (https://www.npmjs.com/package/gifted-btns). It injects the binary nodes
 * (`biz`, `interactive`, `native_flow`, `bot`) that WhatsApp requires to
 * render interactive buttons on top of Baileys.
 *
 * WHY THIS FILE EXISTS:
 * `utils/button.js` used to work, then a later "FIXED" edit quietly stopped
 * calling the `gifted-btns` package and instead tried to send buttons using
 * WhatsApp's old legacy `buttons:[...]` format (deprecated, no longer
 * rendered by current WhatsApp clients), falling back to plain numbered
 * text lines like "1. 📋 Copy Code: XXXX" whenever that legacy format
 * didn't apply (which is basically always, for cta_copy/cta_url/etc).
 * That's why buttons silently degraded into text.
 *
 * This file talks to the real package directly. `utils/button.js` now
 * delegates to this file for sending, so nothing else needs to change.
 * `utils/aiIcon.js` also uses `sendInteractiveMessage` directly (with an
 * empty button list + `aimode: true`) to attach WhatsApp's AI badge to
 * plain replies in private chats.
 * ============================================================================
 */

const config = require('../config');

let gifted = null;
try {
  gifted = require('gifted-btns');
} catch (err) {
  console.error('[GIFTED-BTNS] Package "gifted-btns" is not installed/loadable. Run: npm install gifted-btns');
  console.error('[GIFTED-BTNS] Load error:', err?.message || err);
}

// ---------------------------------------------------------------------------
// Safe plain-text fallback (only used if the real package is unavailable or
// a send genuinely fails). Never throws.
// ---------------------------------------------------------------------------
function describeButtonAsText(button, index) {
  let params = {};
  try { params = JSON.parse(button.buttonParamsJson || '{}'); } catch { /* ignore */ }

  switch (button.name) {
    case 'cta_copy':
      return `${index}. ${params.display_text || 'Copy'}: ${params.copy_code || ''}`;
    case 'cta_url':
      return `${index}. ${params.display_text || 'Open'}: ${params.url || ''}`;
    case 'cta_call':
      return `${index}. ${params.display_text || 'Call'}: ${params.phone_number || ''}`;
    case 'quick_reply':
      return `${index}. ${params.display_text || 'Reply'}`;
    case 'single_select':
      return `${index}. ${params.title || 'Select an option'}`;
    case 'cta_catalog':
      return `${index}. ${params.display_text || 'View Catalog'}`;
    case 'send_location':
      return `${index}. ${params.display_text || 'Share Location'}`;
    default:
      return `${index}. ${params.display_text || button.name}`;
  }
}

async function plainTextFallback(sock, jid, content = {}, options = {}) {
  const { text = '', footer = '', interactiveButtons = [] } = content;
  const lines = interactiveButtons
    .map((btn, i) => describeButtonAsText(btn, i + 1))
    .filter(Boolean);

  // Only show the footer alongside a fallback button list. If there are no
  // buttons at all (e.g. a failed AI-icon attempt on a plain message, see
  // utils/aiIcon.js), keep the text exactly as it would have been sent
  // originally — no surprise footer suffix on ordinary replies.
  const fallbackText = lines.length
    ? [text, lines.join('\n'), footer].filter(Boolean).join('\n\n')
    : text;

  return sock.sendMessage(jid, { text: fallbackText || text || ' ' }, options);
}

// ---------------------------------------------------------------------------
// Button builders — full catalog from the gifted-btns docs.
// Each returns a { name, buttonParamsJson } object ready for
// `interactiveButtons`.
// ---------------------------------------------------------------------------
const buttons = {
  quickReply(displayText, id) {
    return { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: displayText, id }) };
  },
  ctaUrl(displayText, url, merchantUrl) {
    const payload = { display_text: displayText, url };
    if (merchantUrl) payload.merchant_url = merchantUrl;
    return { name: 'cta_url', buttonParamsJson: JSON.stringify(payload) };
  },
  ctaCopy(displayText, copyCode) {
    return { name: 'cta_copy', buttonParamsJson: JSON.stringify({ display_text: displayText, copy_code: copyCode }) };
  },
  ctaCall(displayText, phoneNumber) {
    return { name: 'cta_call', buttonParamsJson: JSON.stringify({ display_text: displayText, phone_number: phoneNumber }) };
  },
  ctaCatalog(displayText) {
    return { name: 'cta_catalog', buttonParamsJson: JSON.stringify(displayText ? { display_text: displayText } : {}) };
  },
  singleSelect(title, sections) {
    return { name: 'single_select', buttonParamsJson: JSON.stringify({ title, sections }) };
  },
  sendLocation(displayText) {
    return { name: 'send_location', buttonParamsJson: JSON.stringify(displayText ? { display_text: displayText } : {}) };
  },
  reviewAndPay(payload) {
    return { name: 'review_and_pay', buttonParamsJson: JSON.stringify(payload || {}) };
  },
  paymentInfo(payload) {
    return { name: 'payment_info', buttonParamsJson: JSON.stringify(payload || {}) };
  },
  mpm(payload) {
    return { name: 'mpm', buttonParamsJson: JSON.stringify(payload || {}) };
  },
  waPaymentTransactionDetails(payload) {
    return { name: 'wa_payment_transaction_details', buttonParamsJson: JSON.stringify(payload || {}) };
  },
  automatedGreetingMessageViewCatalog(payload) {
    return { name: 'automated_greeting_message_view_catalog', buttonParamsJson: JSON.stringify(payload || {}) };
  }
};

// ---------------------------------------------------------------------------
// Converts the repo's older simple button shape:
//   { type: 'copy'|'url'|'quick_reply'|'call'|'catalog'|'select'|'location', ... }
// into a proper native_flow button. Keeps old command code working untouched.
// ---------------------------------------------------------------------------
function normalizeLegacyButton(btn) {
  if (!btn) return null;
  if (btn.name && btn.buttonParamsJson) return btn; // already in native_flow shape

  switch (btn.type) {
    case 'copy':
      return buttons.ctaCopy(btn.displayText || 'Copy', btn.copyCode || '');
    case 'url':
      return buttons.ctaUrl(btn.displayText || 'Open Link', btn.url || config.social?.website || 'https://example.com');
    case 'call':
      return buttons.ctaCall(btn.displayText || 'Call', btn.phoneNumber || '');
    case 'catalog':
      return buttons.ctaCatalog(btn.displayText);
    case 'select':
      return buttons.singleSelect(btn.title || 'Menu', btn.sections || []);
    case 'location':
      return buttons.sendLocation(btn.displayText);
    case 'quick_reply':
      return buttons.quickReply(btn.displayText || 'Reply', btn.id || `btn_${Date.now()}`);
    default:
      console.warn(`[GIFTED-BTNS] Unknown legacy button type: ${btn.type}`);
      return null;
  }
}

// ---------------------------------------------------------------------------
// Core: sendInteractiveMessage — full power, direct pass-through to the
// gifted-btns package (mix any button kinds, headers, images, aimode, etc).
// ---------------------------------------------------------------------------
async function sendInteractiveMessage(sock, jid, content = {}, options = {}) {
  if (!sock) throw new Error('Socket is required');
  if (!jid) throw new Error('jid is required');

  const payload = {
    footer: config.botName || 'Bot',
    ...content
  };

  if (!gifted || typeof gifted.sendInteractiveMessage !== 'function') {
    return plainTextFallback(sock, jid, payload, options);
  }

  try {
    return await gifted.sendInteractiveMessage(sock, jid, payload, options);
  } catch (error) {
    console.error('[GIFTED-BTNS] sendInteractiveMessage failed, using text fallback:', error?.message || error);
    return plainTextFallback(sock, jid, payload, options);
  }
}

// ---------------------------------------------------------------------------
// Core: sendButtons — simple/common case (quick replies + one CTA row etc),
// also accepts the repo's legacy { type, displayText, ... } button shape.
// ---------------------------------------------------------------------------
async function sendButtons(sock, jid, opts = {}) {
  if (!sock) throw new Error('Socket is required');
  if (!jid) throw new Error('jid is required');

  const {
    title,
    text = '',
    footer = config.botName || 'Bot',
    image,
    aimode,
    buttons: rawButtons = [],
    quoted = null
  } = opts;

  if (!text) throw new Error('Button message requires text');
  if (!rawButtons.length) throw new Error('At least one button is required');

  const interactiveButtons = rawButtons.map(normalizeLegacyButton).filter(Boolean);
  if (!interactiveButtons.length) throw new Error('No valid buttons to send');

  if (!gifted || typeof gifted.sendButtons !== 'function') {
    return plainTextFallback(sock, jid, { text, footer, interactiveButtons }, { quoted });
  }

  try {
    return await gifted.sendButtons(sock, jid, {
      title,
      text,
      footer,
      image,
      aimode,
      buttons: interactiveButtons
    });
  } catch (error) {
    console.error('[GIFTED-BTNS] sendButtons failed, using text fallback:', error?.message || error);
    return plainTextFallback(sock, jid, { text, footer, interactiveButtons }, { quoted });
  }
}

module.exports = {
  sendButtons,
  sendInteractiveMessage,
  buttons,
  normalizeLegacyButton,
  isAvailable: () => Boolean(gifted)
};
