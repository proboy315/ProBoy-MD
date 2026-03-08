/**
 * Facebook Video Downloader Plugin for ProBoy‑MD
 * Uses ab-downloader's fbdown function.
 * Direct download – no quality selection buttons.
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

            // Check if response is valid array and has first object
            if (!Array.isArray(response) || response.length === 0 || !response[0]) {
                throw new Error('Invalid response from downloader');
            }

            const data = response[0]; // First object

            // Get video URL – prefer Normal_video, fallback to HD
            let videoUrl = data.Normal_video || data.HD;
            if (!videoUrl) {
                throw new Error('No downloadable video URL found');
            }

            // Optional: Log karo agar HD use karna paray (debugging ke liye)
            // if (!data.Normal_video && data.HD) {
            //     console.log('Using HD as fallback for Facebook video');
            // }

            // Simple caption – sirf aap ka bot name (ya kuch bhi chahein)
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
