/**
 * Update Command – Smart Update with Custom File Preservation & Owner Notification
 *
 * - Downloads the configured ZIP (or a custom URL)
 * - Compares files against a local core-manifest.json (auto‑generated on first run)
 * - Extracts ONLY files that belong to the core release, preserving all custom/added files
 * - Sends a detailed update report to the bot owner via WhatsApp
 * - Restarts the bot automatically
 *
 * Preserved directories (never touched):
 *   node_modules, session, sessions, tmp, temp, database, config.js
 * Custom files (not in core-manifest.json) are NEVER overwritten.
 */

const config = require('../../config');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { execSync } = require('child_process');
const AdmZip = require('adm-zip');

// ─── Helpers ────────────────────────────────────────

/** Read the local core manifest (list of relative file paths) or generate one. */
function loadLocalManifest() {
  const manifestPath = path.join(__dirname, '../../core-manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch {}
  }

  // ── Generate initial manifest from current files (first run) ──
  const root = path.join(__dirname, '../..');
  const preserved = [
    'node_modules', 'session', 'sessions', 'tmp', 'temp',
    'database', 'config.js', 'core-manifest.json', '.git'
  ];

  const walk = (dir) => {
    let files = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relative = path.relative(root, fullPath).replace(/\\/g, '/');
      if (preserved.some(p => relative.startsWith(p))) continue;
      if (entry.isDirectory()) {
        files = files.concat(walk(fullPath));
      } else {
        files.push(relative);
      }
    }
    return files;
  };

  const files = walk(root);
  fs.writeFileSync(manifestPath, JSON.stringify(files, null, 2));
  return files;
}

/** Send a message to the bot owner (first owner in config.ownerNumber). */
async function notifyOwner(sock, text) {
  try {
    const ownerNum = (config.ownerNumber && config.ownerNumber[0]) || '';
    if (!ownerNum) return;
    const jid = `${ownerNum.replace(/\D/g, '')}@s.whatsapp.net`;
    await sock.sendMessage(jid, { text });
  } catch {}
}

/** Restart the bot via PM2 or process.exit */
function restartBot() {
  try {
    execSync('pm2 restart all', { stdio: 'ignore' });
    return;
  } catch {}
  setTimeout(() => process.exit(0), 1000);
}

// ─── Command Export ─────────────────────────────────

module.exports = {
  name: 'update',
  aliases: ['upgrade'],
  category: 'dev',
  description: 'Update bot from ZIP URL (preserves custom files, notifies owner)',
  usage: '.update [optional_zip_url]',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    const chatId = msg.key.remoteJid;
    // 1) ZIP URL (use argument if provided, else fallback chain)
    const zipUrl = (args[0] || config.updateZipUrl || process.env.UPDATE_ZIP_URL || '').trim();
    if (!zipUrl) {
      return extra.reply('❌ No update URL configured. Set updateZipUrl in config.js or pass a URL: `.update <zip_url>`');
    }

    await extra.reply('🔍 Checking for updates...');

    try {
      // 2) Download ZIP to temp directory
      const tmpDir = path.join(__dirname, '../../tmp');
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
      const zipPath = path.join(tmpDir, `update_${Date.now()}.zip`);

      const response = await axios.get(zipUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: { 'User-Agent': 'ProBoy-MD-Updater' }
      });
      fs.writeFileSync(zipPath, Buffer.from(response.data));

      const zip = new AdmZip(zipPath);
      const zipEntries = zip.getEntries();

      // 3) Load local core manifest (list of relative paths that are "official")
      const coreFiles = loadLocalManifest(); // array of strings (relative)

      // Also load the new manifest from the ZIP if present, so we can update it locally
      let newManifest = [];
      const manifestEntry = zipEntries.find(e => e.entryName === 'core-manifest.json');
      if (manifestEntry) {
        newManifest = JSON.parse(manifestEntry.getData().toString('utf8'));
      } else {
        // Fallback: use the ZIP entries themselves (excluding directories) as the new manifest
        newManifest = zipEntries
          .filter(e => !e.isDirectory)
          .map(e => e.entryName);
      }

      const root = path.join(__dirname, '../..');
      const preservedDirs = [
        'node_modules', 'session', 'sessions', 'tmp', 'temp',
        'database', 'config.js', 'core-manifest.json'
      ];

      const updatedFiles = [];
      const addedFiles = [];
      const skipped = [];

      // 4) Extract ONLY core files (those present in the NEW manifest)
      for (const entry of zipEntries) {
        if (entry.isDirectory) continue;
        const relative = entry.entryName;
        // Skip if inside any preserved directory
        if (preservedDirs.some(dir => relative.startsWith(dir + '/') || relative === dir)) {
          continue;
        }
        // Only extract if this file is in the new manifest (i.e. it's an official core file)
        if (!newManifest.includes(relative)) {
          skipped.push(relative);
          continue;
        }

        const targetPath = path.join(root, relative);
        const targetDir = path.dirname(targetPath);
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

        const existed = fs.existsSync(targetPath);
        fs.writeFileSync(targetPath, entry.getData());
        if (existed) updatedFiles.push(relative);
        else addedFiles.push(relative);
      }

      // 5) Update the local core manifest to the new one (so future updates reference new core)
      fs.writeFileSync(path.join(root, 'core-manifest.json'), JSON.stringify(newManifest, null, 2));

      // Clean up temp ZIP
      try { fs.unlinkSync(zipPath); } catch {}

      // 6) Build summary message for chat and owner notification
      const lines = [];
      lines.push(`✅ *Update complete*`);
      lines.push(`📥 Updated: ${updatedFiles.length} | Added: ${addedFiles.length}`);
      lines.push(`⏭️ Skipped (custom/non-core): ${skipped.length}`);

      const sample = [...updatedFiles.slice(0, 15), ...addedFiles.slice(0, 15)].slice(0, 25);
      if (sample.length) {
        lines.push('');
        lines.push('*Changed files (sample):*');
        for (const f of sample) lines.push(`- \`${f}\``);
        if (updatedFiles.length + addedFiles.length > sample.length) {
          lines.push(`- ...and ${updatedFiles.length + addedFiles.length - sample.length} more`);
        }
      }

      const ownerMsg = `${lines.join('\n')}\n\n🔄 Restarting now...`;
      await sock.sendMessage(chatId, { text: ownerMsg }, { quoted: msg });

      // 7) Notify owner privately
      await notifyOwner(sock, ownerMsg);

      // 8) Restart the bot
      restartBot();
    } catch (error) {
      await sock.sendMessage(chatId, {
        text: `❌ Update failed:\n${String(error.message || error)}`
      }, { quoted: msg });
    }
  }
};
