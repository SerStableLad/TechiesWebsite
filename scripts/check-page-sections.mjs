// node scripts/check-page-sections.mjs [--cms-check]
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { homeSections, pageSections, repairPageImageReferences } from '../src/utils/page-sections.ts';
import { pageFormat } from '../src/utils/page-format.ts';

const seed = JSON.parse(await readFile(new URL('../seed/seed.json', import.meta.url), 'utf8'));
const home = seed.content.pages.find(page => page.slug === 'home').data;
const schema = seed.collections.find(collection => collection.slug === 'pages');
const types = schema.fields.find(field => field.slug === 'layout').validation.allowedTypes;
const legacy = homeSections({ ...home, title: 'Edited headline', intro: 'Edited introduction' });
assert.equal(legacy[0].heading, 'Edited headline');
assert.equal(legacy[0].intro, 'Edited introduction');
assert.equal(new Set(legacy.map(block => block._key)).size, legacy.length);
assert.deepEqual(pageSections({ layout: [], use_sections: true }, true), [], 'Intentional empty layout stays empty');
assert.equal(pageSections({ layout: [] }, true).length, 8, 'CMS default empty array must not erase a legacy homepage');
assert.equal(pageSections({ content: [] }), undefined, 'Ordinary legacy pages retain rich text');
assert.equal(pageSections(home), home.layout, 'Saved layout wins over legacy fields');
assert.equal(pageFormat({}), 'rich_text', 'Existing simple pages retain rich text');
assert.equal(pageFormat({}, true), 'sections', 'Existing homepage retains its layout');
assert.equal(pageSections({ ...home, page_format: 'rich_text' }), undefined, 'Explicit rich text wins without deleting blocks');
assert.deepEqual(pageSections({ page_format: 'sections', content: legacy }, true), [], 'Empty builder does not restore homepage defaults');
assert.equal(pageSections({ ...home, page_format: 'sections' }), home.layout);
assert.equal(schema.fields.find(field => field.slug === 'page_format').defaultValue, 'sections');
assert.ok(schema.fields.filter(field => field.label.startsWith('Legacy: ')).every(field => field.widget === 'techies-pages:retained'));
const wrongImage = [{ _type: 'page_images', _version: 1, _key: 'photos', images: [{ image: { id: '01M4W903A7WXGZMMD32ZPYWH46', alt: 'Keep this description' } }, { image: { id: 'unrelated' } }] }];
const repaired = repairPageImageReferences(wrongImage);
assert.equal(repaired[0].images[0].image.id, '01M4W903A834QZ0AVM2HJVPXPC');
assert.equal(repaired[0].images[0].image.alt, 'Keep this description');
assert.deepEqual(repaired[0].images[1], wrongImage[0].images[1]);
assert.deepEqual(repairPageImageReferences(repaired), repaired, 'Media repair is idempotent');
for (const block of [...legacy, ...home.layout]) {
  assert.ok(types.includes(block._type));
  assert.equal(block._version, 1);
  const type = seed.blockTypes.find(type => type.slug === block._type);
  for (const field of type.versions[0].fields.filter(field => field.required)) assert.ok(block[field.slug]);
}
assert.deepEqual([...types].sort(), seed.blockTypes.map(type => type.slug).sort());
console.log('Page-section selection, legacy conversion and seeded schema checks passed.');

if (process.argv.includes('--cms-check')) {
  const origin = process.env.CHECK_SITE_URL || 'http://localhost:4321';
  const auth = await fetch(origin + '/_emdash/api/auth/dev-bypass', { method: 'POST' });
  assert.ok(auth.ok);
  const cookie = auth.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  async function api(path, method = 'GET', body) {
    const response = await fetch(origin + '/_emdash/api/' + path, {
      method, headers: { cookie, origin, 'Content-Type': 'application/json', 'X-EmDash-Request': '1' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const result = await response.json();
    assert.ok(response.ok && result.success, JSON.stringify(result));
    return result.data;
  }
  const currentHome = await api('content/pages/home');
  for (const section of currentHome.item.data.layout ?? []) {
    if (section._type === 'page_images') for (const { image } of section.images ?? []) await api(`media/${image.id}`);
  }
  const homePreview = await api(`content/pages/${currentHome.item.id}/preview-url`, 'POST', {});
  const previewResponse = await fetch(new URL(homePreview.url, origin));
  const previewHtml = await previewResponse.text();
  assert.equal(previewResponse.status, 200, 'Homepage draft preview follows /home to /');
  assert.match(previewHtml, /Who’s in the room/);
  assert.equal((previewHtml.match(/<h1(?:\s|>)/g) || []).length, 1);
  const layout = homeSections(currentHome.item.data);
  layout.splice(1, 0, { _type: 'page_text', _version: 1, _key: 'text-test', heading: 'Verification text', body: [{ _type: 'block', _key: 'p', style: 'normal', markDefs: [], children: [{ _type: 'span', _key: 's', text: 'Editable rich text body', marks: [] }] }] });
  const slug = `section-verification-${Date.now()}`;
  const created = await api('content/pages', 'POST', { slug, status: 'draft', data: { title: 'Section verification', layout, use_sections: true } });
  const path = `content/pages/${created.item.id}`;
  const save = async data => {
    const current = await api(path);
    return api(path, 'PUT', { _rev: current._rev, data });
  };
  const publish = async () => {
    const current = await api(path);
    return api(`${path}/publish`, 'POST', { _rev: current._rev });
  };
  try {
    assert.equal((await fetch(`${origin}/${slug}`)).status, 404, 'Draft page is private');
    const preview = await api(`${path}/preview-url`, 'POST', {});
    assert.match(await (await fetch(new URL(preview.url, origin))).text(), /Editable rich text body/);
    await publish();
    let html = await (await fetch(`${origin}/${slug}`)).text();
    for (const text of ['Editable rich text body', 'Real conversations', 'What’s next?', 'community.ts', 'Do You Even Build']) assert.ok(html.includes(text), text);
    assert.equal((html.match(/<h1(?:\s|>)/g) || []).length, 1, 'One H1 with leading hero');
    assert.ok(html.indexOf('Verification text') < html.indexOf('id="about"'));
    assert.equal((html.match(/class="hang-photo"/g) || []).length, 4, 'Migrated media are retained');
    await save({ page_format: 'sections', layout: [...layout].reverse() });
    html = await (await fetch(`${origin}/${slug}`)).text();
    assert.ok(html.indexOf('Verification text') < html.indexOf('id="about"'), 'Unpublished ordering is not exposed');
    await publish();
    html = await (await fetch(`${origin}/${slug}`)).text();
    assert.ok(html.indexOf('id="about"') < html.indexOf('Verification text'), 'Published ordering is respected');
    assert.equal((html.match(/<h1(?:\s|>)/g) || []).length, 1, 'One H1 when hero moves down');
    await save({ page_format: 'sections', layout: [], content: layout[1].body, use_sections: true });
    await publish();
    html = await (await fetch(`${origin}/${slug}`)).text();
    assert.ok(!html.includes('Editable rich text body'), 'Empty layout does not resurrect legacy content');
    await save({ page_format: 'rich_text', layout, use_sections: true });
    await publish();
    html = await (await fetch(`${origin}/${slug}`)).text();
    assert.ok(html.includes('Editable rich text body'), 'Legacy rich-text pages still work');
    assert.ok(!html.includes('community.ts'), 'Rich-text selection wins over retained non-empty blocks');
    assert.equal((await api(path)).item.data.layout.length, layout.length, 'Format switch retains block content');
    await save({ page_format: 'sections' });
    await publish();
    html = await (await fetch(`${origin}/${slug}`)).text();
    assert.ok(html.includes('community.ts'), 'Switching back restores the same blocks');
  } finally {
    const current = await api(path);
    await api(path, 'DELETE', { _rev: current._rev });
  }
  console.log('CMS checks passed: homepage preview, seven section types, draft privacy, ordering, publishing, images and legacy fallback. Temporary page moved to trash.');
}
