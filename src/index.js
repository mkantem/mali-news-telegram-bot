import fs from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import Parser from 'rss-parser';
import { canonicalItem, isMaliRelevant, makeDraft } from './core.js';
import { addPendingDraft, pruneExpiredPending } from './state.js';

const DATA_DIR = process.env.DATA_DIR || '/data';
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const SOURCES_FILE = path.join(process.cwd(), 'config', 'sources.json');
const POLL_SECONDS = Number(process.env.POLL_INTERVAL_SECONDS || 1800);
const MAX_DRAFTS_PER_POLL = Number(process.env.MAX_DRAFTS_PER_POLL || 3);
const PORT = Number(process.env.PORT || 3000);
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;
const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const parser = new Parser({ timeout: 20000, headers: { 'User-Agent': 'MaliNewsBot/0.1 (+RSS reader)' } });

if (!TOKEN || !ADMIN_CHAT_ID || !CHANNEL_ID) {
  console.error('Missing required environment: TELEGRAM_BOT_TOKEN, TELEGRAM_ADMIN_CHAT_ID, TELEGRAM_CHANNEL_ID');
  process.exit(1);
}

await fs.mkdir(DATA_DIR, { recursive: true });
let state = { seen: {}, pending: {}, initializedSources: {} };
try {
  state = { seen: {}, pending: {}, initializedSources: {}, ...JSON.parse(await fs.readFile(STATE_FILE, 'utf8')) };
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const pendingBeforePrune = state.pending;
state.pending = pruneExpiredPending(state.pending);
for (const [id, item] of Object.entries(pendingBeforePrune)) {
  if (!state.pending[id] && state.seen[item.key]) state.seen[item.key].status = 'expired';
}
const sources = JSON.parse(await fs.readFile(SOURCES_FILE, 'utf8')).filter((source) => source.enabled);
let lastSuccessfulPollAt = 0;
let saveChain = Promise.resolve();
let pollInProgress = false;

function saveState() {
  const snapshot = JSON.stringify(state, null, 2);
  saveChain = saveChain.catch(() => {}).then(async () => {
    const temporaryFile = `${STATE_FILE}.tmp`;
    await fs.writeFile(temporaryFile, snapshot);
    await fs.rename(temporaryFile, STATE_FILE);
  });
  return saveChain;
}
async function telegram(method, body) {
  const response = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!data.ok) throw new Error(`Telegram ${method} failed: ${data.description || 'unknown error'}`);
  return data.result;
}
function shortId(key) { return Buffer.from(key).toString('base64url').slice(0, 48); }

async function sendDraft(item) {
  const id = shortId(item.key);
  addPendingDraft(state.pending, id, item);
  await saveState();
  try {
    await telegram('sendMessage', {
      chat_id: ADMIN_CHAT_ID,
      text: `New article detected\n\n${makeDraft(item)}`,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: 'Approve', callback_data: `approve:${id}` }, { text: 'Skip', callback_data: `skip:${id}` }]] }
    });
  } catch (error) {
    delete state.pending[id];
    delete state.seen[item.key];
    await saveState();
    throw error;
  }
}

async function poll() {
  if (pollInProgress) {
    console.warn('Skipping poll because the previous poll is still running');
    return;
  }
  pollInProgress = true;
  let successfulSources = 0;
  let draftsSent = 0;
  try {
    for (const source of sources) {
      try {
      const feed = await parser.parseURL(source.url);
      const items = (feed.items || []).slice(0, 20).reverse();
      if (!state.initializedSources[source.name]) {
        for (const raw of items) {
          const item = canonicalItem(source, raw);
          state.seen[item.key] = { detectedAt: new Date().toISOString(), status: 'baseline' };
        }
        state.initializedSources[source.name] = new Date().toISOString();
        await saveState();
        console.log(`${source.name}: initialized baseline with ${items.length} item(s)`);
        continue;
      }
      for (const raw of items) {
        if (draftsSent >= MAX_DRAFTS_PER_POLL) break;
        const item = canonicalItem(source, raw);
        if (source.requireMaliRelevance && !isMaliRelevant(raw)) continue;
        if (state.seen[item.key]) continue;
        state.seen[item.key] = { detectedAt: new Date().toISOString(), status: 'pending' };
        await sendDraft(item);
        draftsSent += 1;
      }
      await saveState();
      console.log(`${source.name}: scanned ${feed.items?.length || 0} item(s)`);
      successfulSources += 1;
      } catch (error) {
        console.error(`${source.name}: ${error.message}`);
      }
    }
  } finally {
    if (successfulSources > 0) lastSuccessfulPollAt = Date.now();
    pollInProgress = false;
  }
}

createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      status: 'ok',
      lastSuccessfulPollAt: lastSuccessfulPollAt ? new Date(lastSuccessfulPollAt).toISOString() : null
    }));
    return;
  }
  response.writeHead(404, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ error: 'not found' }));
}).listen(PORT, '0.0.0.0', () => console.log(`Internal health endpoint listening on :${PORT}/health`));

async function handleUpdate(update) {
  if (update.callback_query) {
    const query = update.callback_query;
    if (String(query.message?.chat?.id) !== String(ADMIN_CHAT_ID)) return;
    const [action, id] = query.data.split(':');
    const item = state.pending[id];
    if (!item) { await telegram('answerCallbackQuery', { callback_query_id: query.id, text: 'This draft was already processed or expired after 48 hours.' }); return; }
    if (action === 'approve') {
      await telegram('sendMessage', { chat_id: CHANNEL_ID, text: `${makeDraft(item)}`, parse_mode: 'HTML', disable_web_page_preview: false });
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
