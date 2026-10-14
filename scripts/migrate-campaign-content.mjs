// Adds native content schema and links legacy campaigns without deleting engine records.
// node scripts/migrate-campaign-content.mjs [--url https://site.example]
// Remote targets require EMDASH_TOKEN; local dev uses the existing dev auth endpoint.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { importedBlocks } from '../src/plugins/campaigns/portable.ts';
const arg = process.argv.indexOf('--url');
const origin = arg >= 0 ? process.argv[arg + 1] : 'http://127.0.0.1:4321';
const local = ['localhost', '127.0.0.1'].includes(new URL(origin).hostname);
let cookie = '';
if (!process.env.EMDASH_TOKEN) {
  assert.ok(local, 'A remote migration requires EMDASH_TOKEN');
  const auth = await fetch(origin + '/_emdash/api/auth/dev-bypass', { method: 'POST' });
  assert.equal(auth.status, 200); cookie = auth.headers.getSetCookie().map(v => v.split(';')[0]).join('; ');
}
async function request(path, method = 'GET', body, allowMissing = false) {
  const response = await fetch(origin + '/_emdash/api/' + path, { method, headers: { origin, 'content-type': 'application/json', 'X-EmDash-Request': '1', ...(process.env.EMDASH_TOKEN ? { authorization: `Bearer ${process.env.EMDASH_TOKEN}` } : { cookie }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (allowMissing && response.status === 404) return null;
  const result = await response.json();
  assert.ok(response.ok && result.success, JSON.stringify(result));
  return result.data;
}
const schema = JSON.parse(await readFile(new URL('../seed/campaigns.schema.json', import.meta.url), 'utf8'));
const { fields, ...settings } = schema;
const existing = await request('schema/collections/campaigns', 'GET', undefined, true);
if (!existing) await request('schema/collections', 'POST', settings);
else await request('schema/collections/campaigns', 'PUT', { group: settings.group ?? null, icon: settings.icon, supports: settings.supports, hasSeo: false, urlPattern: settings.urlPattern });
const currentFields = (await request('schema/collections/campaigns/fields')).items;
for (const field of fields) {
  const prior = currentFields.find(f => f.slug === field.slug);
  if (!prior) await request('schema/collections/campaigns/fields', 'POST', field);
  else {
    assert.equal(prior.type, field.type, `Existing ${field.slug} type must match`);
    await request(`schema/collections/campaigns/fields/${field.slug}`, 'PUT', { label: field.label, ...(field.widget ? { widget: field.widget } : {}), ...(field.validation ? { validation: field.validation } : {}) });
  }
}
if (process.argv.includes('--schema-only')) {
  console.log('Campaign editor schema updated; existing campaign records retained.');
  process.exit(0);
}
const announcementFields = (await request('schema/collections/announcements/fields')).items;
if (!announcementFields.some(f => f.slug === 'campaign_ref')) await request('schema/collections/announcements/fields', 'POST', { slug: 'campaign_ref', label: 'Managed campaign reference', type: 'string', unique: true, indexed: true, widget: 'techies-campaigns:managed-reference' });
const campaigns = [];
let cursor;
do {
  const data = await request('plugins/techies-campaigns/admin/list?archived=true' + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''));
  assert.equal(data.ok, true); campaigns.push(...data.items.map(i => i.data)); cursor = data.cursor;
} while (cursor);
let created = 0, linked = 0;
for (const c of campaigns) {
  if (c.contentId) { linked++; continue; }
  const prior = await request(`content/campaigns?status=all&fieldFilters=${encodeURIComponent(JSON.stringify({ campaign_key: c.id }))}`);
  let native = prior.items[0];
  if (!native) {
    const data = { campaign_key: c.id, title: c.title, prize: c.prize, image: c.imageId ? { id: c.imageId, alt: c.prize } : c.image ? { src: c.image, alt: c.prize } : null, description: importedBlocks(c.description, c.contentFormat), rules: importedBlocks(c.rules, c.contentFormat), entry_window: { startsAt: c.startsAt, endsAt: c.endsAt }, visibility: c.visibility, winner_count: c.winnerCount, actions: c.actions.map(({ answer, ...a }) => a), announce: c.announcement === true };
    native = (await request('content/campaigns', 'POST', { slug: c.slug, status: 'draft', data })).item;
    created++;
  }
  // The after-save hook links campaign_key to the original engine ID, preserving
  // participants, sessions, URLs and saved draws. Confirm rather than assuming.
  let status;
  for (let attempt = 0; attempt < 20; attempt++) {
    status = await request(`plugins/techies-campaigns/admin/content-status?contentId=${native.id}`);
    if (status.ok && status.campaign?.contentId === native.id && status.campaign.id === c.id) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(status.campaign.id, c.id, 'Legacy campaign identity preserved');
  assert.equal(status.campaign.contentId, native.id, 'Native content linked');
  if (c.status === 'published' && c.visibility === 'public') {
    const current = await request(`content/campaigns/${native.id}`);
    await request(`content/campaigns/${native.id}/publish`, 'POST', { _rev: current._rev });
  }
}
console.log(`Campaign content migration complete: ${created} entries created, ${linked} already linked; engine data retained.`);
