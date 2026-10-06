// Run against the local dev server: node scripts/check-site.mjs [--cms-check]
// --cms-check creates, edits, and removes only its own temporary member profile.
import assert from 'node:assert/strict';

const origin = process.env.CHECK_SITE_URL || 'http://127.0.0.1:4321';
const paths = ['/', '/posts', '/members', '/exco', '/category/event-summaries', '/tag/roast-my-techstack', ...[2, 3, 4, 5, 6, 7].map(n => `/posts/roast-${n}`)];
const images = new Set();
for (const path of paths) {
  const response = await fetch(origin + path);
  assert.equal(response.status, 200, path);
  const html = await response.text();
  assert.ok(html.endsWith('</html>'), `${path}: complete server-rendered response`);
  assert.equal((html.match(/<h1(?:\s|>)/g) || []).length, 1, `${path}: one page heading`);
  assert.match(html, /name="description"/, `${path}: description`);
  if (path === '/') {
    assert.match(html, /community\.ts/);
    assert.match(html, /Starting Right/);
    assert.match(html, /Season 1 complete/);
    assert.match(html, /\/posts\/roast-7/);
  }
  if (path === '/exco') for (const name of ['Leong Han Wai', 'Jesse Sng', 'Yingzhao Ouyang', 'Kai Ming N.', 'Esther Tan']) assert.ok(html.includes(name), name);
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
assert.equal((await fetch(origin + '/does-not-exist')).status, 404);
console.log(`Site check passed: ${paths.length} routes, ${images.size} stored images, 8 redirects, metadata and 404s.`);

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
