/**
 * utils/webui.js - build & send the "HTML payload" (WebUI) message.
 * Dependency-free (only node:crypto). Uses sock.relayMessage with a
 * richResponseMessage that carries a unifiedResponse JSON holding an HTML primitive.
 *
 * EXPERIMENTAL: the wrapper imitates a forwarded Meta-AI rich response. Rendering
 * depends on the recipient's WhatsApp client version; the internal type name is
 * obfuscated and WhatsApp may change it at any time. Always keep the text fallback.
 */
const crypto = require('crypto');

const MAX_HTML_BYTES = 64 * 1024;
const HTML_TYPENAME = 'GenAIaeacdsnwHtmlPrimitive';

function newMessageId() {
  return '3EB0' + crypto.randomBytes(18).toString('hex').toUpperCase();
}

function buildUnifiedJson(html) {
  return {
    response_id: crypto.randomUUID(),
    sections: [{
      view_model: {
        primitive: { __typename: HTML_TYPENAME, payload: html, trusted_sources: [] },
        __typename: 'GenAISingleLayoutViewModel'
      }
    }]
  };
}

function buildMessage(html, title = 'ProBoy-MD', botJid = '867051314767696@bot') {
  const json = buildUnifiedJson(html);
  return {
    messageContextInfo: {
      deviceListMetadata: {},
      deviceListMetadataVersion: 2,
      botMetadata: { botResponseId: crypto.randomUUID() }
    },
    botForwardedMessage: {
      message: {
        richResponseMessage: {
          messageType: 'AI_RICH_RESPONSE_TYPE_STANDARD',
          submessages: [{ messageType: 'AI_RICH_RESPONSE_TEXT', messageText: String(title) }],
          unifiedResponse: { data: Buffer.from(JSON.stringify(json)).toString('base64') },
          contextInfo: {
            forwardingScore: 1,
            isForwarded: true,
            forwardedAiBotMessageInfo: { botJid },
            forwardOrigin: 'META_AI'
          }
        }
      }
    }
  };
}

/** Wrap a body fragment into a standalone page (inline CSS only, no external resources). */
function page(body, { title = 'ProBoy-MD', css = '' } = {}) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{margin:0;padding:16px;font-family:system-ui,sans-serif;background:#0b141a;color:#e9edef}.card{background:#202c33;border-radius:12px;padding:14px;margin:8px 0}${css}</style></head><body>${body}</body></html>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Send an HTML page. Returns {ok, id} or {ok:false, error}. Never throws.
 * If sending fails and opts.fallbackText is given, that text is sent as a normal message.
 */
async function sendHtml(sock, jid, html, opts = {}) {
  try {
    const bytes = Buffer.byteLength(html, 'utf8');
    if (bytes > MAX_HTML_BYTES) throw new Error(`HTML is ${bytes} bytes; limit is ${MAX_HTML_BYTES}`);
    const id = newMessageId();
    await sock.relayMessage(jid, buildMessage(html, opts.title, opts.botJid), { messageId: id });
    return { ok: true, id, bytes };
  } catch (e) {
    if (opts.fallbackText) { try { await sock.sendMessage(jid, { text: opts.fallbackText }); } catch { /* ignore */ } }
    return { ok: false, error: e.message };
  }
}

module.exports = { sendHtml, buildMessage, buildUnifiedJson, page, escapeHtml, newMessageId, MAX_HTML_BYTES, HTML_TYPENAME };
