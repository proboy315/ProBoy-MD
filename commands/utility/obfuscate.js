/**
 * .obfuscate command – Obfuscate JavaScript files
 * Owner only (for security)
 */

const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { tmpdir } = require('os');

module.exports = {
    name: 'obfuscate',
    aliases: ['obf', 'obfuscator'],
    category: 'utility',
    description: 'Obfuscate a JavaScript file with strong protection',
    usage: '.obfuscate (reply to .js file) or .obfuscate <filepath>',
    ownerOnly: true,

    async execute(sock, msg, args, extra) {
        const { from, reply, react, config } = extra;

        let inputPath = null;
        let originalFilename = 'script.js';

        // Option 1: reply to an attached .js file
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (quoted?.documentMessage && quoted.documentMessage.fileName?.endsWith('.js')) {
            await react('⏳');
            const buffer = await downloadMediaMessage(
                { key: msg.key, message: quoted },
                'buffer',
                {},
                { logger: undefined, reuploadRequest: sock.updateMediaMessage }
            ).catch(() => null);

            if (!buffer) return reply('❌ Failed to download the attached file.');

            const tempDir = tmpdir();
            inputPath = path.join(tempDir, `obf_input_${Date.now()}.js`);
            fs.writeFileSync(inputPath, buffer);
            originalFilename = quoted.documentMessage.fileName || 'script.js';
        }
        // Option 2: use file path argument
        else if (args.length > 0) {
            const filePath = args.join(' ');
            if (!fs.existsSync(filePath)) return reply(`❌ File not found: ${filePath}`);
            if (!filePath.endsWith('.js')) return reply('❌ Only .js files are allowed.');
            inputPath = filePath;
            originalFilename = path.basename(filePath);
        } else {
            return reply('❌ Please reply to a .js file or provide a file path.');
        }

        await react('⏳');
        await reply('🔐 Obfuscating... This may take a moment.');

        try {
            let originalCode = fs.readFileSync(inputPath, 'utf8');

            // Replace dummy "Shahan" placeholders with actual bot name
            const botName = config.botName || 'ProBoy-MD';
            originalCode = originalCode.replace(/Shahan(_\d+)?/g, botName);

            const result = JavaScriptObfuscator.obfuscate(originalCode, {
                compact: true,
                controlFlowFlattening: true,
                controlFlowFlatteningThreshold: 1,
                deadCodeInjection: true,
                deadCodeInjectionThreshold: 1,
                debugProtection: true,
                debugProtectionInterval: 4000,
                disableConsoleOutput: false,
                identifierNamesGenerator: 'hexadecimal',
                log: false,
                numbersToExpressions: true,
                renameGlobals: true,
                selfDefending: true,
                simplify: true,
                splitStrings: true,
                splitStringsChunkLength: 5,
                stringArray: true,
                stringArrayCallsTransform: true,
                stringArrayEncoding: ['base64'],
                stringArrayIndexShift: true,
                stringArrayRotate: true,
                stringArrayShuffle: true,
                stringArrayWrappersCount: 5,
                stringArrayWrappersChainedCalls: true,
                stringArrayWrappersParametersMaxCount: 5,
                stringArrayWrappersType: 'function',
                stringArrayThreshold: 1,
                transformObjectKeys: true,
                unicodeEscapeSequence: false
            });

            const obfuscatedCode = result.getObfuscatedCode();
            const outputFilename = originalFilename.replace('.js', '_obfuscated.js');
            const tempOutput = path.join(tmpdir(), outputFilename);
            fs.writeFileSync(tempOutput, obfuscatedCode);

            // Send obfuscated file as document
            await sock.sendMessage(from, {
                document: { url: tempOutput },
                fileName: outputFilename,
                mimetype: 'application/javascript'
            }, { quoted: msg });

            // Cleanup temp files
            try { fs.unlinkSync(tempOutput); } catch {}
            if (inputPath !== args.join(' ')) {
                try { fs.unlinkSync(inputPath); } catch {}
            }

            await react('✅');
        } catch (err) {
            console.error('Obfuscation error:', err);
            await reply(`❌ Obfuscation failed: ${err.message}`);
            await react('❌');
        }
    }
};