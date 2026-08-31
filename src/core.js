export const MALI_TERMS = [
  'mali', 'bamako', 'tombouctou', 'timbuktu', 'gao', 'kidal', 'sikasso',
  'mopti', 'ségou', 'segou', 'kayes', 'koutiala', 'menaka', 'taoudéni',
  'taoudeni', 'goundam', 'bamada', 'malien', 'malienne', 'sahel'
];

export function normalizeUrl(url) {
  const parsed = new URL(url);
  parsed.hash = '';
  for (const key of [...parsed.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$)/i.test(key)) parsed.searchParams.delete(key);
  }
  return parsed.toString();
}

export function isMaliRelevant(item) {
  const text = `${item.title ?? ''} ${item.contentSnippet ?? ''} ${item.content ?? ''}`.toLowerCase();
  return MALI_TERMS.some((term) => text.includes(term));
}

export function canonicalItem(source, item) {
  const url = normalizeUrl(item.link ?? item.guid ?? item.id);
  return {
    key: `${source.name}:${url}`,
    source: source.name,
    title: (item.title ?? 'Untitled article').trim(),
    link: url,
    publishedAt: item.isoDate ?? item.pubDate ?? null,
    excerpt: (item.contentSnippet ?? item.content ?? '').replace(/\s+/g, ' ').trim().slice(0, 320)
  };
}

export function makeDraft(item) {
  const excerpt = item.excerpt ? `\n\n${escapeHtml(item.excerpt)}` : '';
  const link = escapeHtml(item.link);
  return `<b>${escapeHtml(item.title)}</b>\n\nSource: ${escapeHtml(item.source)}${excerpt}\n\n<a href="${link}">Read original article</a>`;
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}
