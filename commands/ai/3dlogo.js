const axios = require('axios');
const config = require('../../config');

const API_BASE = 'https://ammar-3d-logo-generate-api.vercel.app/generate-logo';

module.exports = {
    name: '3dlogo',
    aliases: ['logo3d', 'genlogo', 'logogen'],
    category: 'ai',
    description: 'Generate 3D logo images from a text prompt',
    usage: '.3dlogo <prompt>',

    async execute(sock, msg, args, extra) {
        const prompt = args.join(' ').trim();
        if (!prompt) {
            return extra.reply(`❌ Please provide a prompt!\n\nExample: .3dlogo neon gaming logo`);
        }

        await extra.react('⏳');
        await extra.reply(`🎨 Generating 3D logo for: *${prompt}*`);

        try {
            const response = await axios.get(API_BASE, {
                params: { prompt },
                timeout: 90000 // 90 seconds – generation can be slow
            });

            const data = response.data;
            if (!data.success) {
                return extra.reply(`❌ API Error: ${data.error || 'Unknown error'}`);
            }

            const images = data.data?.images;
            if (!images || !Array.isArray(images) || images.length === 0) {
                return extra.reply('❌ No images generated.');
            }

            // Send all generated images
            const botName = config.botName || 'ProBoy-MD';
            for (let i = 0; i < images.length; i++) {
                const imageUrl = images[i];
                const caption = i === 0 
                    ? `✨ *3D Logo Generated!*\n📝 Prompt: ${prompt}\n\n> *Powered by ${botName}*`
                    : `📸 Variation ${i + 1}`;
                
                await sock.sendMessage(extra.from, {
                    image: { url: imageUrl },
                    caption
                }, { quoted: msg });
                
                // Small delay to avoid rate limits
                if (i < images.length - 1) await new Promise(r => setTimeout(r, 500));
            }

            await extra.react('✅');

        } catch (error) {
            console.error('3dlogo error:', error.message);
            let errorMsg = '❌ Failed to generate logo.';
            if (error.code === 'ECONNABORTED') errorMsg = '❌ Generation timed out. Try a shorter prompt.';
            else if (error.response?.data?.error) errorMsg = `❌ ${error.response.data.error}`;
            
            await extra.reply(errorMsg);
            await extra.react('❌');
        }
    }
};
