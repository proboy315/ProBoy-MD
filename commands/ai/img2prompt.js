const axios = require('axios');
const FormData = require('form-data');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { sendButtons } = require('../../utils/button');

const IMGBB_API_KEY = '8db492efc937a635b90680a9a860dc85';
const IMGBB_UPLOAD_URL = 'https://api.imgbb.com/1/upload';
const IMG2PROMPT_API = 'https://ammar-image2-prompt-api.vercel.app/image2prompt';

module.exports = {
    name: 'img2prompt',
    aliases: ['i2p', 'toprompt'],
    category: 'ai',
    description: 'Convert image to AI prompt',
    usage: '.img2prompt (reply/send image)',

    async execute(sock, msg, args, extra) {
        await extra.react('⏳');

        try {
            const imageBuffer = await getImageBuffer(sock, msg);
            if (!imageBuffer) {
                await extra.reply('❌ Please reply to an image or send with caption');
                return await extra.react('❌');
            }

            await extra.reply('📤 Uploading...');
            const imageUrl = await uploadToImgBB(imageBuffer);
            if (!imageUrl) {
                await extra.reply('❌ Upload failed');
                return await extra.react('❌');
            }

            await extra.reply('🤖 Generating prompt...');
            const prompt = await getPromptFromImage(imageUrl);
            if (!prompt) {
                await extra.reply('❌ Prompt generation failed');
                return await extra.react('❌');
            }

            // Simple result with copy button
            const resultText = `🖼️ *Image:* ${imageUrl}\n\n📝 *Prompt:*\n${prompt}`;

            await sendButtons(sock, extra.from, {
                text: resultText,
                footer: 'ProBoy-MD',
                buttons: [
                    { type: 'copy', displayText: '📋 Copy Prompt', copyCode: prompt }
                ],
                quoted: msg
            });

            await extra.react('✅');

        } catch (error) {
            console.error('img2prompt error:', error);
            await extra.reply(`❌ ${error.message}`);
            await extra.react('❌');
        }
    }
};

async function getImageBuffer(sock, msg) {
    try {
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (quoted?.imageMessage) {
            return await downloadMediaMessage(
                { key: msg.key, message: quoted },
                'buffer',
                {},
                { logger: undefined, reuploadRequest: sock.updateMediaMessage }
            );
        }
        if (msg.message?.imageMessage) {
            return await downloadMediaMessage(msg, 'buffer', {});
        }
        const viewOnce = msg.message?.viewOnceMessageV2?.message?.imageMessage;
        if (viewOnce) {
            return await downloadMediaMessage(
                { key: msg.key, message: { imageMessage: viewOnce } },
                'buffer',
                {}
            );
        }
        return null;
    } catch {
        return null;
    }
}

async function uploadToImgBB(buffer) {
    try {
        const form = new FormData();
        form.append('key', IMGBB_API_KEY);
        form.append('image', buffer.toString('base64'));
        form.append('name', `${config.botName}_${Date.now()}.jpg`);

        const res = await axios.post(IMGBB_UPLOAD_URL, form, {
            headers: form.getHeaders(),
            timeout: 60000
        });
        return res.data?.data?.url || null;
    } catch {
        return null;
    }
}

async function getPromptFromImage(url) {
    try {
        const res = await axios.get(IMG2PROMPT_API, { params: { url }, timeout: 30000 });
        return res.data?.data?.prompt || null;
    } catch {
        return null;
    }
  }
