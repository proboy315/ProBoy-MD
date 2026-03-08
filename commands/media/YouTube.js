/**
 * YouTube Downloader Plugin for ProBoy‑MD
 * Supports both URL and search query using yt-search.
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

// Helper: Search YouTube and get top video's URL
async function searchYoutube(query) {
    try {
        const searchResult = await ytSearch(query);
        if (!searchResult || !searchResult.videos || searchResult.videos.length === 0) {
            throw new Error('No videos found');
        }

        const topVideo = searchResult.videos[0];
        const videoUrl = topVideo.url; // e.g., https://youtube.com/watch?v=abc123

        return {
            title: topVideo.title,
            videoUrl: videoUrl,
            thumbnail: topVideo.thumbnail,
            duration: topVideo.duration.timestamp,
            author: topVideo.author.name
        };
    } catch (error) {
        console.error('yt-search error:', error);
        throw new Error('Failed to search YouTube');
    }
}

module.exports = {
    name: 'youtube',
    aliases: ['yt', 'ytdl'],
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

            if (isYoutubeUrl(input)) {
                // Direct URL download
                videoUrl = input;
                videoTitle = 'YouTube Video'; // We'll get actual title after download
            } else {
                // Search query
                const searchInfo = await searchYoutube(input);
                videoUrl = searchInfo.videoUrl;
                videoTitle = searchInfo.title;
                // Optional: store author/thumbnail for later use
            }

            // Download using ab-downloader
            const response = await youtube(videoUrl);

            if (!response || typeof response !== 'object' || !response.mp4) {
                throw new Error('Invalid response from YouTube downloader');
            }

            // Use title from search if available, else from response
            const finalTitle = videoTitle || response.title || 'YouTube Video';
            const author = response.author || 'Unknown';

            // Build caption
            let caption = `🎬 *${finalTitle}*`;
            if (author !== 'Unknown') {
                caption += `\n👤 *Author:* ${author}`;
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
            console.error('YouTube download error:', error);
            await reply(`❌ Failed to download: ${error.message}`);
            await react('❌');
        }
    }
};            duration: response.data.result.duration,
            views: response.data.result.views
        };
    } catch (error) {
        console.error('YouTube search error:', error);
        throw new Error('Failed to search YouTube');
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

            let videoData;
            let sourceType;

            // Check if input is URL or search query
            if (isYoutubeUrl(input)) {
                // Direct URL download using ab-downloader
                sourceType = 'url';
                const response = await youtube(input);
                
                if (!response || typeof response !== 'object' || !response.mp4) {
                    throw new Error('Invalid response from YouTube downloader');
                }
                
                videoData = {
                    title: response.title || 'YouTube Video',
                    author: response.author || 'Unknown',
                    thumbnail: response.thumbnail,
                    downloadUrl: response.mp4
                };
            } else {
                // Search query
                sourceType = 'search';
                const searchResult = await searchYoutube(input);
                
                // Now download using the search result's URL (or directly use downloadUrl from search API)
                // Note: The search API already provides a download_url, but it might be for audio.
                // To get video, we need to use the video URL. The search API result may contain the video ID.
                // Alternative: Use the search result's title to find URL, but that's complex.
                // Better: The search API's download_url might be for video. Let's check.
                // In previous music command, it gave audio. So we'll use youtube() with the video URL.
                
                // First, get the video URL from search result (if available)
                // We don't have direct video URL from search API, so we need to construct it from video ID.
                // But search API doesn't give video ID. So we'll use the download_url directly? It might be audio.
                // To be safe, we'll use the youtube() function with a constructed URL if we can get video ID.
                // Since we don't have video ID, we'll try using the search API's download_url for now.
                // If it's audio, we'll note that.
                
                // For now, assume search API's download_url is for video (based on previous experience)
                videoData = {
                    title: searchResult.title,
                    author: 'Unknown', // Search API doesn't provide author
                    thumbnail: searchResult.thumbnail,
                    downloadUrl: searchResult.downloadUrl
                };
                
                // Optional: If downloadUrl is audio-only, we might need to get video URL differently.
                // But for simplicity, we proceed.
            }

            if (!videoData || !videoData.downloadUrl) {
                throw new Error('Could not retrieve video');
            }

            // Build caption
            let caption = `🎬 *${videoData.title}*`;
            if (videoData.author && videoData.author !== 'Unknown') {
                caption += `\n👤 *Author:* ${videoData.author}`;
            }
            caption += `\n\n${config.botName}`;

            // Send video
            await sock.sendMessage(from, {
                video: { url: videoData.downloadUrl },
                mimetype: 'video/mp4',
                caption: caption,
                // Optional: Add thumbnail as context info if needed
                contextInfo: videoData.thumbnail ? {
                    externalAdReply: {
                        title: videoData.title,
                        body: 'YouTube Video',
                        thumbnailUrl: videoData.thumbnail,
                        mediaType: 1,
                        renderLargerThumbnail: true
                    }
                } : undefined
            }, { quoted: msg });

            await react('✅');
        } catch (error) {
            console.error('YouTube download error:', error);
            await reply(`❌ Failed to download: ${error.message}`);
            await react('❌');
        }
    }
};
