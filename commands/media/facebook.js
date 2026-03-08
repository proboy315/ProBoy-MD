/**
 * Facebook Video Downloader Plugin for ProBoy‑MD
 * Uses ab-downloader's fbdown function.
 * Corrected key name: 'normal_video' (small 'n')
 */

const { fbdown } = require('ab-downloader');
const config = require('../../config');

module.exports = {
    name: 'facebook',
    aliases: ['fb', 'fbdl'],
    category: 'media',
    description: 'Download Facebook videos',
    usage: '.facebook <url>',

    async execute(sock, msg, args, extra) {
        const { from, reply, react } = extra;

        try {
            const url = args.join(' ').trim();
            if (!url) {
                return reply(`❌ Please provide a Facebook video URL.\nExample: ${this.usage}`);
            }

            await react('⏳');

            // Fetch download data
            const response = await fbdown(url);

            // Check if response is valid
            if (!response || typeof response !== 'object') {
                throw new Error('Invalid response from downloader');
            }

            // Response is an object, not array (as per screenshot)
            const data = response;

            // Get video URL – correct key is 'normal_video' (small 'n')
            let videoUrl = data.normal_video || data.HD || data.Normal_video; // fallback HD and capital N just in case
            if (!videoUrl) {
                throw new Error('No downloadable video URL found');
            }

            // Simple caption
            const caption = `📘 *Facebook Video*\n\n${config.botName}`;

            // Send the video
            await sock.sendMessage(from, {
                video: { url: videoUrl },
                mimetype: 'video/mp4',
                caption: caption
            }, { quoted: msg });

            await react('✅');
        } catch (error) {
            console.error('Facebook download error:', error);
            await reply(`❌ Failed to download: ${error.message}`);
            await react('❌');
        }
    }
};
