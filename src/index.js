import fs from 'node:fs/promises';
import path from 'node:path';
import Parser from 'rss-parser';
import { canonicalItem, isMaliRelevant, makeDraft } from './core.js';

const DATA_DIR = process.env.DATA_DIR || '/data';
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const SOURCES_FILE = path.join(process.cwd(), 'config', 'sources.json');
const POLL_SECONDS = Number(process.env.POLL_INTERVAL_SECONDS || 1800);
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;
const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const parser = new Parser({ timeout: 20000, headers: { 'User-Agent': 'MaliNewsBot/0.1 (+RSS reader)' } });

if (!TOKEN || !ADMIN_CHAT_ID || !CHANNEL_ID) {
  console.error('Missing required environment: TELEGRAM_BOT_TOKEN, TELEGRAM_ADMIN_CHAT_ID, TELEGRAM_CHANNEL_ID');
  process.exit(1);
}

await fs.mkdir(DATA_DIR, { recursive: true });
let state = { seen: {}, pending: {} };
try { state = JSON.parse(await fs.readFile(STATE_FILE, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const sources = JSON.parse(await fs.readFile(SOURCES_FILE, 'utf8')).filter((source) => source.enabled);

async function saveState() { await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2)); }
async function telegram(method, body) {
  const response = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!data.ok) throw new Error(`Telegram ${method} failed: ${data.description || 'unknown error'}`);
  return data.result;
}
function shortId(key) { return Buffer.from(key).toString('base64url').slice(0, 48); }

async function sendDraft(item) {
  const id = shortId(item.key);
  state.pending[id] = item;
  await telegram('sendMessage', {
    chat_id: ADMIN_CHAT_ID,
    text: `New article detected\n\n${makeDraft(item)}`,
    parse_mode: 'MarkdownV2',
    reply_markup: { inline_keyboard: [[{ text: 'Approve', callback_data: `approve:${id}` }, { text: 'Skip', callback_data: `skip:${id}` }]] }
  });
}

async function poll() {
  for (const source of sources) {
    try {
      const feed = await parser.parseURL(source.url);
      for (const raw of (feed.items || []).slice(0, 20).reverse()) {
        const item = canonicalItem(source, raw);
        if (source.requireMaliRelevance && !isMaliRelevant(raw)) continue;
        if (state.seen[item.key]) continue;
        state.seen[item.key] = { detectedAt: new Date().toISOString(), status: 'pending' };
        await sendDraft(item);
      }
      await saveState();
      console.log(`${source.name}: scanned ${feed.items?.length || 0} item(s)`);
    } catch (error) {
      console.error(`${source.name}: ${error.message}`);
    }
  }
}

async function handleUpdate(update) {
  if (update.callback_query) {
    const query = update.callback_query;
    if (String(query.message?.chat?.id) !== String(ADMIN_CHAT_ID)) return;
    const [action, id] = query.data.split(':');
    const item = state.pending[id];
    if (!item) { await telegram('answerCallbackQuery', { callback_query_id: query.id, text: 'This draft is no longer available.' }); return; }
    if (action === 'approve') {
      await telegram('sendMessage', { chat_id: CHANNEL_ID, text: `${makeDraft(item)}`, parse_mode: 'MarkdownV2', disable_web_page_preview: false });
      state.seen[item.key].status = 'published';
      delete state.pending[id];
      await telegram('editMessageReplyMarkup', { chat_id: ADMIN_CHAT_ID, message_id: query.message.message_id, reply_markup: { inline_keyboard: [] } });
      await telegram('answerCallbackQuery', { callback_query_id: query.id, text: 'Published.' });
    } else if (action === 'skip') {
      state.seen[item.key].status = 'skipped';
      delete state.pending[id];
      await telegram('editMessageReplyMarkup', { chat_id: ADMIN_CHAT_ID, message_id: query.message.message_id, reply_markup: { inline_keyboard: [] } });
      await telegram('answerCallbackQuery', { callback_query_id: query.id, text: 'Skipped.' });
    }
    await saveState();
  }
}

let offset = 0;
async function telegramLoop() {
  while (true) {
    try {
      const updates = await telegram('getUpdates', { offset, timeout: 50, allowed_updates: ['callback_query'] });
      for (const update of updates) { offset = update.update_id + 1; await handleUpdate(update); }
    } catch (error) { console.error(`Telegram polling: ${error.message}`); await new Promise((resolve) => setTimeout(resolve, 5000)); }
  }
}

console.log(`Mali News Bot started in draft-only mode; ${sources.length} source(s), polling every ${POLL_SECONDS}s`);
await poll();
setInterval(() => poll().catch((error) => console.error(`Poll: ${error.message}`)), POLL_SECONDS * 1000);
telegramLoop();
