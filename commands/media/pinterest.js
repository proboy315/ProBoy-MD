/**
 * Pinterest Downloader Plugin for ProBoy‑MD
 * Uses ab-downloader's pinterest() function.
 * Supports both single image URL and search query.
 * For search, shows buttons to select and download.
 */

const { pinterest } = require('ab-downloader');
const { sendInteractiveMessage } = require('gifted-btns');
const config = require('../../config');

// Temporary cache for search results (used by button handler)
const searchCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Clean cache periodically
setInterval(() => {
    const now = Date.now();
    for (const [id, data] of searchCache) {
        if (now - data.timestamp > CACHE_TTL) searchCache.delete(id);
    }
}, 60 * 1000);

// Helper to check if input is a Pinterest URL
function isPinterestUrl(input) {
    const patterns = [
        /pin\.it\//i,
        /pinterest\.com\/pin\//i,
        /pinterest\.com\/[^/]+\/[^/]+\/?/i
    ];
    return patterns.some(p => p.test(input));
}

module.exports = {
    name: 'pinterest',
    aliases: ['pin', 'pindl'],
    category: 'media',
    description: 'Download images from Pinterest (URL or search)',
    usage: '.pinterest <url or search query>',

    async execute(sock, msg, args, extra) {
        const { from, reply, react, sender } = extra;
        const input = args.join(' ').trim();
        if (!input) {
            return reply(`❌ Please provide a Pinterest URL or search query.\nExample: ${this.usage}`);
        }

        await react('⏳');

        try {
            const isUrl = isPinterestUrl(input);
            const response = await pinterest(input);

            if (!response || !response.result) {
                throw new Error('Invalid response from Pinterest');
            }

            if (isUrl) {
                // --- Single image download ---
                const data = response.result;
                // Find the best quality image URL
                let imageUrl = data.image || data.images?.org?.url || data.images?.originals?.url;
                if (!imageUrl && data.images) {
                    // Try to get the largest available
                    const sizes = ['org', '736x', '564x', '474x', '236x'];
                    for (const size of sizes) {
                        if (data.images[size]?.url) {
                            imageUrl = data.images[size].url;
                            break;
                        }
                    }
                }
                if (!imageUrl) throw new Error('No image URL found');

                const username = data.user?.username || data.user?.full_name || 'Unknown';
                const caption = `📌 *Pinterest Image*\n👤 *User:* ${username}\n\n${config.botName}`;

                await sock.sendMessage(from, {
                    image: { url: imageUrl },
                    caption: caption
                }, { quoted: msg });

                await react('✅');
            } else {
                // --- Search query with multiple results ---
                const results = response.result.result; // array of pin objects
                if (!Array.isArray(results) || results.length === 0) {
                    throw new Error('No results found');
                }

                // Limit to first 10 results for buttons
                const limited = results.slice(0, 10);
                const cacheId = `pin_${Date.now()}_${msg.key.id.slice(-4)}`;
                searchCache.set(cacheId, {
                    results: limited,
                    timestamp: Date.now()
                });

                // Build interactive buttons (max 10)
                const buttons = limited.map((pin, index) => ({
                    name: 'quick_reply',
                    buttonParamsJson: JSON.stringify({
                        display_text: `${index + 1}. ${pin.title?.slice(0, 30) || 'Image ' + (index + 1)}`,
                        id: `pin:${cacheId}:${index}`
                    })
                }));

                const resultText = `🔍 *Found ${results.length} results* (showing first ${limited.length}):\n\nSelect an image to download.`;

                await sendInteractiveMessage(sock, from, {
                    text: resultText,
                    footer: config.botName,
                    interactiveButtons: buttons
                }, { quoted: msg });

                await react('✅');
            }
        } catch (error) {
            console.error('Pinterest error:', error);
            await reply(`❌ ${error.message}`);
            await react('❌');
        }
    },

    async handleButtonResponse(sock, msg, extra) {
        const button = msg.message?.buttonsResponseMessage || msg.message?.interactiveResponseMessage;
        if (!button) return;

        const id = button.selectedButtonId || button.id;
        if (!id || !id.startsWith('pin:')) return;

        const [_, cacheId, indexStr] = id.split(':');
        const index = parseInt(indexStr);
        const cached = searchCache.get(cacheId);
        if (!cached) {
            return extra.reply('❌ Search results expired. Please search again.');
        }

        const pin = cached.results[index];
        if (!pin) return;

        try {
            await extra.react('⏳');

            // Get best image URL from pin object
            let imageUrl = pin.image || pin.images?.org?.url || pin.images?.originals?.url;
            if (!imageUrl && pin.images) {
                const sizes = ['org', '736x', '564x', '474x', '236x'];
                for (const size of sizes) {
                    if (pin.images[size]?.url) {
                        imageUrl = pin.images[size].url;
                        break;
                    }
                }
            }
            if (!imageUrl) throw new Error('No image URL');

            const username = pin.user?.username || pin.user?.full_name || 'Unknown';
            const caption = `📌 *Pinterest Image*\n👤 *User:* ${username}\n\n${config.botName}`;

            await sock.sendMessage(extra.from, {
                image: { url: imageUrl },
                caption: caption
            }, { quoted: msg });

            await extra.react('✅');
            searchCache.delete(cacheId); // optional: remove after use
        } catch (error) {
            console.error('Pinterest button error:', error);
            await extra.reply(`❌ Failed to download: ${error.message}`);
            await extra.react('❌');
        }
    }
};
