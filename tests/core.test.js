import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalItem, isMaliRelevant, normalizeUrl } from '../src/core.js';

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
