/**
 * Pinterest Downloader Plugin for ProBoy‑MD
 * Uses ab-downloader's pinterest() function.
 * Supports both single image URL and search query.
 * Search results are sent directly as multiple images.
 */

const { pinterest } = require('ab-downloader');
const config = require('../../config');

// Helper to check if input is a Pinterest URL
function isPinterestUrl(input) {
    const patterns = [
        /pin\.it\//i,
        /pinterest\.com\/pin\//i,
        /pinterest\.com\/[^/]+\/[^/]+\/?/i
    ];
    return patterns.some(p => p.test(input));
}

// Helper to extract best quality image URL from a pin object
function getBestImageUrl(pin) {
    // Try direct image property
    if (pin.image) return pin.image;

    // Try images.org (original)
    if (pin.images?.org?.url) return pin.images.org.url;

    // Try originals
    if (pin.images?.originals?.url) return pin.images.originals.url;

    // Try largest available size
    if (pin.images) {
        const sizes = ['736x', '564x', '474x', '236x', '170x', '136x'];
        for (const size of sizes) {
            if (pin.images[size]?.url) return pin.images[size].url;
        }
    }

    return null;
}

module.exports = {
    name: 'pinterest',
    aliases: ['pin', 'pindl'],
    category: 'media',
    description: 'Download images from Pinterest (URL or search)',
    usage: '.pinterest <url or search query>',

    async execute(sock, msg, args, extra) {
        const { from, reply, react } = extra;
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
                const imageUrl = getBestImageUrl(data);
                if (!imageUrl) throw new Error('No image URL found');

                const username = data.user?.username || data.user?.full_name || 'Unknown';
                const caption = `📌 *Pinterest Image*\n👤 *User:* ${username}\n\n${config.botName}`;

                await sock.sendMessage(from, {
                    image: { url: imageUrl },
                    caption: caption
                }, { quoted: msg });

                await react('✅');
            } else {
                // --- Search query – send all images directly ---
                const results = response.result.result; // array of pin objects
                if (!Array.isArray(results) || results.length === 0) {
                    throw new Error('No results found');
                }

                // Limit to first 10 images (to avoid spam)
                const limited = results.slice(0, 10);
                let sentCount = 0;

                for (const pin of limited) {
                    const imageUrl = getBestImageUrl(pin);
                    if (!imageUrl) continue; // skip if no image

                    const username = pin.user?.username || pin.user?.full_name || 'Unknown';
                    const caption = `📌 *Pinterest Result ${sentCount + 1}*\n👤 *User:* ${username}\n\n${config.botName}`;

                    await sock.sendMessage(from, {
                        image: { url: imageUrl },
                        caption: caption
                    }, { quoted: msg });

                    sentCount++;
                    // Small delay to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 500));
                }

                // Send summary
                if (sentCount === 0) {
                    await reply('❌ No downloadable images found in results.');
                } else {
                    await reply(`✅ Sent ${sentCount} images from Pinterest search.`);
                }
                await react('✅');
            }
        } catch (error) {
            console.error('Pinterest error:', error);
            await reply(`❌ ${error.message}`);
            await react('❌');
        }
    }
};
