/**

 * Menu Command - Display all available commands

 */

const config = require('../../config');

const { loadCommands } = require('../../utils/commandLoader');
const ui = require('../../utils/ui');

module.exports = {

  name: 'menu',

  aliases: ['help', 'commands'],

  category: 'general',

  description: 'Show all available commands',

  usage: '.menu',

  

  async execute(sock, msg, args, extra) {

    try {

      const commands = loadCommands();

      const categories = {};

      

      // Group commands by category

      commands.forEach((cmd, name) => {

        if (cmd.name === name) { // Only count main command names, not aliases

          if (!categories[cmd.category]) {

            categories[cmd.category] = [];

          }

          categories[cmd.category].push(cmd);

        }

      });

      

      const ownerNames = Array.isArray(config.ownerName) ? config.ownerName : [config.ownerName];

      const displayOwner = ownerNames[0] || config.ownerName || 'Bot Owner';

      // menu configurtion from proboy

      let menuText = `${ui.headerLine('Menu')}\n\n`;
      menuText += `👑 Owner: ${displayOwner}\n`;
      menuText += `👤 User: @${extra.sender.split('@')[0]}\n`;
      menuText += `⚡ Prefix: ${config.prefix}\n`;
      menuText += `🧩 Commands: ${commands.size}\n\n`;

     

        

      // General Commands

      if (categories.general) {

        menuText += `╭════〘 _GENERAL COMMANDS_ 〙════⊷❍\n`;

        categories.general.forEach(cmd => {

          menuText += `┃✯│  _${config.prefix}${cmd.name}_\n`;

        });

        menuText += `┃✯╰─────────────────❍\n`;

        menuText += `╰══════════════════⊷❍\n`;  

        menuText += `\n`;

      }

        

      

      // AI Commands

      if (categories.ai) {

        menuText += `╭════〘 _AI COMMANDS_ 〙════⊷❍\n`;

        categories.ai.forEach(cmd => {

          menuText += `┃✯│  _${config.prefix}${cmd.name}_\n`;

        });

        menuText += `┃✯╰─────────────────❍\n`;

        menuText += `╰══════════════════⊷❍\n`;  

        menuText += `\n`;

      }

      

      // Group Commands

      if (categories.group) {

        menuText += `╭════〘 _GROUP COMMANDS_ 〙════⊷❍\n`;

        categories.group.forEach(cmd => {

           menuText += `┃✯│  _${config.prefix}${cmd.name}_\n`;

        });

         menuText += `┃✯╰─────────────────❍\n`;

        menuText += `╰══════════════════⊷❍\n`;  

        menuText += `\n`;

      }

      

      

      // Owner Commands

      if (categories.owner) {

		menuText += `╭════〘 _OWNER COMMANDS_ 〙════⊷❍\n`;

        categories.owner.forEach(cmd => {

          menuText += `┃✯│  _${config.prefix}${cmd.name}_\n`;

        });

        menuText += `┃✯╰─────────────────❍\n`;

		menuText += `╰══════════════════⊷❍\n`;  

		menuText += `\n`;

      }

      

      // Media Commands

      if (categories.media) {

        menuText += `╭════〘 _MEDIA COMMANDS_ 〙════⊷❍\n`;

        categories.media.forEach(cmd => {

          menuText += `┃✯│  _${config.prefix}${cmd.name}_\n`;

        });

        menuText += `┃✯╰─────────────────❍\n`;

menuText += `╰══════════════════⊷❍\n`;  

menuText += `\n`;

      }

      

      // Fun Commands

      if (categories.fun) {

        menuText += `╭════〘 _FUN COMMANDS_ 〙════⊷❍\n`;

        categories.fun.forEach(cmd => {

          menuText += `┃✯│  _${config.prefix}${cmd.name}_\n`;

        });

        menuText += `┃✯╰─────────────────❍\n`;

menuText += `╰══════════════════⊷❍\n`;  

menuText += `\n`;

      }

      

      // Utility Commands

      if (categories.utility) {

		menuText += `╭════〘 _Utility COMMANDS_ 〙════⊷❍\n`;

        categories.utility.forEach(cmd => {

          menuText += `┃✯│   _${config.prefix}${cmd.name}_\n`;

        });

        menuText += `┃✯╰─────────────────❍\n`;

menuText += `╰══════════════════⊷❍\n`;  

menuText += `\n`;

      }

       // Anime Commands

       if (categories.anime) {

			menuText += `╭════〘 _Anime COMMANDS_ 〙════⊷❍\n`;

        categories.anime.forEach(cmd => {

          menuText += `┃✯│  _${config.prefix}${cmd.name}_\n`;

        });

        menuText += `┃✯╰─────────────────❍\n`;

menuText += `╰══════════════════⊷❍\n`;  

menuText += `\n`;

      

      }

       // Textmaker Commands

       if (categories.utility) {

        menuText += `╭════〘 _Textmaker COMMANDS_ 〙════⊷❍\n`;

        categories.textmaker.forEach(cmd => {

          menuText += `┃✯│  _${config.prefix}${cmd.name}_\n`;

        });

        menuText += `┃✯╰─────────────────❍\n`;

menuText += `╰══════════════════⊷❍\n`;  

menuText += `\n`;

      }

      

      menuText += `╰━━━━━━━━━━━━━━━━━\n\n`;

      menuText += `💡 Type ${config.prefix}help <command> for more info\n`;

      menuText += `🌟 Bot Version: ${config.version || '1.0.0'}\n`;

      

      // Send menu with image

      const fs = require('fs');

      const path = require('path');

      const imagePath = path.join(__dirname, '../../utils/bot_image.jpg');

      

      if (fs.existsSync(imagePath)) {

        // Send image with newsletter forwarding context

        const imageBuffer = fs.readFileSync(imagePath);

        await sock.sendMessage(extra.from, {

          image: imageBuffer,

          caption: menuText,

          mentions: [extra.sender],

          contextInfo: {

            forwardingScore: 1,

            isForwarded: true,

            forwardedNewsletterMessageInfo: {

              newsletterJid: config.newsletterJid || '120363161513685998@newsletter',

              newsletterName: config.botName,

              serverMessageId: -1

            }

          }

        }, { quoted: msg });

      } else {

        await sock.sendMessage(extra.from, {

          text: menuText,

          mentions: [extra.sender]

        }, { quoted: msg });

      }

      

    } catch (error) {

      await extra.reply(`❌ Error: ${error.message}`);

    }

  }

};
