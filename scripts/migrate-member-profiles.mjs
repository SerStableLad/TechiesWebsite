// node scripts/migrate-member-profiles.mjs [--url https://site.example]
// Retains the legacy collection as a hidden backup; never deletes profiles.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mergePeople, samePerson } from '../src/utils/people.ts';

const arg = process.argv.indexOf('--url');
const origin = arg < 0 ? 'http://127.0.0.1:4321' : process.argv[arg + 1];
let cookie = '';
if (!process.env.EMDASH_TOKEN) {
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname), 'Remote migration requires EMDASH_TOKEN');
  const auth = await fetch(origin + '/_emdash/api/auth/dev-bypass', { method: 'POST' });
  assert.ok(auth.ok, 'Admin authentication failed');
  cookie = auth.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
}
async function api(path, method = 'GET', body) {
  const response = await fetch(origin + '/_emdash/api/' + path, { method, headers: { origin, 'Content-Type': 'application/json', 'X-EmDash-Request': '1', ...(process.env.EMDASH_TOKEN ? { authorization: `Bearer ${process.env.EMDASH_TOKEN}` } : { cookie }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json();
  assert.ok(response.ok && result.success, JSON.stringify(result));
  return result.data;
}
async function list(collection) {
  const items = [];
  let cursor;
  do {
    const page = await api(`content/${collection}?status=all&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    items.push(...page.items); cursor = page.cursor;
  } while (cursor);
  return items;
}
const seed = JSON.parse(await readFile(new URL('../seed/seed.json', import.meta.url), 'utf8'));
const fields = (await api('schema/collections/members/fields')).items;
for (const field of seed.collections.find(c => c.slug === 'members').fields.filter(f => ['exco', 'legacy_aliases'].includes(f.slug))) {
  if (!fields.some(f => f.slug === field.slug)) await api('schema/collections/members/fields', 'POST', field);
}
const members = await list('members');
const team = await list('team');
const profile = item => ({ id: item.slug, data: item.data, edit: {} });
for (const merged of mergePeople(team.map(profile), members.map(profile), [], true)) {
  const original = members.find(member => samePerson(profile(member), merged));
  const source = team.find(member => samePerson(profile(member), merged));
  let saved;
  if (original) {
    const current = await api(`content/members/${original.id}`);
    const data = { ...merged.data, ...current.item.data, legacy_aliases: [...new Set([...(current.item.data.legacy_aliases || []), ...merged.aliases])] };
    for (const field of ['photo', 'bio', 'linkedin', 'website', 'github']) data[field] ||= merged.data[field];
    await api(`content/members/${original.id}`, 'PUT', { _rev: current._rev, data });
    saved = original;
  } else {
    saved = (await api('content/members', 'POST', { slug: merged.id, status: 'draft', data: { ...merged.data, legacy_aliases: merged.aliases } })).item;
    if (source.status === 'published') {
      const current = await api(`content/members/${saved.id}`);
      await api(`content/members/${saved.id}/publish`, 'POST', { _rev: current._rev });
    }
    members.push(saved);
  }
  const tag = await api(`plugins/techies-members/exco?memberId=${saved.id}`);
  // A rerun must not turn an administrator's deliberate removal back on.
  if (tag.revision === null) await api('plugins/techies-members/exco-update', 'POST', { memberId: saved.id, enabled: true, revision: null });
}
await api('schema/collections/team', 'PUT', { hidden: true });
console.log('Member profiles merged; private Exco tags initialized. Existing member updates are drafts: review and publish them. Legacy profiles retained as a hidden backup.');
