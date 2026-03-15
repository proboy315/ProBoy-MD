/**
 * Update Command - Fetch latest code via ZIP (Owner Only)
 * Preserves runtime/state dirs: node_modules, session, tmp, temp, database, config.js
 */

const config = require('../../config');
const { updateViaZip } = require('../../utils/updater');

module.exports = {
  name: 'update',
  aliases: ['upgrade'],
  category: 'owner',
  description: 'Update bot from configured ZIP URL (Owner Only)',
  usage: '.update [optional_zip_url]',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    const chatId = msg.key.remoteJid;
    const zipUrl = (args[0] || config.updateZipUrl || process.env.UPDATE_ZIP_URL || '').trim();

    if (!zipUrl) {
      return extra.reply('❌ No update URL configured. Set updateZipUrl in config.js or pass a URL: `.update <zip_url>`');
    }

    try {
      await extra.reply('🔄 Updating the bot, please wait…');

      const out = await updateViaZip(zipUrl);

      const lines = [];
      lines.push(`✅ Update complete.`);
      lines.push(`Updated: ${out.updated.length} | Added: ${out.added.length} | Skipped: ${out.skipped.length}`);

      const list = [...out.updated.slice(0, 15), ...out.added.slice(0, 15)].slice(0, 25);
      if (list.length) {
        lines.push('');
        lines.push('*Changed files (sample):*');
        for (const f of list) lines.push(`- ${f}`);
        if (out.updated.length + out.added.length > list.length) {
          lines.push(`- ...and ${out.updated.length + out.added.length - list.length} more`);
        }
      }

      await sock.sendMessage(chatId, { text: `${lines.join('\n')}\n\nRestarting…` }, { quoted: msg });

      // Attempt restart via pm2 if available, else exit to allow panel auto-restart
      try {
        await require('child_process').execSync('pm2 restart all', { stdio: 'ignore' });
        return;
      } catch {}

      setTimeout(() => process.exit(0), 500);
    } catch (error) {
      await sock.sendMessage(chatId, { text: `❌ Update failed:\n${String(error.message || error)}` }, { quoted: msg });
    }
  }
};
