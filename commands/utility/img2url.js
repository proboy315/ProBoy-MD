const axios = require('axios');
const FormData = require('form-data');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { sendButtons } = require('../../utils/button');

const IMGBB_API_KEY = '8db492efc937a635b90680a9a860dc85';
const IMGBB_UPLOAD_URL = 'https://api.imgbb.com/1/upload';

module.exports = {
    name: 'image2url',
    aliases: ['imgurl', 'uploadimg', 'imgbb'],
    category: 'utility',
    description: 'Upload an image and get a shareable URL',
    usage: '.image2url (reply/send image)',

    async execute(sock, msg, args, extra) {
        await extra.react('⏳');

        try {
            const imageBuffer = await getImageBuffer(sock, msg);
            if (!imageBuffer) {
                await extra.reply('❌ Please reply to an image or send with caption');
                return await extra.react('❌');
            }

            await extra.reply('📤 Uploading to ImgBB...');
            const imageUrl = await uploadToImgBB(imageBuffer);
            if (!imageUrl) {
                await extra.reply('❌ Upload failed');
                return await extra.react('❌');
            }

            const resultText = `✅ *Image Uploaded!*\n\n🔗 *URL:* ${imageUrl}`;

            await sendButtons(sock, extra.from, {
                text: resultText,
                footer: 'ProBoy-MD',
                buttons: [
                    { type: 'copy', displayText: '📋 Copy URL', copyCode: imageUrl },
                    { type: 'url', displayText: '🌐 Open', url: imageUrl }
                ],
                quoted: msg
            });

            await extra.react('✅');

        } catch (error) {
            console.error('image2url error:', error);
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
        form.append('name', `proboy_${Date.now()}.jpg`);

        const res = await axios.post(IMGBB_UPLOAD_URL, form, {
            headers: form.getHeaders(),
            timeout: 60000
        });
        return res.data?.data?.url || null;
    } catch {
        return null;
    }
}
