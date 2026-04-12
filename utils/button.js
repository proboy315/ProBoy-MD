/**
 * ProBoy-MD Button Utility
 * 
 * Usage:
 *   const { sendButtons, handleButtonResponse } = require('../utils/button');
 * 
 *   await sendButtons(sock, from, {
 *       text: 'Choose an option:',
 *       footer: 'ProBoy-MD',
 *       buttons: [
 *           { type: 'quick_reply', displayText: 'Alive', id: 'cmd_.alive' },
 *           { type: 'quick_reply', displayText: 'Menu', id: 'cmd_.menu' },
 *           { type: 'copy', displayText: 'Copy Code', copyCode: '123456' },
 *           { type: 'url', displayText: 'Website', url: 'https://proboy.vercel.app' }
 *       ]
 *   });
 * 
 *   // In handleMessage or execute, call:
 *   await handleButtonResponse(sock, msg, extra);
 */

const { sendInteractiveMessage } = require('gifted-btns');

/**
 * Send interactive buttons to a chat
 * @param {Object} sock - WhatsApp socket
 * @param {string} jid - Chat JID
 * @param {Object} options - Button options
 * @param {string} options.text - Main message text
 * @param {string} [options.footer] - Footer text
 * @param {Array} options.buttons - Array of button objects
 * @param {Object} [options.quoted] - Quoted message
 * @returns {Promise<Object>} - Baileys sendMessage result
 */
async function sendButtons(sock, jid, options = {}) {
    const {
        text = '',
        footer = 'ProBoy-MD',
        buttons = [],
        quoted = null
    } = options;

    if (!text) throw new Error('Button message requires text');
    if (!buttons.length) throw new Error('At least one button is required');

    const interactiveButtons = buttons.map(btn => {
        switch (btn.type) {
            case 'copy':
                return {
                    name: 'cta_copy',
                    buttonParamsJson: JSON.stringify({
                        display_text: btn.displayText || 'Copy',
                        copy_code: btn.copyCode || ''
                    })
                };
            case 'url':
                return {
                    name: 'url',
                    buttonParamsJson: JSON.stringify({
                        display_text: btn.displayText || 'Open Link',
                        url: btn.url || 'https://proboy.vercel.app'
                    })
                };
            case 'quick_reply':
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

/**
 * Handle button response and execute command if it's a command button
 * Call this inside your plugin's execute function or in a global handler
 * 
 * @param {Object} sock - WhatsApp socket
 * @param {Object} msg - Message object from Baileys
 * @param {Object} extra - The extra object from handler
 * @returns {Promise<boolean>} - True if a command was executed, false otherwise
 */
async function handleButtonResponse(sock, msg, extra) {
    // Check if this is a button response message
    const buttonResponse = msg?.message?.buttonsResponseMessage;
    if (!buttonResponse) return false;

    const buttonId = buttonResponse?.selectedButtonId;
    if (!buttonId) return false;

    // Check if it's a command button (id starts with 'cmd_')
    if (!buttonId.startsWith('cmd_')) return false;

    // Extract the command (remove 'cmd_' prefix)
    const fullCommand = buttonId.slice(4); // e.g., ".alive" or "alive"
    
    // Add prefix if missing
    const prefix = extra.config?.prefix || '.';
    const command = fullCommand.startsWith(prefix) ? fullCommand : prefix + fullCommand;

    // Get the handler commands map
    const { commands } = require('../handler');
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
        await extra.reply(`❌ Error executing command: ${error.message}`);
        return false;
    }
}

/**
 * Create a simple menu with buttons that execute commands
 * @param {Object} sock - WhatsApp socket
 * @param {string} jid - Chat JID
 * @param {Array} commandList - Array of { name: 'Alive', cmd: 'alive' }
 * @param {string} [title] - Menu title
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

    for (const chunk of chunkedButtons) {
        await sendButtons(sock, jid, {
            text: chunk === chunkedButtons[0] ? title : 'More options:',
            footer: 'ProBoy-MD',
            buttons: chunk
        });
        await new Promise(r => setTimeout(r, 500)); // Small delay to avoid rate limits
    }
}

module.exports = {
    sendButtons,
    handleButtonResponse,
    sendCommandMenu
};
