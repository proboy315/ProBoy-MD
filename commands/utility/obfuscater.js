/**
 * Obfuscator Plugin for ProBoy‑MD
 * Obfuscates JavaScript code using PrinceTech API (encryptv3).
 * Accepts input from:
 *   - Text arguments
 *   - Quoted text message
 *   - File upload (document) with .js or text content
 * Output: obfuscated code as a downloadable file.
 */

const axios = require('axios');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  'okhttp/4.9.3'
];

// Retry function with exponential backoff
async function fetchWithRetry(url, maxRetries = 3, timeout = 20000) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const userAgent = USER_AGENTS[(attempt - 1) % USER_AGENTS.length];
      const response = await axios.get(url, {
        timeout,
        headers: { 'User-Agent': userAgent }
      });
      return response;
    } catch (err) {
      lastError = err;
      if (attempt === maxRetries) break;
      const delay = Math.pow(2, attempt - 1) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

// Extract code from message: could be text, quoted text, or a file (document)
async function extractCode(sock, msg, args) {
  // 1. If there are text arguments, use them (priority given to file? We'll decide: file over text)
  // But we need to check if a file is attached. We'll first look for a file, then fallback to text.

  // Helper to read file from a document message
  const readFileFromMsg = async (docMsg) => {
    try {
      const buffer = await downloadMediaMessage(docMsg, 'buffer', {});
      // Try to decode as UTF-8 text
      return buffer.toString('utf-8');
    } catch {
      return null;
    }
  };

  // Check if current message has a document
  if (msg.message?.documentMessage) {
    const code = await readFileFromMsg(msg);
    if (code) return { code, filename: msg.message.documentMessage.fileName || 'code.js' };
  }

  // Check if quoted message has a document
  const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (quoted?.documentMessage) {
    const quotedMsg = { key: msg.key, message: quoted };
    const code = await readFileFromMsg(quotedMsg);
    if (code) return { code, filename: quoted.documentMessage.fileName || 'code.js' };
  }

  // If no file, check for text input
  let code = null;
  if (args.length) {
    code = args.join(' ');
  } else if (quoted) {
    if (quoted.conversation) code = quoted.conversation;
    else if (quoted.extendedTextMessage?.text) code = quoted.extendedTextMessage.text;
  }

  if (code) return { code, filename: null }; // no original filename

  return null;
}

// Edit a message
async function editMessage(sock, key, newText) {
  await sock.sendMessage(key.remoteJid, { text: newText, edit: key });
}

module.exports = {
  name: 'obfuscate',
  aliases: ['obfuscator', 'encryptv3', 'uglify'],
  category: 'utility',
  description: '🔐 Obfuscate JavaScript code (hard mode) – supports text or file input, returns file',
  usage: '.obfuscate <code>  or  reply to a code/file with .obfuscate',

  async execute(sock, msg, args, extra) {
    const { reply, react, from } = extra;

    try {
      await react('🔐');

      // Extract code from message
      const extracted = await extractCode(sock, msg, args);
      if (!extracted) {
        return reply(
          '❌ No code or file found.\n\n' +
          'Usage:\n' +
          '• Send a `.js` file with caption `.obfuscate`\n' +
          '• Reply to a file with `.obfuscate`\n' +
          '• `.obfuscate console.log("Hello")`\n' +
          '• Reply to a text message containing code'
        );
      }

      const { code, filename } = extracted;
      if (!code.trim()) {
        return reply('❌ Code/file is empty.');
      }

      await react('⏳');
      const processingMsg = await sock.sendMessage(from, { text: '⏳ Obfuscating code...' }, { quoted: msg });
      const msgKey = processingMsg.key;

      // Encode and call API
      const encodedCode = encodeURIComponent(code);
      const apiUrl = `https://api.princetechn.com/api/tools/encryptv3?apikey=prince&code=${encodedCode}`;

      let response;
      try {
        response = await fetchWithRetry(apiUrl, 3, 20000);
      } catch (err) {
        console.error('Obfuscator retries failed:', err);
        await editMessage(sock, msgKey, '❌ Obfuscation failed after multiple attempts. The API may be down.');
        await react('❌');
        return;
      }

      const data = response.data;

      // Check API response
      if (!data || !data.success || !data.result?.encrypted_code) {
        await editMessage(sock, msgKey, `❌ API error: ${data?.message || 'Invalid response'}`);
        await react('❌');
        return;
      }

      const obfuscated = data.result.encrypted_code;

      // Determine output filename
      let outputFilename = filename ? filename.replace(/\.[^/.]+$/, '') + '_obfuscated.js' : 'obfuscated.js';
      if (!outputFilename.endsWith('.js')) outputFilename += '.js';

      // Send as file (always)
      const buffer = Buffer.from(obfuscated, 'utf-8');
      await sock.sendMessage(from, {
        document: buffer,
        fileName: outputFilename,
        mimetype: 'application/javascript',
        caption: '✅ Obfuscation complete!'
      }, { quoted: msg });

      // Delete the temporary "Obfuscating..." message
      try { await sock.sendMessage(from, { delete: msgKey }); } catch {}

      await react('✅');
    } catch (error) {
      console.error('Obfuscate error:', error);
      await reply(`❌ Unexpected error: ${error.message}`);
      await react('❌');
    }
  }
};