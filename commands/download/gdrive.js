/**
 * Google Drive Downloader Plugin for ProBoy‑MD
 * Uses ab-downloader's gdrive() function.
 * Sends file as a document with filename and size in caption.
 */

const { gdrive } = require('ab-downloader');
const config = require('../../config');

module.exports = {
    name: 'gdrive',
    aliases: ['gd', 'googledrive'],
    category: 'download',
    description: 'Download public files from Google Drive',
    usage: '.gdrive <url>',

    async execute(sock, msg, args, extra) {
        const { from, reply, react } = extra;

        try {
            const url = args.join(' ').trim();
            if (!url) {
                return reply(`❌ Please provide a Google Drive URL.\nExample: ${this.usage}`);
            }

            await react('⏳');

            // Fetch file data
            const response = await gdrive(url);

            // Validate response structure based on screenshots
            if (!response || !response.result || !response.result.downloadUrl) {
                throw new Error('Invalid response from Google Drive downloader');
            }

            const file = response.result;

            // Build caption
            const caption = `📁 *Google Drive File*\n\n` +
                `📄 *Filename:* ${file.filename || 'Unknown'}\n` +
                `📦 *Size:* ${file.filesize || 'Unknown'}\n\n` +
                `${config.botName}`;

            // Send as document
            await sock.sendMessage(from, {
                document: { url: file.downloadUrl },
                fileName: file.filename || 'GoogleDrive_File',
                mimetype: 'application/octet-stream', // Generic, actual type may vary
                caption: caption
            }, { quoted: msg });

            await react('✅');
        } catch (error) {
            console.error('Google Drive download error:', error);
            await reply(`❌ Failed to download: ${error.message}`);
            await react('❌');
        }
    }
};
