/**
 * CapCut Template Downloader Plugin for ProBoy‑MD
 * Uses ab-downloader's capcut() function.
 * Downloads the original video from a CapCut template.
 */

const { capcut } = require('ab-downloader');
const config = require('../../config');

module.exports = {
    name: 'capcut',
    aliases: ['cc', 'capcuttemplate'],
    category: 'media',
    description: 'Download original video from CapCut template',
    usage: '.capcut <url>',

    async execute(sock, msg, args, extra) {
        const { from, reply, react } = extra;

        try {
            const url = args.join(' ').trim();
            if (!url) {
                return reply(`❌ Please provide a CapCut template URL.\nExample: ${this.usage}`);
            }

            await react('⏳');

            // Fetch template data
            const response = await capcut(url);

            // Validate response structure based on screenshots
            if (!response || !response.status || response.code !== 200 || !response.originalVideoUrl) {
                throw new Error('Invalid response from CapCut downloader');
            }

            const videoUrl = response.originalVideoUrl;
            const title = response.title || 'CapCut Template';
            const coverUrl = response.coverUrl || null;

            // Build caption
            const caption = `🎬 *CapCut Template*\n\n` +
                `📌 *Title:* ${title}\n\n` +
                `${config.botName}`;

            // Send video with optional thumbnail in context
            const messageOptions = {
                video: { url: videoUrl },
                mimetype: 'video/mp4',
                caption: caption
            };

            // Add thumbnail as context info if available
            if (coverUrl) {
                messageOptions.contextInfo = {
                    externalAdReply: {
                        title: title,
                        body: 'CapCut Template',
                        thumbnailUrl: coverUrl,
                        mediaType: 1,
                        renderLargerThumbnail: true
                    }
                };
            }

            await sock.sendMessage(from, messageOptions, { quoted: msg });
            await react('✅');

        } catch (error) {
            console.error('CapCut download error:', error);
            await reply(`❌ Failed to download: ${error.message}`);
            await react('❌');
        }
    }
};
