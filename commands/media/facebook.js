/**
 * Facebook Video Downloader Plugin for ProBoy‑MD
 * Uses ab-downloader's fbdown function.
 * Supports optional HD quality: .fb <url> hd
 */

const { fbdown } = require('ab-downloader');
const config = require('../../config');

module.exports = {
    name: 'facebook',
    aliases: ['fb', 'fbdl'],
    category: 'media',
    description: 'Download Facebook videos',
    usage: '.facebook <url> [hd]',

    async execute(sock, msg, args, extra) {
        const { from, reply, react } = extra;

        try {
            // First argument is the URL
            const url = args[0];
            if (!url) {
                return reply(`❌ Please provide a Facebook video URL.\nExample: ${this.usage}`);
            }

            // Check if user wants HD (any case, any position after URL)
            const remainingArgs = args.slice(1).join(' ').trim().toLowerCase();
            const wantHD = remainingArgs === 'hd';

            await react('⏳');

            // Fetch download data
            const response = await fbdown(url);

            // Check if response is valid
            if (!response || typeof response !== 'object') {
                throw new Error('Invalid response from downloader');
            }

            const data = response;

            // Determine video URL based on user's preference
            let videoUrl;
            if (wantHD) {
                videoUrl = data.HD || data.hd; // check both cases just in case
                if (!videoUrl) {
                    // If HD requested but not available, fallback to normal
                    videoUrl = data.normal_video || data.Normal_video;
                    if (videoUrl) {
                        await reply('ℹ️ HD version not available, sending normal quality instead.');
                    }
                }
            } else {
                videoUrl = data.normal_video || data.Normal_video || data.HD || data.hd;
            }

            if (!videoUrl) {
                throw new Error('No downloadable video URL found');
            }

            // Simple caption
            const qualityText = wantHD ? ' (HD)' : '';
            const caption = `📘 *Facebook Video${qualityText}*\n\n${config.botName}`;

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
