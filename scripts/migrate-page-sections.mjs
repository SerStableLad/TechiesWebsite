// node scripts/migrate-page-sections.mjs [--apply] [--url https://site.example]
// Adds schema and stages a homepage draft. Never publishes or deletes content.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homeSections, repairPageImageReferences } from '../src/utils/page-sections.ts';

const arg = process.argv.indexOf('--url');
const origin = arg < 0 ? 'http://localhost:4321' : process.argv[arg + 1];
const apply = process.argv.includes('--apply');
let cookie = '';
if (!process.env.EMDASH_TOKEN) {
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname), 'Remote migration requires EMDASH_TOKEN');
  const auth = await fetch(origin + '/_emdash/api/auth/dev-bypass', { method: 'POST' });
  assert.ok(auth.ok, 'Admin authentication failed');
  cookie = auth.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
}
async function api(path, method = 'GET', body) {
  const response = await fetch(origin + '/_emdash/api/' + path, {
    method, headers: { origin, 'Content-Type': 'application/json', 'X-EmDash-Request': '1', ...(process.env.EMDASH_TOKEN ? { authorization: `Bearer ${process.env.EMDASH_TOKEN}` } : { cookie }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  assert.ok(response.ok && result.success, `${path}: ${JSON.stringify(result)}`);
  return result.data;
}

const seed = JSON.parse(await readFile(new URL('../seed/seed.json', import.meta.url), 'utf8'));
const pageSchema = seed.collections.find(c => c.slug === 'pages');
const [home, types, fields, menus] = await Promise.all([
  api('content/pages/home'), api('schema/block-types'), api('schema/collections/pages/fields'), api('menus'),
]);
const originalMenu = menus.some(menu => menu.name === 'primary') ? await api('menus/primary') : null;
console.log(`${apply ? 'Applying' : 'Dry run:'} page-section schema; ${home.item.data.layout?.length || home.item.data.use_sections ? 'existing homepage layout will be left alone' : 'homepage sections will be staged as a draft'}.`);
if (!apply) {
  console.log('No changes made. Re-run with --apply to migrate.');
  process.exit(0);
}

await mkdir(new URL('../.emdash/backups/', import.meta.url), { recursive: true });
const backup = new URL(`../.emdash/backups/page-sections-${Date.now()}.json`, import.meta.url);
await writeFile(backup, JSON.stringify({ origin, home, originalMenu, fields, types }, null, 2), { flag: 'wx', mode: 0o600 });
console.log(`Backup: ${backup.pathname}`);

for (const type of seed.blockTypes) {
  const existing = types.items.find(item => item.slug === type.slug);
  if (existing) {
    assert.equal(existing.currentVersion, 1, `${type.slug}: unexpected version; manual review required`);
    for (const field of type.versions[0].fields) {
      assert.equal(existing.versions.find(version => version.version === 1)?.fields.find(saved => saved.slug === field.slug)?.type, field.type, `${type.slug}.${field.slug}: schema differs; manual review required`);
    }
    const blockFields = existing.versions.find(version => version.version === 1).fields.map(field => {
      const desired = type.versions[0].fields.find(candidate => candidate.slug === field.slug);
      return desired?.defaultValue === undefined ? field : { ...field, defaultValue: desired.defaultValue };
    });
    if (existing.description !== type.description || existing.category !== type.category || JSON.stringify(blockFields) !== JSON.stringify(existing.versions.find(version => version.version === 1).fields)) {
      await api(`schema/block-types/${type.slug}`, 'PUT', { expectedFingerprint: existing.versions.find(version => version.version === 1).fingerprint, description: type.description, category: type.category, fields: blockFields });
    }
    continue;
  }
  await api('schema/block-types', 'POST', { slug: type.slug, label: type.label, description: type.description, category: type.category, fields: type.versions[0].fields });
}
for (const field of pageSchema.fields) {
  const existing = fields.items.find(item => item.slug === field.slug);
  if (existing) {
    assert.equal(existing.type, field.type, `${field.slug} already exists with a different type`);
    if (existing.label !== field.label || existing.widget !== (field.widget ?? null)) {
      await api(`schema/collections/pages/fields/${field.slug}`, 'PUT', { label: field.label, ...(field.widget ? { widget: field.widget } : {}) });
    }
  }
  else await api('schema/collections/pages/fields', 'POST', field);
}
await api('schema/collections/pages', 'PUT', { description: pageSchema.description });
await api('schema/collections/pages/fields/reorder', 'POST', { fieldSlugs: [...pageSchema.fields.map(field => field.slug), ...fields.items.filter(field => !pageSchema.fields.some(desired => desired.slug === field.slug)).map(field => field.slug)] });

if (!home.item.data.layout?.length && !home.item.data.use_sections) {
  // Read again so optimistic locking protects edits made while schema was installed.
  const current = await api(`content/pages/${home.item.id}`);
  if (!current.item.data.layout?.length && !current.item.data.use_sections) {
    await api(`content/pages/${home.item.id}`, 'PUT', { _rev: current._rev, data: { layout: homeSections(current.item.data), use_sections: true } });
  }
} else if (home.item.data.layout?.length) {
  const current = await api(`content/pages/${home.item.id}`);
  const layout = repairPageImageReferences(current.item.data.layout);
  if (!current.item.data.use_sections || JSON.stringify(layout) !== JSON.stringify(current.item.data.layout)) {
    await api(`content/pages/${home.item.id}`, 'PUT', { _rev: current._rev, data: { layout, use_sections: true } });
  }
}

// Use a new editable menu, leaving the original menu intact as a backup.
if (!menus.some(menu => menu.name === 'site_navigation')) {
  await api('menus', 'POST', { name: 'site_navigation', label: 'Site navigation' });
  const items = originalMenu ? originalMenu.items
    .filter(item => !['/category/event-summaries', '/members', '/exco'].includes(item.customUrl))
    .map(item => ({ ...item, customUrl: item.customUrl === '/#events' ? '/events' : item.customUrl }))
    : seed.menus.find(menu => menu.name === 'site_navigation').items.map(item => ({ ...item, customUrl: item.url }));
  if (!items.some(item => item.customUrl === '/people')) items.push({ type: 'custom', label: 'People', customUrl: '/people' });
  if (!items.some(item => item.customUrl === 'https://luma.com/APACtechies')) items.push({ type: 'custom', label: 'Join us', customUrl: 'https://luma.com/APACtechies', cssClasses: 'nav-join' });
  for (const [sortOrder, item] of items.entries()) {
    await api('menus/site_navigation/items', 'POST', {
      type: item.type, label: item.label, sortOrder,
      ...(item.customUrl ? { customUrl: item.customUrl } : { referenceCollection: item.referenceCollection, referenceId: item.referenceId }),
      ...(item.target ? { target: item.target } : {}),
      ...(item.cssClasses ? { cssClasses: item.cssClasses } : {}),
    });
  }
}
console.log('Done. Review Pages → home → Page sections and Preview, then Publish. Navigation is in Menus → Site navigation. Legacy data and the original menu are retained.');
