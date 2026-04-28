/**
 * ProBoy-MD Button Utility (FIXED)
 * 
 * Usage:
 *   const { sendButtons, handleButtonResponse } = require('../utils/button');
 * 
 *   await sendButtons(sock, from, {
 *       text: 'Choose an option:',
 *       footer: 'ProBoy-MD',
 *       buttons: [
 *           { type: 'quick_reply', displayText: 'Alive', id: 'cmd_.alive' },
 *           { type: 'copy', displayText: 'Copy Code', copyCode: '123456' },
 *           { type: 'url', displayText: 'Website', url: 'https://proboy.vercel.app' }
 *       ]
 *   });
 */

const config = require('../config');

function extractButtonIdFromMessage(msg) {
    const content = msg?.message;
    if (!content) return null;

    const direct =
        content?.buttonsResponseMessage?.selectedButtonId ||
        content?.buttonsResponseMessage?.buttonReplyMessage?.selectedId ||
        content?.buttonsResponseMessage?.id;
    if (direct) return String(direct);

    const interactive =
        content?.interactiveResponseMessage ||
        msg?.message?.interactiveResponseMessage;
    if (!interactive) return null;

    const fromBody = interactive?.id || interactive?.selectedId || interactive?.selectedButtonId;
    if (fromBody) return String(fromBody);

    const paramsJson =
        interactive?.nativeFlowResponseMessage?.paramsJson ||
        interactive?.buttonReplyMessage?.nativeFlowResponseMessage?.paramsJson;
    if (paramsJson) {
        try {
            const parsed = JSON.parse(paramsJson);
            const extracted = parsed?.id || parsed?.selected_id || parsed?.selectedId || parsed?.button_id;
            if (extracted) return String(extracted);
        } catch {}
    }

    return null;
}

/**
 * Send interactive buttons to a chat (FIXED FOR WHATSAPP)
 * @param {Object} sock - WhatsApp socket
 * @param {string} jid - Chat JID
 * @param {Object} options - Button options
 */
async function sendButtons(sock, jid, options = {}) {
    const {
        text = '',
        footer = config.botName || 'Bot',
        buttons = [],
        quoted = null
    } = options;

    if (!text) throw new Error('Button message requires text');
    if (!buttons.length) throw new Error('At least one button is required');

    // WhatsApp requires specific button structure
    const interactiveButtons = buttons.map(btn => {
        switch (btn.type) {
            case 'copy':
                // ✅ CORRECT: cta_copy
                return {
                    name: 'cta_copy',
                    buttonParamsJson: JSON.stringify({
                        display_text: btn.displayText || 'Copy',
                        copy_code: btn.copyCode || ''
                    })
                };
            case 'url':
                // ✅ CORRECT: cta_url
                return {
                    name: 'cta_url',
                    buttonParamsJson: JSON.stringify({
                        display_text: btn.displayText || 'Open Link',
                        url: btn.url || config.social?.website || 'https://example.com'
                    })
                };
            case 'quick_reply':
                // ✅ CORRECT: quick_reply
                return {
                    name: 'quick_reply',
                    buttonParamsJson: JSON.stringify({
                        display_text: btn.displayText || 'Reply',
                        id: btn.id || `btn_${Date.now()}`
                    })
                };
            default:
                console.warn(`Unknown button type: ${btn.type}`);
                return null;
        }
    }).filter(Boolean);

    if (!interactiveButtons.length) {
        throw new Error('No valid buttons to send');
    }

    return await sendInteractiveMessage(sock, jid, {
        text,
        footer,
        interactiveButtons
    }, { quoted });
}

const buttonToLegacyQuickReply = (button) => {
    if (button?.name !== 'quick_reply') return null;
    try {
        const params = JSON.parse(button.buttonParamsJson || '{}');
        const displayText = params.display_text || 'Reply';
        const id = params.id || `btn_${Date.now()}`;
        return {
            buttonId: String(id),
            buttonText: { displayText: String(displayText) },
            type: 1
        };
    } catch {
        return null;
    }
};

const buttonToFallbackLine = (button, index) => {
    try {
        const params = JSON.parse(button.buttonParamsJson || '{}');
        if (button.name === 'cta_copy') {
            return `${index}. ${params.display_text || 'Copy'}: ${params.copy_code || ''}`;
        }
        if (button.name === 'cta_url') {
            return `${index}. ${params.display_text || 'Open'}: ${params.url || ''}`;
        }
        if (button.name === 'quick_reply') {
            return `${index}. ${params.display_text || 'Reply'}: ${params.id || ''}`;
        }
    } catch {}
    return null;
};

async function sendInteractiveMessage(sock, jid, content = {}, options = {}) {
    const {
        text = '',
        footer = config.botName || 'Bot',
        interactiveButtons = []
    } = content;

    const quickReplies = interactiveButtons
        .map(buttonToLegacyQuickReply)
        .filter(Boolean)
        .slice(0, 3);

    if (quickReplies.length) {
        try {
            return await sock.sendMessage(jid, {
                text,
                footer,
                buttons: quickReplies,
                headerType: 1
            }, options);
        } catch (error) {
            console.error('Legacy button send failed, falling back to text:', error?.message || error);
        }
    }

    const lines = interactiveButtons
        .map((button, index) => buttonToFallbackLine(button, index + 1))
        .filter(Boolean);

    const fallbackText = lines.length
        ? `${text}${footer ? `\n\n${footer}` : ''}\n\n${lines.join('\n')}`
        : text;

    return sock.sendMessage(jid, { text: fallbackText }, options);
}

/**
 * Handle button response and execute command if it's a command button
 */
async function handleButtonResponse(sock, msg, extra) {
    // Get the message content
    const content = msg?.message;
    if (!content) return false;

    const buttonId = extractButtonIdFromMessage(msg);

    if (!buttonId) return false;

    // Menu shortcut buttons (space-free IDs for better reliability)
    if (buttonId === 'cmd_menu_home') {
        const menuCmd = (extra.commands || require('../handler').commands)?.get('menu');
        if (!menuCmd || typeof menuCmd.execute !== 'function') return false;
        await menuCmd.execute(sock, msg, [], extra);
        return true;
    }
    if (buttonId.startsWith('cmd_menu_cat_')) {
        const category = buttonId.replace('cmd_menu_cat_', '').trim().toLowerCase();
        const menuCmd = (extra.commands || require('../handler').commands)?.get('menu');
        if (!menuCmd || typeof menuCmd.execute !== 'function') return false;
        await menuCmd.execute(sock, msg, [category], extra);
        return true;
    }

    // Check if it's a command button (id starts with 'cmd_')
    if (!buttonId.startsWith('cmd_')) return false;

    // Extract the command (remove 'cmd_' prefix)
    let fullCommand = buttonId.slice(4);
    
    // Add prefix if missing
    const prefix = extra.config?.prefix || '.';
    const command = fullCommand.startsWith(prefix) ? fullCommand : prefix + fullCommand;

    // Get the handler commands map
    const commands = extra.commands || require('../handler').commands;
    if (!commands) return false;

    // Parse command name and args
    const args = command.slice(prefix.length).trim().split(/ +/);
    const commandName = args.shift()?.toLowerCase();
    if (!commandName) return false;

    const cmd = commands.get(commandName);
    if (!cmd || typeof cmd.execute !== 'function') {
        await extra.reply(`❌ Command not found: ${commandName}`);
        return false;
    }

    try {
        // Execute the command
        await cmd.execute(sock, msg, args, extra);
        return true;
    } catch (error) {
        console.error(`Button command error (${commandName}):`, error.message);
        await extra.reply(`❌ Error: ${error.message}`);
        return false;
    }
}

/**
 * Create a simple menu with buttons that execute commands
 */
async function sendCommandMenu(sock, jid, commandList, title = '📋 *Command Menu*') {
    const buttons = commandList.map(item => ({
        type: 'quick_reply',
        displayText: item.name,
        id: `cmd_${item.cmd.startsWith('.') ? item.cmd : '.' + item.cmd}`
    }));

    // Split into rows of 3 buttons max (WhatsApp limit)
    const chunkedButtons = [];
    for (let i = 0; i < buttons.length; i += 3) {
        chunkedButtons.push(buttons.slice(i, i + 3));
    }

    for (let i = 0; i < chunkedButtons.length; i++) {
        const chunk = chunkedButtons[i];
        await sendButtons(sock, jid, {
            text: i === 0 ? title : 'More options:',
            footer: config.botName || 'Bot',
            buttons: chunk
        });
        // Small delay to avoid rate limits
        await new Promise(r => setTimeout(r, 500));
    }
}

module.exports = {
    sendButtons,
    sendInteractiveMessage,
    handleButtonResponse,
    extractButtonIdFromMessage,
    sendCommandMenu
};
