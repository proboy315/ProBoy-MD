/**
 * YouTube Downloader Plugin for ProBoy‑MD
 * Supports both URL and search query using yt-search.
 * Fixed: Now responds properly with error messages.
 */

const { youtube } = require('ab-downloader');
const ytSearch = require('yt-search');
const config = require('../../config');

// Helper: Check if text is a YouTube URL
function isYoutubeUrl(text) {
    const patterns = [
        /youtube\.com\/watch\?v=/,
        /youtu\.be\//,
        /youtube\.com\/shorts\//,
        /youtube\.com\/embed\//,
        /m\.youtube\.com\/watch\?v=/
    ];
    return patterns.some(pattern => pattern.test(text));
}

// Helper: Search YouTube and get top video's URL + info
async function searchYoutube(query) {
    try {
        const searchResult = await ytSearch(query);
        if (!searchResult || !searchResult.videos || searchResult.videos.length === 0) {
            throw new Error('No videos found for your query.');
        }

        const topVideo = searchResult.videos[0];
        return {
            title: topVideo.title,
            videoUrl: topVideo.url,
            author: topVideo.author.name
        };
    } catch (error) {
        console.error('yt-search error:', error);
        throw new Error('Failed to search YouTube: ' + error.message);
    }
}

module.exports = {
    name: 'yt',
    aliases: ['youtube', 'ytdl'],
    category: 'media',
    description: 'Download YouTube videos (supports URL or search query)',
    usage: '.yt <url or search query>',

    async execute(sock, msg, args, extra) {
        const { from, reply, react } = extra;

        try {
            const input = args.join(' ').trim();
            if (!input) {
                return reply(`❌ Please provide a YouTube URL or search query.\nExample: ${this.usage}`);
            }

            await react('⏳');

            let videoUrl;
            let videoTitle;
            let videoAuthor;

            if (isYoutubeUrl(input)) {
                // Direct URL – no search needed
                videoUrl = input;
                videoTitle = null; // We'll get from download response
                videoAuthor = null;
            } else {
                // Search query
                const searchInfo = await searchYoutube(input);
                videoUrl = searchInfo.videoUrl;
                videoTitle = searchInfo.title;
                videoAuthor = searchInfo.author;
            }

            // Download using ab-downloader
            const response = await youtube(videoUrl);
            if (!response || typeof response !== 'object' || !response.mp4) {
                throw new Error('Invalid response from YouTube downloader');
            }

            // Use title from search if available, else from response
            const finalTitle = videoTitle || response.title || 'YouTube Video';
            const finalAuthor = videoAuthor || response.author || 'Unknown';

            // Build caption
            let caption = `🎬 *${finalTitle}*`;
            if (finalAuthor !== 'Unknown') {
                caption += `\n👤 *Author:* ${finalAuthor}`;
            }
            caption += `\n\n${config.botName}`;

            // Send video
            await sock.sendMessage(from, {
                video: { url: response.mp4 },
                mimetype: 'video/mp4',
                caption: caption,
                contextInfo: response.thumbnail ? {
                    externalAdReply: {
                        title: finalTitle,
                        body: 'YouTube Video',
                        thumbnailUrl: response.thumbnail,
                        mediaType: 1,
                        renderLargerThumbnail: true
                    }
                } : undefined
            }, { quoted: msg });

            await react('✅');
        } catch (error) {
            console.error('YouTube plugin error:', error);
            await reply(`❌ ${error.message}`);
            await react('❌');
        }
    }
};
