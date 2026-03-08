/**
 * TikTok Downloader Plugin for ProBoy‑MD
 * Based on actual ab-downloader response structure
 */

const { ttdl } = require('ab-downloader');
const config = require('../../config');

// Helper to extract TikTok username from URL
function extractUsername(url) {
    const match = url.match(/tiktok\.com\/@([A-Za-z0-9_.]+)/i);
    return match ? match[1] : null;
}

module.exports = {
    name: 'tiktok',
    aliases: ['tt', 'ttdl'],
    category: 'media',
    description: 'Download TikTok videos (no watermark)',
    usage: '.tiktok <url>',

    async execute(sock, msg, args, extra) {
        const { from, reply, react } = extra;

        try {
            const url = args.join(' ').trim();
            if (!url) {
                return reply(`❌ Please provide a TikTok video URL.\nExample: ${this.usage}`);
            }

            await react('⏳');

            // Fetch download data
            const response = await ttdl(url);

            // Check if response is valid
            if (!response || !response.video || !Array.isArray(response.video) || response.video.length === 0) {
                throw new Error('Invalid response from downloader - no video URL found');
            }

            // Extract video URL (first element of video array)
            const videoUrl = response.video[0];

            // Extract title
            const title = response.title || 'TikTok Video';

            // Build caption
            let caption = `🎵 *${title}*`;

            // Extract username from URL and add to caption
            const username = extractUsername(url);
            if (username) {
                caption += `\n👤 *Username:* @${username}`;
            }

            // Add bot signature
            caption += `\n\n${config.botName}`;

            // Send the video
            await sock.sendMessage(from, {
                video: { url: videoUrl },
                mimetype: 'video/mp4',
                caption: caption.trim()
            }, { quoted: msg });

            await react('✅');
        } catch (error) {
            console.error('TikTok download error:', error);
            await reply(`❌ Failed to download: ${error.message}`);
            await react('❌');
        }
    }
};
