/**
 * Update Command – Skips custom installed plugins
 * Uses adm-zip (already required by updateViaZip) to extract only official files.
 * Owner gets notified privately after successful update.
 */

const config = require('../../config');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { execSync } = require('child_process');

// Try to load adm-zip (should already be installed for updateViaZip)
let AdmZip;
try {
  AdmZip = require('adm-zip');
} catch {
  // adm-zip not installed; we'll fail gracefully in execute
}

// ─── Config ─────────────────────────────────────────
const INSTALLED_LOG = path.join(__dirname, '../../database/installed_plugins.json');
const PRESERVED_DIRS = [
  'node_modules', 'session', 'sessions', 'tmp', 'temp',
  'database', 'config.js', 'core-manifest.json', 'installed_plugins.json'
];

// ─── Helpers ────────────────────────────────────────
function loadInstalledPaths() {
  try {
    if (!fs.existsSync(INSTALLED_LOG)) return [];
    const list = JSON.parse(fs.readFileSync(INSTALLED_LOG));
    return (list || []).map(e => e.path).filter(Boolean);
  } catch { return []; }
}

async function notifyOwner(sock, text) {
  try {
    const ownerNum = (config.ownerNumber && config.ownerNumber[0]) || '';
    if (!ownerNum) return;
    const jid = `${ownerNum.replace(/\D/g, '')}@s.whatsapp.net`;
    await sock.sendMessage(jid, { text });
  } catch {}
}

function restartBot() {
  try {
    execSync('pm2 restart all', { stdio: 'ignore' });
    return;
  } catch {}
  setTimeout(() => process.exit(0), 1000);
}

module.exports = {
  name: 'update',
  aliases: ['upgrade'],
  category: 'dev',
  description: 'Update bot from ZIP URL (preserves custom installed plugins, notifies owner)',
  usage: '.update [optional_zip_url]',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    if (!AdmZip) {
      return extra.reply('❌ Missing required module `adm-zip`. Please run `npm install adm-zip` on your server.');
    }

    const chatId = msg.key.remoteJid;
    const zipUrl = (args[0] || config.updateZipUrl || process.env.UPDATE_ZIP_URL || '').trim();
    if (!zipUrl) {
      return extra.reply('❌ No update URL configured. Set updateZipUrl in config.js or pass a URL: `.update <zip_url>`');
    }

    await extra.reply('🔄 Updating the bot, please wait…');

    try {
      // 1. Download ZIP
      const tmpDir = path.join(__dirname, '../../tmp');
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
      const zipPath = path.join(tmpDir, `update_${Date.now()}.zip`);

      const response = await axios.get(zipUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: { 'User-Agent': 'ProBoy-MD-Updater' }
      });
      fs.writeFileSync(zipPath, Buffer.from(response.data));

      // 2. Load skip list (custom installed plugins)
      const skipPaths = loadInstalledPaths();
      const root = path.join(__dirname, '../..');

      const zip = new AdmZip(zipPath);
      const entries = zip.getEntries();

      const updated = [];
      const added = [];
      const skipped = [];

      for (const entry of entries) {
        if (entry.isDirectory) continue;
        const relative = entry.entryName;

        // Always skip preserved directories and files
        if (PRESERVED_DIRS.some(dir => relative === dir || relative.startsWith(dir + '/'))) {
          skipped.push(relative);
          continue;
        }

        // Skip if this file was installed manually
        if (skipPaths.includes(relative)) {
          skipped.push(relative);
          continue;
        }

        const targetPath = path.join(root, relative);
        const targetDir = path.dirname(targetPath);
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

        const existed = fs.existsSync(targetPath);
        fs.writeFileSync(targetPath, entry.getData());
        if (existed) updated.push(relative);
        else added.push(relative);
      }

      // Clean up temp ZIP
      try { fs.unlinkSync(zipPath); } catch {}

      // 3. Build summary
      const lines = [];
      lines.push(`✅ *Update complete*`);
      lines.push(`📥 Updated: ${updated.length} | Added: ${added.length} | Skipped: ${skipped.length}`);
      if (skipped.length) lines.push(`🛡️ Custom plugins preserved: ${skipPaths.length}`);

      const sample = [...updated.slice(0, 15), ...added.slice(0, 15)].slice(0, 25);
      if (sample.length) {
        lines.push('');
        lines.push('*Changed files (sample):*');
        for (const f of sample) lines.push(`- \`${f}\``);
        if (updated.length + added.length > sample.length) {
          lines.push(`- ...and ${updated.length + added.length - sample.length} more`);
        }
      }

      const summary = lines.join('\n') + '\n\n🔄 Restarting now…';

      // 4. Send to chat and notify owner
      await sock.sendMessage(chatId, { text: summary }, { quoted: msg });
      await notifyOwner(sock, summary);

      // 5. Restart
      restartBot();
    } catch (error) {
      await sock.sendMessage(chatId, {
        text: `❌ Update failed:\n${String(error.message || error)}`
      }, { quoted: msg });
    }
  }
};
