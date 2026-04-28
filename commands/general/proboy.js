/**
 * .proboy command – Interactive button menu
 * Press any button to execute the corresponding command
 */

const { sendButtons } = require('../../utils/button');

module.exports = {
    name: 'proboy',
    aliases: ['pb', 'prob'],
    category: 'general',
    description: 'Interactive control panel',
    usage: '.proboy',

    async execute(sock, msg, args, extra) {
        // Buttons array – each button can trigger a command or perform an action
        const buttons = [
            {
                type: 'quick_reply',
                displayText: '❤️ Alive',
                id: 'cmd_.alive'           // Pressing this runs .alive command
            },
            {
                type: 'quick_reply',
                displayText: '📋 Menu',
                id: 'cmd_.menu'            // Pressing this runs .menu command
            },
            {
                type: 'quick_reply',
                displayText: '🏓 Ping',
                id: 'cmd_.ping'            // Pressing this runs .ping command
            },
            {
                type: 'quick_reply',
                displayText: 'ℹ️ Info',
                id: 'cmd_.info'            // Pressing this runs .info command (if exists)
            },
            {
                type: 'copy',
                displayText: '📋 Copy Pair Code',
                copyCode: `${extra.config.botName || 'Bot'}!... (your session code)`
            },
            {
                type: 'url',
                displayText: '🌐 Website',
                url: extra.config.social?.website || 'https://example.com'
            }
        ];

        // Send the button message
        await sendButtons(sock, extra.from, {
            text: `╭═══〘 *${extra.config.botName} Control Panel* 〙═══⊷❍\n┃✯│ 👑 Owner: ${extra.config.ownerName.join(', ')}\n┃✯│ 🤖 Bot: ${extra.config.botName}\n┃✯│ ⚡ Prefix: ${extra.config.prefix}\n┃✯│ 📱 Your Number: ${extra.sender.split('@')[0]}\n╰══════════════════⊷❍\n\n_Tap a button below:_`,
            footer: `⚡ ${extra.config.botName} v${extra.config.version}`,
            buttons: buttons,
            quoted: msg
        });

        // Optional: react to the command
        await extra.react('✅');
    }
};
