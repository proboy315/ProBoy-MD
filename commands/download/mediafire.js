/**
 * MediaFire Downloader Plugin for ProBoy‑MD
 * Uses ab-downloader's mediafire() function.
 * Sends file as a document with full details in caption.
 */

const { mediafire } = require('ab-downloader');
const config = require('../../config');

module.exports = {
    name: 'mediafire',
    aliases: ['mf', 'mfdl'],
    category: 'download',
    description: 'Download files from MediaFire',
    usage: '.mediafire <url>',

    async execute(sock, msg, args, extra) {
        const { from, reply, react } = extra;

        try {
            const url = args.join(' ').trim();
            if (!url) {
                return reply(`❌ Please provide a MediaFire URL.\nExample: ${this.usage}`);
            }

            await react('⏳');

            // Fetch file data
            const response = await mediafire(url);

            // Validate response structure
            if (!response || !response.result || !response.result.url) {
                throw new Error('Invalid response from MediaFire downloader');
            }

            const file = response.result;

            // Build detailed caption
            const caption = `📁 *MediaFire File*\n\n` +
                `📄 *Filename:* ${file.filename || 'Unknown'}\n` +
                `📦 *Size:* ${file.filesize || file.filesizeH || 'Unknown'}\n` +
                `📅 *Uploaded:* ${file.upload_date ? new Date(file.upload_date).toLocaleString() : 'Unknown'}\n` +
                `👤 *Owner:* ${file.owner || 'Unknown'}\n` +
                `🔤 *Extension:* ${file.ext || 'Unknown'}\n` +
                `📋 *Type:* ${file.type || 'Unknown'}\n\n` +
                `${config.botName}`;

            // Send as document
            await sock.sendMessage(from, {
                document: { url: file.url },
                fileName: file.filename || 'MediaFire_File',
                mimetype: file.mimetype || 'application/octet-stream',
                caption: caption
            }, { quoted: msg });

            await react('✅');
        } catch (error) {
            console.error('MediaFire download error:', error);
            await reply(`❌ Failed to download: ${error.message}`);
            await react('❌');
        }
    }
};
