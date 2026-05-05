const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('../../config');

const AI_MEMORY_PATH = path.join(process.cwd(), 'database', 'ai.json');
const MAX_HISTORY_ITEMS = 20;
const MAX_TEXT_CHUNK = 3500;

function ensureMemoryStore() {
  const dbDir = path.join(process.cwd(), 'database');
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

  if (!fs.existsSync(AI_MEMORY_PATH)) {
    fs.writeFileSync(AI_MEMORY_PATH, JSON.stringify({ version: 2, conversations: {} }, null, 2));
    return;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(AI_MEMORY_PATH, 'utf8'));
    if (Array.isArray(raw?.conversations)) {
      fs.writeFileSync(AI_MEMORY_PATH, JSON.stringify({ version: 2, conversations: { legacy: raw.conversations } }, null, 2));
      return;
    }
    if (!raw || typeof raw !== 'object' || typeof raw.conversations !== 'object' || Array.isArray(raw.conversations)) {
      fs.writeFileSync(AI_MEMORY_PATH, JSON.stringify({ version: 2, conversations: {} }, null, 2));
    }
  } catch {
    fs.writeFileSync(AI_MEMORY_PATH, JSON.stringify({ version: 2, conversations: {} }, null, 2));
  }
}

function readMemory() {
  ensureMemoryStore();
  try {
    return JSON.parse(fs.readFileSync(AI_MEMORY_PATH, 'utf8'));
  } catch {
    return { version: 2, conversations: {} };
  }
}

function writeMemory(data) {
  ensureMemoryStore();
  fs.writeFileSync(AI_MEMORY_PATH, JSON.stringify(data, null, 2));
}

function getScopeId(extra) {
  const sender = String(extra.sender || '').trim();
  if (sender) return sender;
  return String(extra.from || 'global');
}

function getConversationHistory(extra) {
  const data = readMemory();
  const scopeId = getScopeId(extra);
  const items = Array.isArray(data.conversations?.[scopeId]) ? data.conversations[scopeId] : [];
  return items.slice(-MAX_HISTORY_ITEMS);
}

function saveExchange(extra, userMsg, botResponse) {
  const data = readMemory();
  const scopeId = getScopeId(extra);
  if (!Array.isArray(data.conversations[scopeId])) data.conversations[scopeId] = [];

  data.conversations[scopeId].push({
    user: userMsg,
    assistant: botResponse,
    ts: Date.now()
  });

  if (data.conversations[scopeId].length > MAX_HISTORY_ITEMS) {
    data.conversations[scopeId] = data.conversations[scopeId].slice(-MAX_HISTORY_ITEMS);
  }

  writeMemory(data);
}

function clearMemory(extra) {
  const data = readMemory();
  delete data.conversations[getScopeId(extra)];
  writeMemory(data);
}

function buildSystemPrompt(history) {
  const corePrompt = [
    'You are ProBoy AI, integrated inside ProBoy-MD WhatsApp bot.',
    'Your job is to help users build, debug, and improve WhatsApp bot plugins professionally.',
    'You may use the conversation history below as working memory to stay consistent and avoid repeating mistakes.',
    '',
    'IMPORTANT RULES:',
    '- When generating a plugin, output exactly one JavaScript plugin file in this format:',
    '```filename.js',
    '// code here',
    '```',
    '- After the code block, provide a short professional explanation covering features, install path, and usage.',
    '- Do not claim that the plugin was installed automatically.',
    '- Generated code must follow CommonJS style and suit a command-based WhatsApp bot.',
    '- Prefer safe, admin, utility, moderation, developer, or productivity plugins only.',
    '- Refuse malware, crash, ban, spam, exploit, or abuse requests.',
    '- Append this sentence at the end of every answer outside code blocks:',
    '"This response is for training — your input helps me evolve."',
    '',
    'CONVERSATION HISTORY (user ↔ assistant):'
  ].join('\n');

  const historyBlock = history
    .map((entry) => `User: ${entry.user}\nAssistant: ${entry.assistant}`)
    .join('\n\n');

  return historyBlock ? `${corePrompt}\n${historyBlock}` : corePrompt;
}

function chunkText(text, max = MAX_TEXT_CHUNK) {
  const normalized = String(text || '').trim();
  if (!normalized) return [];
  if (normalized.length <= max) return [normalized];

  const chunks = [];
  let remaining = normalized;
  while (remaining.length > max) {
    let index = remaining.lastIndexOf('\n', max);
    if (index < Math.floor(max * 0.6)) index = remaining.lastIndexOf(' ', max);
    if (index < Math.floor(max * 0.5)) index = max;
    chunks.push(remaining.slice(0, index).trim());
    remaining = remaining.slice(index).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

async function sendLongText(sock, jid, text, quoted) {
  const chunks = chunkText(text);
  for (let i = 0; i < chunks.length; i++) {
    await sock.sendMessage(jid, { text: chunks[i] }, { quoted: i === 0 ? quoted : undefined });
  }
}

function extractCodeBlock(reply) {
  const match = String(reply || '').match(/```([\w.-]+\.js)\n([\s\S]*?)```/);
  if (!match) return null;

  return {
    fileName: match[1].trim(),
    code: match[2].trim(),
    explanation: String(reply).replace(match[0], '').trim()
  };
}

function safeFileName(name) {
  const base = String(name || 'plugin.js').replace(/[^a-zA-Z0-9._-]/g, '_');
  return base.endsWith('.js') ? base : `${base}.js`;
}

function getApiBaseUrl() {
  return config.apis?.proboyAi?.baseUrl || 'https://proboy-ai.vercel.app/';
}

function buildHelpText(prefix) {
  return [
    '╭━━━〔 *PROBOY AI* 〕━━━╮',
    '┃ Generate professional bot plugins with memory',
    '╰━━━━━━━━━━━━━━━━━━━━╯',
    '',
    `• Usage: ${prefix}proboyai <prompt>`,
    `• Clear memory: ${prefix}proboyai clear`,
    `• Status: ${prefix}proboyai status`,
    '',
    'Examples:',
    `• ${prefix}proboyai create a welcome plugin with buttons`,
    `• ${prefix}proboyai make a moderation command with warnings`,
    `• ${prefix}proboyai fix this plugin and improve error handling`,
    '',
    'What it does:',
    '• remembers recent conversation context',
    '• generates install-ready plugin files',
    '• sends the plugin as a .js document',
    '• does not auto-install anything locally'
  ].join('\n');
}

module.exports = {
  name: 'proboyai',
  aliases: ['pbai', 'pluginai', 'plugingen', 'devai'],
  category: 'ai',
  description: 'Professional plugin developer AI with memory',
  usage: `${config.prefix}proboyai <prompt>`,

  async execute(sock, msg, args, extra) {
    const { from, reply, react } = extra;

    try {
      const sub = String(args[0] || '').toLowerCase();

      if (!args.length) {
        await reply(buildHelpText(config.prefix));
        await react('🧠');
        return;
      }

      if (sub === 'clear') {
        clearMemory(extra);
        await reply('🧹 ProBoy AI memory cleared for your chat context.');
        await react('🧹');
        return;
      }

      if (sub === 'status') {
        const history = getConversationHistory(extra);
        await reply(
          `🧠 *ProBoy AI Status*\n` +
          `Memory entries: ${history.length}/${MAX_HISTORY_ITEMS}\n` +
          `Scope: ${getScopeId(extra).split('@')[0]}\n` +
          `API: ${getApiBaseUrl()}`
        );
        await react('📊');
        return;
      }

      const userPrompt = args.join(' ').trim();
      if (!userPrompt) {
        await reply(buildHelpText(config.prefix));
        await react('🧠');
        return;
      }

      await react('⏳');

      const history = getConversationHistory(extra);
      const systemPrompt = buildSystemPrompt(history);

      const response = await axios.post(
        getApiBaseUrl(),
        { prompt: userPrompt, systemPrompt },
        { headers: { 'Content-Type': 'application/json' }, timeout: 60000 }
      );

      let aiReply = response.data?.response || response.data?.result || response.data?.message;
      if (!aiReply || typeof aiReply !== 'string') {
        throw new Error('Empty response from AI API');
      }

      const disclaimer = 'This response is for training — your input helps me evolve.';
      if (!aiReply.includes(disclaimer)) {
        aiReply = `${aiReply.trim()}\n\n${disclaimer}`;
      }

      saveExchange(extra, userPrompt, aiReply);

      const plugin = extractCodeBlock(aiReply);
      if (plugin?.fileName && plugin?.code) {
        const fileName = safeFileName(plugin.fileName);
        await sock.sendMessage(from, {
          document: Buffer.from(plugin.code, 'utf8'),
          fileName,
          mimetype: 'application/javascript',
          caption: `✅ Generated plugin: ${fileName}\nInstall it manually if you want to use it.`
        }, { quoted: msg });

        const explanation = plugin.explanation || [
          `✅ *Plugin ready:* ${fileName}`,
          `📁 Install path: commands/<category>/${fileName}`,
          `🔁 Restart the bot after placing the file`,
          '',
          disclaimer
        ].join('\n');

        await sendLongText(sock, from, explanation, msg);
        await react('✅');
        return;
      }

      await sendLongText(sock, from, aiReply, msg);
      await react('🤖');
    } catch (error) {
      console.error('ProBoy AI error:', error);
      let errorMsg = `❌ *AI Error:* ${error.message}`;
      if (error.response?.status) errorMsg += `\nAPI Response: ${error.response.status}`;
      await reply(errorMsg);
      await react('❌').catch(() => {});
    }
  }
};
