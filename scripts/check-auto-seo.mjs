// node scripts/check-auto-seo.mjs [--cms-check]
import assert from 'node:assert/strict';
import { imageUrl, populateSeo, seoDefaults } from '../src/utils/auto-seo.ts';

const options = { siteUrl: 'https://techies.example', siteTitle: 'Techies' };
const text = value => [{ _type: 'block', children: [{ _type: 'span', text: value }] }];
const page = { title: 'Workshops', page_format: 'sections', layout: [{ _type: 'page_hero', intro: '**Build** with [us](/join).', image: { src: '/workshop.png' } }], content: text('Inactive body') };
const generated = seoDefaults('pages', page, 'workshops', options);
assert.equal(generated.title, 'Workshops');
assert.equal(generated.description, 'Build with us.');
assert.equal(generated.image, '/workshop.png');
assert.equal(generated.canonical, 'https://techies.example/workshops');
assert.equal(seoDefaults('pages', { ...page, page_format: 'rich_text' }, 'workshops', options).description, 'Inactive body');
assert.equal(seoDefaults('posts', { title: 'Roast My TechStack #7 · Singapore', content: text('Engineering details') }, 'roast-7', options).title, 'Roast My TechStack #7 Recap');
assert.equal(seoDefaults('members', { title: 'A builder', bio: 'a'.repeat(300) }, 'builder', options).canonical, 'https://techies.example/people');
assert.ok(seoDefaults('members', { title: 'A builder', bio: 'a'.repeat(300) }, 'builder', options).description.length <= 160);
assert.equal(imageUrl({ meta: { storageKey: 'photo.jpg' } }), '/_emdash/api/media/file/photo.jpg');
assert.doesNotThrow(() => seoDefaults('pages', { layout: [null], content: [{ _type: 'block', children: {} }] }, 'test', options));
const changed = { ...generated, title: 'Updated | Techies', description: 'Updated summary', image: '/updated.png' };
assert.deepEqual(populateSeo(changed, generated, generated), { ...changed, noIndex: false });
const manual = { title: 'Editorial title', description: 'Editorial summary', image: '/custom.png', canonical: 'https://original.example/page', noIndex: true };
assert.deepEqual(populateSeo(changed, generated, manual), manual);
assert.deepEqual(populateSeo(changed, generated, manual, { title: '', image: null }), { ...manual, title: changed.title, image: changed.image });
assert.equal(populateSeo(changed, generated, {}, { title: 12 }).title, 12, 'Invalid submitted types reach native validation unchanged');
console.log('Auto SEO unit checks passed: all three collections, selected layout, readable summaries, defaults and manual overrides.');

if (process.argv.includes('--cms-check')) {
  const origin = process.env.CHECK_SITE_URL || 'http://localhost:4321';
  const auth = await fetch(origin + '/_emdash/api/auth/dev-bypass', { method: 'POST' });
  assert.ok(auth.ok);
  const cookie = auth.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  async function api(path, method = 'GET', body) {
    const response = await fetch(origin + '/_emdash/api/' + path, { method, headers: { cookie, origin, 'Content-Type': 'application/json', 'X-EmDash-Request': '1' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const result = await response.json();
    assert.ok(response.ok && result.success, JSON.stringify(result));
    return result.data;
  }
  const created = [];
  const media = (await api('media?limit=1')).items.find(item => item.mimeType.startsWith('image/'));
  try {
    for (const collection of ['pages', 'posts', 'members']) {
      const title = `Auto SEO verification ${collection} ${Date.now()}`;
      const data = collection === 'pages' ? { title, page_format: 'sections', layout: [{ _type: 'page_hero', _version: 1, _key: 'hero', heading: title, intro: 'An automatically generated page summary.' }] }
        : collection === 'posts' ? { title, excerpt: 'An automatically generated post summary.', content: text('Post body') }
        : { title, bio: 'An automatically generated member summary.' };
      const result = await api(`content/${collection}`, 'POST', { data });
      const id = result.item.id;
      created.push({ collection, id });
      let saved = await api(`content/${collection}/${id}`);
      for (const field of ['title', 'description', 'image', 'canonical']) assert.ok(saved.item.seo[field], `${collection}: ${field} is saved`);
      assert.match(saved.item.seo.canonical, /^https?:\/\//);
      assert.equal(saved.item.status, 'draft');
      assert.equal(saved.item.seo.noIndex, false);
      if (collection !== 'members') {
        await api(`content/${collection}/${id}/publish`, 'POST', { _rev: saved._rev });
        const response = await fetch(origin + new URL(saved.item.seo.canonical).pathname);
        assert.equal(response.status, 200);
        const html = await response.text();
        assert.ok(html.includes(`<title>${saved.item.seo.title} | Techies</title>`), `${collection}: stored title is rendered with one site suffix`);
        assert.ok(html.includes(saved.item.seo.description), `${collection}: stored description is rendered`);
        assert.ok(html.includes('name="twitter:card"'), `${collection}: social metadata is rendered`);
        assert.equal((await fetch(new URL(saved.item.seo.image, origin))).status, 200, `${collection}: fallback social image is public`);
        saved = await api(`content/${collection}/${id}`);
        await api(`content/${collection}/${id}/unpublish`, 'POST', { _rev: saved._rev });
        saved = await api(`content/${collection}/${id}`);
      }
      const descriptionField = collection === 'pages' ? { layout: [{ ...data.layout[0], intro: 'Changed page summary.' }] } : collection === 'posts' ? { excerpt: 'Changed post summary.' } : { bio: 'Changed member summary.' };
      await api(`content/${collection}/${id}`, 'PUT', { _rev: saved._rev, data: descriptionField });
      saved = await api(`content/${collection}/${id}`);
      assert.match(saved.item.seo.description, /^Changed /, `${collection}: generated values update after partial saves`);
      if (media) {
        const image = { id: media.id };
        const imageData = collection === 'pages' ? { layout: [{ ...saved.item.data.layout[0], image }] } : collection === 'posts' ? { featured_image: image } : { photo: image };
        await api(`content/${collection}/${id}`, 'PUT', { _rev: saved._rev, data: imageData });
        saved = await api(`content/${collection}/${id}`);
        assert.ok(saved.item.seo.image.endsWith(media.storageKey), `${collection}: media ID resolves to a real social-image URL`);
      }
      await api(`content/${collection}/${id}`, 'PUT', { _rev: saved._rev, seo: manual });
      saved = await api(`content/${collection}/${id}`);
      await api(`content/${collection}/${id}`, 'PUT', { _rev: saved._rev, data: { title: 'Changed content title' } });
      saved = await api(`content/${collection}/${id}`);
      assert.deepEqual(saved.item.seo, manual, `${collection}: manual SEO and noindex remain intact`);
      await api(`content/${collection}/${id}`, 'PUT', { _rev: saved._rev, seo: { title: '', description: null, image: '', canonical: null } });
      saved = await api(`content/${collection}/${id}`);
      assert.equal(saved.item.seo.title, 'Changed content title');
      assert.equal(saved.item.seo.noIndex, true);
    }
    console.log('CMS checks passed: create without slug, partial updates, all saved SEO fields, manual overrides, clearing to regenerate, and noindex preservation.');
  } finally {
    for (const { collection, id } of created) {
      const current = await api(`content/${collection}/${id}`);
      await api(`content/${collection}/${id}`, 'DELETE', { _rev: current._rev });
    }
  }
}
