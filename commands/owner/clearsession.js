const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'cleansession',
  aliases: ['cleansess', 'sessionclean'],
  category: 'owner',
  description: 'Delete all session files except creds.json (keep login)',
  usage: '.cleansession',
  ownerOnly: true, // only bot owner can run this

  async execute(sock, msg, args, extra) {
    try {
      // Get session folder from config
      const sessionFolder = extra.config.sessionName || 'session';
      const folderPath = path.join(process.cwd(), sessionFolder);

      // Check if folder exists
      if (!fs.existsSync(folderPath)) {
        return extra.reply('❌ Session folder not found.');
      }

      // Read directory contents
      const files = fs.readdirSync(folderPath);
      const filesToDelete = files.filter(file => file !== 'creds.json');

      if (filesToDelete.length === 0) {
        return extra.reply('✅ No extra files to delete. Only creds.json present.');
      }

      await extra.react('⏳');

      // Delete each file
      let deletedCount = 0;
      for (const file of filesToDelete) {
        const filePath = path.join(folderPath, file);
        try {
          // Only delete files (skip directories just in case)
          const stat = fs.statSync(filePath);
          if (stat.isFile()) {
            fs.unlinkSync(filePath);
            deletedCount++;
          }
        } catch (err) {
          console.error(`Failed to delete ${file}:`, err);
        }
      }

      await extra.reply(`✅ Cleaned session folder.\nDeleted ${deletedCount} file(s).\nKept \`creds.json\`.`);
      await extra.react('✅');
    } catch (error) {
      console.error('Error in cleansession:', error);
      await extra.reply(`❌ Error: ${error.message}`);
      await extra.react('❌');
    }
  }
};
