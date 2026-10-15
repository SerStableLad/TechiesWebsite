// node scripts/check-seo.mjs (requires the dev server; CHECK_SITE_URL overrides its origin)
import assert from 'node:assert/strict';
import { summarize } from '../src/utils/seo.ts';

assert.equal(summarize(undefined), undefined);
assert.equal(summarize('   '), undefined);
assert.equal(summarize('  Real stacks.\n Real constraints. '), 'Real stacks. Real constraints.');
assert.equal(summarize('x'.repeat(160)), 'x'.repeat(160));
assert.equal(summarize('x'.repeat(161)), 'x'.repeat(157) + '…');
assert.ok(summarize('Engineering decisions '.repeat(20)).length <= 160);
assert.ok(summarize('Engineering decisions '.repeat(20)).endsWith('decisions…'));

const origin = process.env.CHECK_SITE_URL || 'http://127.0.0.1:4321';
const decode = value => value.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&apos;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>');
function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, key, value]) => [key, decode(value)]));
}
function metadata(html) {
  const result = new Map();
  for (const [tag] of html.matchAll(/<(?:meta|link)\b[^>]*>/g)) {
    const attrs = attributes(tag);
    const key = attrs.name || attrs.property || (attrs.rel === 'canonical' ? 'canonical' : null);
    if (!key) continue;
    assert.ok(!result.has(key), `Duplicate ${key}`);
    result.set(key, attrs.content || attrs.href);
  }
  return result;
}

const response = await fetch(`${origin}/sitemap.xml`);
assert.equal(response.status, 200, 'Sitemap loads');
const xml = await response.text();
assert.match(xml, /<urlset\b/);
const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(([, value]) => decode(value));
assert.equal(new Set(urls).size, urls.length, 'No duplicate sitemap URLs');
for (const path of ['/', '/events', '/people', '/posts', '/campaigns', '/category/event-summaries', '/tag/roast-my-techstack']) {
  assert.ok(urls.some(value => new URL(value).pathname === path), `${path}: present in sitemap`);
}
for (const url of urls) {
  const parsed = new URL(url);
  assert.ok(!parsed.hash && !parsed.search, 'Sitemap contains canonical pages only');
  assert.ok(!['/home', '/members', '/exco', '/404'].includes(parsed.pathname), 'No legacy/error sitemap URLs');
  const page = await fetch(new URL(parsed.pathname, origin), { redirect: 'manual' });
  assert.equal(page.status, 200, `${parsed.pathname}: indexable response`);
  const html = await page.text();
  assert.equal([...html.matchAll(/<title>/g)].length, 1, 'One document title');
  const meta = metadata(html);
  assert.equal(meta.get('canonical'), url, `${parsed.pathname}: canonical agrees with sitemap`);
  assert.ok(meta.get('description'), `${parsed.pathname}: description`);
  assert.ok(!meta.get('robots')?.includes('noindex'), `${parsed.pathname}: not noindex`);
  assert.equal(meta.get('og:url'), url);
  assert.equal(meta.get('twitter:card'), 'summary_large_image');
  assert.ok(URL.canParse(meta.get('og:image')), `${parsed.pathname}: absolute share image`);
  const image = await fetch(meta.get('og:image'));
  assert.equal(image.status, 200, `${parsed.pathname}: share image exists`);
  assert.match(image.headers.get('content-type'), /^image\//);
  if (parsed.pathname.startsWith('/posts/')) {
    assert.equal(meta.get('og:type'), 'article');
    assert.ok(meta.get('article:published_time'));
    assert.ok(meta.get('article:modified_time'));
    assert.match(html, /"@type":"BlogPosting"/);
  } else assert.equal(meta.get('og:type'), 'website');
}
for (const path of ['/404', '/missing-seo-test-page', '/posts/missing-seo-test-post', '/tag/missing-seo-test-tag']) {
  const page = await fetch(origin + path, { redirect: 'manual' });
  assert.equal(page.status, 404, `${path}: real 404, not a redirect`);
  assert.equal(metadata(await page.text()).get('robots'), 'noindex, follow');
}
for (const path of ['/posts', '/tag/roast-my-techstack', '/campaigns']) {
  const page = await fetch(`${origin}${path}?utm_source=seo-check`);
  const canonical = new URL(metadata(await page.text()).get('canonical'));
  assert.equal(canonical.search, '', 'Tracking parameters do not affect canonical URLs');
}
console.log(`SEO checks passed for ${urls.length} sitemap pages, missing routes, and tracking URLs.`);
