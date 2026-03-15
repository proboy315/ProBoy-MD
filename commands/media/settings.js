const database = require('../../database');
const { sendInteractiveMessage } = require('gifted-btns');

const KEYS = [
  { key: 'antilink', label: 'AntiLink' },
  { key: 'antiSpam', label: 'AntiSpam' },
  { key: 'antifake', label: 'AntiFake' },
  { key: 'antibadword', label: 'AntiBadWord' },
  { key: 'antiviewonce', label: 'AntiViewOnce' },
  { key: 'antibot', label: 'AntiBot' },
  { key: 'welcome', label: 'Welcome' },
  { key: 'goodbye', label: 'Goodbye' }
];

const getButtonId = (msg) => {
  const br = msg.message?.buttonsResponseMessage;
  if (br?.selectedButtonId) return br.selectedButtonId;

  const ir = msg.message?.interactiveResponseMessage;
  const params = ir?.nativeFlowResponseMessage?.paramsJson;
  if (params) {
    try {
      const obj = JSON.parse(params);
      return obj.id || obj.selectedId || obj.buttonId || null;
    } catch {}
  }

  return ir?.id || null;
};

const fmt = (v) => (v ? '✅ ON' : '❌ OFF');

module.exports = {
  name: 'settings',
  aliases: ['setts', 'cfg'],
  category: 'group',
  description: 'Show and toggle current chat settings',
  usage: '.settings',

  async execute(sock, msg, args, extra) {
    try {
      const { from, reply, react } = extra;
      await react('⏳');

      const s = database.getChatSettings(from);
      const lines = [];
      lines.push('*Settings*');
      lines.push('');
      for (const k of KEYS) {
        lines.push(`${k.label}: ${fmt(!!s[k.key])}`);
      }

      const buttons = KEYS.map(k => ({
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({
          display_text: `${k.label}: ${s[k.key] ? 'ON' : 'OFF'}`,
          id: `settings:toggle:${k.key}`
        })
      }));

      await sendInteractiveMessage(sock, from, {
        text: lines.join('\n'),
        footer: 'Tap to toggle',
        interactiveButtons: buttons
      }, { quoted: msg });

      await react('✅');
    } catch (e) {
      await extra.reply(`❌ ${e.message}`);
      await extra.react('❌');
    }
  },

  async handleButtonResponse(sock, msg, extra) {
    try {
      const id = getButtonId(msg);
      if (!id || !id.startsWith('settings:toggle:')) return;

      const key = id.split(':')[2];
      if (!KEYS.some(k => k.key === key)) return;

      const from = extra.from;
      const s = database.getChatSettings(from);
      const next = !s[key];
      database.updateChatSettings(from, { [key]: next });

      await sock.sendMessage(from, { text: `✅ ${key} => ${next ? 'ON' : 'OFF'}` }, { quoted: msg });
    } catch {
      // ignore
    }
  }
};

