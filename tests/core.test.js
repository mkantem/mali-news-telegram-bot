import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalItem, isMaliRelevant, makeDraft, normalizeUrl } from '../src/core.js';
import { addPendingDraft, pruneExpiredPending } from '../src/state.js';

test('normalizes tracking parameters and fragments', () => {
  assert.equal(normalizeUrl('https://example.com/a?utm_source=x&ok=1#part'), 'https://example.com/a?ok=1');
});

test('detects Mali relevance', () => {
  assert.equal(isMaliRelevant({ title: 'New policy in Bamako' }), true);
  assert.equal(isMaliRelevant({ title: 'Football results in Europe' }), false);
});

test('creates stable canonical item keys', () => {
  const source = { name: 'Test' };
  const a = canonicalItem(source, { title: 'Title', link: 'https://example.com/x?utm_campaign=y', contentSnippet: 'Text' });
  const b = canonicalItem(source, { title: 'Title', link: 'https://example.com/x', contentSnippet: 'Text' });
  assert.equal(a.key, b.key);
  assert.equal(a.link, 'https://example.com/x');
});

test('creates Telegram HTML-safe drafts', () => {
  const draft = makeDraft({ title: 'Report: Mali - 10.5%', source: 'Malijet', excerpt: 'A <test> & details', link: 'https://example.com/a-b?q=1&x=2' });
  assert.match(draft, /<b>Report: Mali - 10\.5%<\/b>/);
  assert.match(draft, /A &lt;test&gt; &amp; details/);
  assert.match(draft, /href="https:\/\/example\.com\/a-b\?q=1&amp;x=2"/);
});

test('pending drafts receive a timestamp and survive before the 48-hour expiry', () => {
  const pending = {};
  const item = { key: 'article-1', title: 'Article' };
  addPendingDraft(pending, 'draft-1', item, new Date('2026-08-31T12:00:00Z'));

  assert.equal(pending['draft-1'].pendingSince, '2026-08-31T12:00:00.000Z');
  const kept = pruneExpiredPending(pending, new Date('2026-09-02T11:59:59Z'));
  assert.equal(kept['draft-1'].title, 'Article');
});

test('pending drafts expire only after 48 hours', () => {
  const pending = {};
  addPendingDraft(pending, 'fresh', { key: 'fresh' }, new Date('2026-08-31T12:00:00Z'));
  addPendingDraft(pending, 'old', { key: 'old' }, new Date('2026-08-29T11:59:59Z'));

  const remaining = pruneExpiredPending(pending, new Date('2026-08-31T12:00:00Z'));
  assert.deepEqual(Object.keys(remaining), ['fresh']);
});
