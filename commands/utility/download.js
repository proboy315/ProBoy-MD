const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const config = require('../../config');

module.exports = {
  name: 'download',
  aliases: ['dl'],
  category: 'utility',
  description: 'Download file from direct URL',
  usage: `${config.prefix}download <url>`,

  async execute(sock, msg, args, extra) {
    try {
      const url = args[0];

      if (!url) {
        return extra.reply(`Usage: ${this.usage}`);
      }

      if (!/^https?:\/\//i.test(url)) {
        return extra.reply('❌ Invalid URL');
      }

      await extra.react('⏳');
      await extra.reply('📥 Downloading large file, please wait...');

      // headers
      const head = await axios.head(url).catch(() => null);

      let fileName =
        head?.headers?.['content-disposition']
          ?.match(/filename="?(.+)"?/)?.[1];

      if (!fileName) {
        fileName = decodeURIComponent(
          url.split('/').pop().split('?')[0]
        );
      }

      if (!fileName) {
        fileName = `file_${Date.now()}`;
      }

      const mimetype =
        head?.headers?.['content-type'] ||
        'application/octet-stream';

      const tempPath = path.join(os.tmpdir(), fileName);

      // STREAM DOWNLOAD
      const response = await axios({
        method: 'GET',
        url,
        responseType: 'stream',
        timeout: 0,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        headers: {
          'User-Agent': 'Mozilla/5.0'
        }
      });

      const writer = fs.createWriteStream(tempPath);

      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      const stats = fs.statSync(tempPath);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

      await extra.reply(
        `📤 Uploading file...\n📦 Size: ${sizeMB} MB`
      );

      // IMPORTANT FIX:
      // send STREAM instead of Buffer
      await sock.sendMessage(
        extra.from,
        {
          document: { url: tempPath },
          mimetype,
          fileName
        },
        { quoted: msg }
      );

      // cleanup
      fs.unlink(tempPath, () => {});

      await extra.react('✅');

      await extra.reply(
        `✅ Download completed\n\n📄 ${fileName}\n📦 ${sizeMB} MB`
      );

    } catch (err) {
      console.error(err);

      await extra.react('❌');
      await extra.reply(
        `❌ Download failed\n\n${err.message}`
      );
    }
  }
};