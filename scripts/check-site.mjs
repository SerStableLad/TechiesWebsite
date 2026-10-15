// Run against the local dev server: node scripts/check-site.mjs [--cms-check]
// --cms-check creates, edits, and removes only its own temporary member profile.
import assert from 'node:assert/strict';

const origin = process.env.CHECK_SITE_URL || 'http://127.0.0.1:4321';
const partnershipSlugs = ['community-partner-ai-coding-summit-2027', 'community-partner-sincon-2026'];
const paths = ['/', '/posts', '/people', '/members', '/category/event-summaries', '/category/partnership-announcement', '/tag/roast-my-techstack', ...partnershipSlugs.map(slug => `/posts/${slug}`), ...[2, 3, 4, 5, 6, 7].map(n => `/posts/roast-${n}`)];
const images = new Set();
paths.push('/events');
for (const path of paths) {
  const response = await fetch(origin + path);
  assert.equal(response.status, 200, path);
  const html = await response.text();
  assert.ok(html.endsWith('</html>'), `${path}: complete server-rendered response`);
  assert.equal((html.match(/<h1(?:\s|>)/g) || []).length, 1, `${path}: one page heading`);
  assert.match(html, /name="description"/, `${path}: description`);
  const primaryNav = html.match(/<nav\b[^>]*aria-label="Primary navigation"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
  const navLabels = [...primaryNav.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)].map(match => match[1].replace(/<[^>]+>/g, '').trim());
  assert.deepEqual(navLabels.slice(1, -1), ['About', 'Events', 'Partnership', 'People'], 'Four primary destinations');
  for (const legacy of ['/category/event-summaries', '/members', '/exco']) assert.ok(!primaryNav.includes(`href="${legacy}"`), `${legacy}: not a primary tab`);
  for (const anchor of ['/events#recaps', '/people#exco', '/people#members']) assert.ok(html.includes(`href="${anchor}"`), `${anchor}: footer section link`);
  assert.ok(primaryNav?.includes('/category/partnership-announcement'), 'Partnership menu item');
  assert.ok(!primaryNav?.includes('href="/posts"'), 'Posts menu replaced by separate pages');
  assert.ok(primaryNav?.includes('href="/events"'), 'Events links to its own page');
  if (path === '/events') {
    assert.match(primaryNav, /aria-current="page"[^>]*>\s*Events/);
    for (const text of ['Roast My TechStack', 'Prod is DOWN!!!', 'Starting Right', 'Prod is Brewing', 'Flagship', 'Always ask why.', 'Who’s in the room?']) assert.ok(html.includes(text), text);
    const sectionIds = ['audience', 'formats-title', 'upcoming', 'after-hang', 'recaps'];
    for (let i = 1; i < sectionIds.length; i++) assert.ok(html.indexOf(`id="${sectionIds[i - 1]}"`) < html.indexOf(`id="${sectionIds[i]}"`), 'Events follow the agreed content order');
    assert.ok(html.includes('/tag/roast-my-techstack'), 'Past recaps linked');
    assert.match(html, /class="upcoming-events"/);
    const recaps = html.slice(html.indexOf('id="recaps"'));
    assert.match(recaps, /All recaps/);
    assert.ok(recaps.includes('href="/category/event-summaries"'), 'Full recap archive retained');
    assert.equal((recaps.match(/<details class="recap"/g) || []).length, 6, 'Six expandable seeded recaps');
    assert.equal((recaps.match(/class="recap-body"/g) || []).length, 6, 'Each recap has an inline summary');
    for (const slug of partnershipSlugs) assert.ok(!recaps.includes(`/posts/${slug}`), 'Recaps exclude partnerships');
  }
  if (path === '/category/partnership-announcement') {
    assert.ok(/aria-current="page"[^>]*>\s*Partnership/.test(primaryNav), 'Partnership menu selected');
    for (const slug of partnershipSlugs) assert.ok(html.includes(`/posts/${slug}`), slug);
    assert.ok(!html.includes('/posts/roast-2'), 'Event summaries excluded from partnerships');
  }
  if (path === '/category/event-summaries') {
    assert.match(html, /<h1>Event Summaries<\/h1>/);
    for (const slug of partnershipSlugs) assert.ok(!html.includes(`/posts/${slug}`), 'Partnerships excluded from event summaries');
  }
  if (path === '/tag/roast-my-techstack') {
    assert.match(html, /<h1>Roast My TechStack<\/h1>/);
    assert.ok(html.includes('Roast My TechStack Recaps &amp; Discussions'), 'Tag page has a descriptive SEO title');
    assert.ok(html.includes('Follow the decisions and discussions behind this topic.'), 'Tag page keeps its distinct copy');
  }
  if (path === '/posts/community-partner-ai-coding-summit-2027') {
    assert.ok(html.includes('10% off'));
    assert.ok(html.includes('https://ti.to/gitnation/ai-coding-summit-asia-2027/discount/TECHIES'));
  }
  if (path === '/') {
    assert.ok(html.includes('id="audience"'), 'Homepage audience section');
    assert.match(html, /class="upcoming-events"/);
    assert.ok(!html.includes('luma.com/embed/calendar/'), 'Calendar has no fixed-width iframe');
    assert.ok(html.includes('class="upcoming-event"') || html.includes('class="calendar-empty"'), 'Calendar renders events or a useful fallback');
    assert.match(html, /community\.ts/);
    assert.match(html, /Starting Right/);
    assert.match(html, /Season 1 complete/);
    assert.match(html, /\/posts\/roast-7/);
    assert.ok(!html.includes('class="supper-photos"'), 'Old homepage photo layout removed');
  }
  if (path === '/' || path === '/events') {
    assert.equal((html.match(/class="hang-photo"/g) || []).length, 4, `${path}: shared collage shows all four photos`);
    for (const id of ['01M4W903A7WXGZMMD32ZPYWH46', '01M4W903A8GWB4H3NP354Y1ASC']) assert.ok(html.includes(id), `${path}: new hangout photo retained`);
  }
  if (path === '/people' || path === '/members') {
    assert.match(html, /id="exco"/, 'Legacy Exco anchor retained');
    assert.match(html, /id="members"/);
    assert.ok(!html.includes('class="exco-tag"'), 'Private Exco tags are never rendered publicly');
    for (const name of ['Leong Han Wai', 'Jesse Sng', 'Ying Zhao', 'Kai Ming N.', 'Esther Tan']) assert.ok(html.includes(name), name);
    assert.equal((html.match(/<article\b[^>]*id="jesse-sng"/g) || []).length, 1, 'Exco speaker appears once');
    assert.match(html, /id="yingzhao-ouyang"/, 'Alternate organiser anchor retained');
    for (const slug of ['jesse-sng', 'ying-zhao']) {
      const card = html.match(new RegExp(`<article\\b[^>]*id="${slug}"[\\s\\S]*?<\\/article>`))?.[0];
      assert.match(card, /full-photo/, `${slug}: full photo shown`);
      assert.ok(!card.includes('portrait-crop'), `${slug}: portrait zoom disabled`);
    }
    assert.match(html, /Presented at Roast My TechStack/);
    assert.match(html, /aria-haspopup="dialog"/);
    assert.match(html, /<dialog\b/);
    for (const label of ['LinkedIn', 'Website', 'GitHub']) {
      assert.ok(html.includes(`aria-label="Ying Zhao’s ${label}"`), `${label}: icon link has an accessible name`);
    }
    assert.match(html, /id="kong"/, 'Legacy speaker anchors retained');
    if (path === '/people') assert.match(primaryNav, /aria-current="page"[^>]*>\s*People/);
  }
  if (path === '/posts/roast-7') {
    assert.ok(html.includes('canary-lab-promo.mp4'), 'Speaker demo retained');
    assert.ok(html.includes('Vercel · Vanilla JS · Supabase'), 'Stack labels remain readable');
    assert.ok(html.includes('Known Weak Points'), 'Technical detail retained');
  }
  for (const image of html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)) {
    if (image[1].startsWith('/') || image[1].startsWith(origin + '/')) {
      const url = new URL(image[1].replaceAll('&amp;', '&'), origin);
      images.add(url.pathname + url.search);
    }
  }
}
for (const src of images) {
  const response = await fetch(origin + src);
  assert.equal(response.status, 200, src);
  assert.match(response.headers.get('content-type'), /^image\//, src);
}
for (const [from, to] of [['/index.html', '/'], ['/exco.html', '/exco'], ...[2, 3, 4, 5, 6, 7].map(n => [`/roast-${n}.html`, `/posts/roast-${n}`])]) {
  const response = await fetch(origin + from, { redirect: 'manual' });
  assert.equal(response.status, 301, from);
  assert.equal(new URL(response.headers.get('location'), origin).pathname, to);
}
assert.equal((await fetch(origin + '/404')).status, 404);
const excoRedirect = await fetch(origin + '/exco', { redirect: 'manual' });
assert.equal(excoRedirect.status, 301);
assert.equal(excoRedirect.headers.get('location'), '/people#exco');
assert.equal((await fetch(origin + '/does-not-exist')).status, 404);
for (const path of ['/unknown/event-summaries', '/category/missing-term', '/tag/missing-term']) {
  assert.equal((await fetch(origin + path)).status, 404, `${path}: taxonomy route rejects unknown taxonomies and terms`);
}
console.log(`Site check passed: ${paths.length} routes, ${images.size} stored images, 9 redirects, metadata and 404s.`);

if (process.argv.includes('--cms-check')) {
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname), 'CMS mutation checks are local-only');
  const auth = await fetch(origin + '/_emdash/api/auth/dev-bypass', { method: 'POST' });
  assert.equal(auth.status, 200);
  const cookie = auth.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  async function api(path, method = 'GET', body) {
    const response = await fetch(origin + '/_emdash/api/' + path, {
      method, headers: { cookie, origin, 'content-type': 'application/json', 'X-EmDash-Request': '1' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await response.json();
    assert.ok(response.ok, JSON.stringify(result));
    return result.data;
  }
  const title = `CMS verification ${Date.now()}`;
  const { item } = await api('content/members', 'POST', { slug: `verification-${Date.now()}`, status: 'draft', data: { title, bio: 'Temporary verification profile', sort_order: 999 } });
  try {
    assert.ok(!(await (await fetch(origin + '/members')).text()).includes(title), 'Draft member is private');
    const current = await api(`content/members/${item.id}`);
    await api(`content/members/${item.id}`, 'PUT', { _rev: current._rev, data: { title, bio: 'Published verification copy', building: 'A temporary site check', sort_order: 999 } });
    await api(`content/members/${item.id}/publish`, 'POST', {});
    const html = await (await fetch(origin + '/members')).text();
    assert.ok(html.includes(title), 'Published member renders');
    assert.ok(html.includes('Published verification copy'), 'CMS edit renders');
    assert.ok(html.includes('A temporary site check'), 'Project detail renders');
  } finally {
    await api(`content/members/${item.id}`, 'DELETE');
  }
  assert.ok(!(await (await fetch(origin + '/members')).text()).includes(title), 'Temporary member cleaned up');
  console.log('CMS check passed: draft privacy, publishing, editable profile fields and cleanup.');
}
