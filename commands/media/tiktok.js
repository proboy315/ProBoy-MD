/**
 * TikTok Downloader Plugin for ProBoy‑MD
 * Uses ab‑downloader's ttdl function.
 * Extracts username from URL if present and adds to caption.
 * No external credits – only ProBoy‑MD branding.
 */

const { ttdl } = require('ab-downloader');
const config = require('../../config');

// Helper to extract TikTok username from URL
function extractUsername(url) {
    // Match patterns like tiktok.com/@username or tiktok.com/@username/video/...
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
            // Combine arguments to get the URL
            const url = args.join(' ').trim();
            if (!url) {
                return reply(`❌ Please provide a TikTok video URL.\nExample: ${this.usage}`);
            }

            await react('⏳'); // Processing

            // Fetch download data
            const data = await ttdl(url);

            // Check if response is valid
            if (!data || !Array.isArray(data) || data.length === 0) {
                throw new Error('Invalid response from downloader');
            }

            const result = data[0]; // First object in array

            // Extract video URL – handle different possible structures
            let videoUrl = null;
            if (result.video && Array.isArray(result.video) && result.video.length > 0) {
                // If video array contains objects with url property
                if (typeof result.video[0] === 'object' && result.video[0].url) {
                    videoUrl = result.video[0].url;
                }
                // If it's an array of strings
                else if (typeof result.video[0] === 'string') {
                    videoUrl = result.video[0];
                }
            }

            if (!videoUrl) {
                throw new Error('No downloadable video found');
            }

            // Build caption
            let caption = `🎵 *${result.title || 'TikTok Video'}*`;

            // Extract username from URL and add to caption
            const username = extractUsername(url);
            if (username) {
                caption += `\n👤 *Username:* @${username}`;
            }

            // Add bot signature (optional – remove if you don't want)
            caption += `\n\n${config.botName}`;

            // Send the video
            await sock.sendMessage(from, {
                video: { url: videoUrl },
                mimetype: 'video/mp4',
                caption: caption.trim()
            }, { quoted: msg });

            await react('✅'); // Success
        } catch (error) {
            console.error('TikTok download error:', error);
            await reply(`❌ Failed to download: ${error.message}`);
            await react('❌');
        }
    }
};
