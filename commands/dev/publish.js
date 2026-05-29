const config = require('../../config');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const crypto = require('crypto');

// ────────── TOTP Implementation (RFC 6238) ──────────
function base32Encode(buffer) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  let result = '';
  for (let i = 0; i < buffer.length; i++) {
    bits += buffer[i].toString(2).padStart(8, '0');
  }
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, '0');
    result += alphabet[parseInt(chunk, 2)];
  }
  const pad = 8 - (result.length % 8);
  if (pad < 8) result += '='.repeat(pad);
  return result;
}

function base32Decode(str) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  str = str.replace(/=+$/, '').toUpperCase();
  let bits = '';
  for (const c of str) {
    const val = alphabet.indexOf(c);
    if (val === -1) throw new Error('Invalid base32 character');
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function generateTOTPSecret(len = 20) {
  const buffer = crypto.randomBytes(len);
  return base32Encode(buffer);
}

function totpGenerate(secret, timeStep = 30, digits = 6) {
  const key = base32Decode(secret);
  const counter = Math.floor(Date.now() / 1000 / timeStep);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigInt64BE(BigInt(counter), 0);
  const hmac = crypto.createHmac('sha1', key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % (10 ** digits);
  return code.toString().padStart(digits, '0');
}

function totpVerify(token, secret, window = 1) {
  for (let i = -window; i <= window; i++) {
    const timeStep = 30;
    const key = base32Decode(secret);
    const counter = Math.floor(Date.now() / 1000 / timeStep) + i;
    const counterBuf = Buffer.alloc(8);
    counterBuf.writeBigInt64BE(BigInt(counter), 0);
    const hmac = crypto.createHmac('sha1', key).update(counterBuf).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % (10 ** 6);
    if (code.toString().padStart(6, '0') === token) return true;
  }
  return false;
}

// ────────── Database Keys ──────────
const KEY_TOKEN     = 'github_token';
const KEY_REPO      = 'github_repo';
const KEY_AUTH      = 'github_auth_secret';
const KEY_VERIFIED  = 'github_verified';

// ────────── Helpers ─────────────────────────────────

function parseRepoUrl(url) {
  try {
    const trimmed = url.replace(/\/$/, '').replace(/\.git$/, '');
    const match = trimmed.match(/github\.com\/([^\/]+\/[^\/]+)/);
    if (match) return match[1];
    const parts = trimmed.split('/');
    if (parts.length >= 2) return `${parts[parts.length-2]}/${parts[parts.length-1]}`;
    throw new Error('Invalid repo URL');
  } catch {
    throw new Error('Could not parse repo. Use owner/repo or full GitHub URL.');
  }
}

async function uploadToGitHub(token, repo, filePath, buffer, fileName) {
  const apiUrl = `https://api.github.com/repos/${repo}/contents/${filePath}`;
  const content = buffer.toString('base64');
  const headers = {
    Authorization: `token ${token}`,
    'User-Agent': 'ProBoy-MD-Publisher'
  };
  let sha = null;
  try {
    const getRes = await axios.get(apiUrl, { headers });
    sha = getRes.data.sha;
  } catch {}
  const payload = {
    message: `📦 Publish ${fileName} via ProBoy‑MD`,
    content,
    branch: 'main'
  };
  if (sha) payload.sha = sha;
  const response = await axios.put(apiUrl, payload, { headers });
  return response.data;
}

function parsePluginInfo(content) {
  const info = {};
  const match = content.match(/module\.exports\s*=\s*({[\s\S]*?})/);
  if (!match) return info;
  const objStr = match[1];
  const extract = (key) => {
    const regex = new RegExp(`${key}\\s*:\\s*['"]([^'"]+)['"]`);
    const m = objStr.match(regex);
    return m ? m[1] : null;
  };
  info.name = extract('name');
  info.category = extract('category');
  return info;
}

// 🆕 Auto‑rename file to index.js if name contains "index"
function resolveFileName(fileName) {
  const base = path.basename(fileName, path.extname(fileName));
  const ext = path.extname(fileName) || '.js';
  if (base.toLowerCase().includes('index') && base !== 'index') {
    return 'index' + ext;
  }
  return fileName;
}

// ────────── Command Export ─────────────────────────

module.exports = {
  name: 'publish',
  aliases: ['githubpush'],
  category: 'dev',
  description: 'Publish files/plugins to GitHub repository (TOTP protected, auto‑renames index files)',
  usage: `.publish setup <token> <repo_url>\n.publish verify <totp_code>\n.publish <totp_code> <localPath> [remotePath]`,
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    const db = extra.database;
    const prefix = config.prefix;

    let token = db.getGlobalSetting(KEY_TOKEN) || null;
    let repo = db.getGlobalSetting(KEY_REPO) || null;
    let totpSecret = db.getGlobalSetting(KEY_AUTH) || null;
    let verified = db.getGlobalSetting(KEY_VERIFIED) || false;

    const sub = args[0]?.toLowerCase();

    if (!sub) {
      return extra.reply(
        `📦 *Publish to GitHub (TOTP Authenticator)*\n\n` +
        `🔧 *First time setup:*\n` +
        `\`${prefix}publish setup <github_token> <repo_url>\`\n` +
        `   → You'll receive a TOTP secret for your authenticator app.\n\n` +
        `🔐 *Verify once:*\n` +
        `\`${prefix}publish verify <6-digit TOTP>\`\n\n` +
        `📤 *Publish (requires valid TOTP):*\n` +
        `\`${prefix}publish <totp> <localPath> [remotePath]\`\n` +
        `   OR reply to a file with \`${prefix}publish <totp>\`\n\n` +
        `💡 Example: \`${prefix}publish 123456 index.js\``
      );
    }

    if (sub === 'setup') {
      if (args.length < 3) return extra.reply(`❌ Usage: \`${prefix}publish setup <github_token> <repo_url>\``);
      const newToken = args[1];
      const repoInput = args.slice(2).join('/');
      let parsedRepo;
      try {
        parsedRepo = parseRepoUrl(repoInput);
      } catch (e) {
        return extra.reply(`❌ ${e.message}`);
      }

      const secret = generateTOTPSecret();
      db.setGlobalSetting(KEY_TOKEN, newToken);
      db.setGlobalSetting(KEY_REPO, parsedRepo);
      db.setGlobalSetting(KEY_AUTH, secret);
      db.setGlobalSetting(KEY_VERIFIED, false);

      const botName = config.botName || 'ProBoy';
      const uri = `otpauth://totp/${encodeURIComponent(botName)}?secret=${secret}&issuer=${encodeURIComponent(botName)}`;

      await extra.reply(
        `✅ GitHub credentials saved.\n\n` +
        `🔐 *TOTP Secret (keep safe!)*\n` +
        `\`${secret}\`\n\n` +
        `📱 Add this to Google Authenticator / Authy (manual entry).\n` +
        `🔗 Or use this URI in a QR generator:\n` +
        `\`${uri}\`\n\n` +
        `Next step: \`${prefix}publish verify <code>\` (use the code from your app)`
      );
      return;
    }

    if (sub === 'verify') {
      if (!totpSecret) return extra.reply('❌ No pending setup. Use `.publish setup` first.');
      const code = args[1];
      if (!code || !/^\d{6}$/.test(code)) return extra.reply('❌ Provide a valid 6‑digit TOTP code.');
      if (totpVerify(code, totpSecret)) {
        db.setGlobalSetting(KEY_VERIFIED, true);
        await extra.reply('✅ GitHub publishing verified and activated!');
      } else {
        await extra.reply('❌ Invalid TOTP code. Check your authenticator app time.');
      }
      return;
    }

    const totpCode = sub;
    if (!/^\d{6}$/.test(totpCode)) {
      return extra.reply('❌ First argument must be a 6‑digit TOTP code.');
    }
    if (!totpSecret) return extra.reply('❌ GitHub not set up. Use `.publish setup`.');
    if (!verified) return extra.reply('❌ Publishing not verified yet. Use `.publish verify <totp>` first.');
    if (!totpVerify(totpCode, totpSecret)) {
      return extra.reply('❌ Invalid/expired TOTP code. Check time and try again.');
    }

    if (!token || !repo) {
      return extra.reply('❌ GitHub config missing. Re‑run setup.');
    }

    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    let buffer, fileName, remotePath;

    // ─── Determine file source ───
    if (quoted?.documentMessage) {
      try {
        buffer = await downloadMediaMessage(
          { key: msg.key, message: quoted },
          'buffer',
          {},
          { logger: undefined, reuploadRequest: sock.updateMediaMessage }
        );
      } catch (e) {
        return extra.reply(`❌ Failed to download file: ${e.message}`);
      }
      fileName = quoted.documentMessage.fileName || 'file';

      // Apply index‑rename logic
      const originalFileName = fileName;
      fileName = resolveFileName(fileName);

      if (fileName.endsWith('.js')) {
        const content = buffer.toString('utf8');
        const info = parsePluginInfo(content);
        if (info.name && info.category) {
          remotePath = `commands/${info.category}/${info.name}.js`;
        } else {
          remotePath = args[1] || fileName;
        }
      } else {
        remotePath = args[1] || fileName;
      }
    } else {
      const localPath = args[1];
      if (!localPath) return extra.reply('❌ Provide a local file path or reply to a file.');
      const fullPath = path.resolve(path.join(__dirname, '../..', localPath));
      if (!fs.existsSync(fullPath)) return extra.reply(`❌ File not found: ${localPath}`);
      buffer = fs.readFileSync(fullPath);
      let originalFileName = path.basename(localPath);
      fileName = resolveFileName(originalFileName);

      // If user gave a custom remote path, keep it; else use the (possibly renamed) fileName
      remotePath = args[2] || fileName;
    }

    try {
      await extra.react('⏳');
      const result = await uploadToGitHub(token, repo, remotePath, buffer, fileName);
      await extra.reply(`✅ Published \`${remotePath}\` to ${repo}\nCommit: \`${result.commit.sha}\``);
      await extra.react('✅');
    } catch (error) {
      console.error('[publish] error:', error);
      await extra.reply(`❌ Upload failed: ${error.response?.data?.message || error.message}`);
      await extra.react('❌');
    }
  }
};