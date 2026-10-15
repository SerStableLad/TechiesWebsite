// node scripts/check-members.mjs — recap matching, pagination and save-time autofill.
import assert from 'node:assert/strict';
import { memberRecaps, createPlugin } from '../src/plugins/members/index.ts';
import { memberSeoDefaults, memberSettingsMiddleware } from '../src/plugins/members/settings.ts';
import { memberEditorLabels } from '../src/plugins/members/editor-labels.ts';
import { excoTag } from '../src/plugins/members/exco.ts';

const tagStore = new Map();
const tagContext = (role, method = 'GET', input = {}) => ({
  user: { role }, request: new Request('http://localhost/exco?memberId=member-id', { method }), input,
  content: { get: async (_, id) => id === 'member-id' ? { id } : null },
  kv: {
    getVersioned: async key => tagStore.get(key) ?? null,
    compareAndSet: async (key, revision, value) => {
      if ((tagStore.get(key)?.revision ?? null) !== revision) return { applied: false };
      tagStore.set(key, { value, revision: String(Number(revision) + 1) });
      return { applied: true };
    },
  },
});
for (const role of [undefined, 10, 20, 30, 40]) {
  await assert.rejects(excoTag(tagContext(role)), /Only administrators/);
  await assert.rejects(excoTag(tagContext(role, 'POST', { memberId: 'member-id', enabled: true, revision: null })), /Only administrators/);
}
assert.deepEqual(await excoTag(tagContext(50)), { enabled: false, revision: null });
const enabledTag = await excoTag(tagContext(50, 'POST', { memberId: 'member-id', enabled: true, revision: null }));
assert.equal(enabledTag.enabled, true);
await assert.rejects(excoTag(tagContext(50, 'POST', { memberId: 'member-id', enabled: false, revision: null })), /changed/);
assert.equal((await excoTag(tagContext(50, 'POST', { memberId: 'member-id', enabled: false, revision: enabledTag.revision }))).enabled, false);
await assert.rejects(excoTag(tagContext(50, 'POST', { memberId: 'member-id', enabled: 'true', revision: null })), /Invalid/);
await assert.rejects(excoTag(tagContext(50, 'POST', { memberId: 'missing', enabled: true, revision: null })), /not found/);
const tagRoute = createPlugin({ adminEntry: 'test' }).routes.exco;
assert.equal(tagRoute.permission, 'settings:manage');

const labelListeners = new Set();
const translations = {
  locale: 'en', messages: { oDAEQq: 'Ownership', VbeIOx: 'Author' },
  load(locale, messages) { if (locale === this.locale) Object.assign(this.messages, messages); for (const listener of labelListeners) listener(); },
  on(_, listener) { labelListeners.add(listener); return () => labelListeners.delete(listener); },
};
const restoreLabels = memberEditorLabels(translations);
assert.equal(translations.messages.oDAEQq, 'Approved by');
assert.equal(translations.messages.VbeIOx, 'Approved by');
translations.messages.oDAEQq = 'Ownership';
for (const listener of labelListeners) listener();
assert.equal(translations.messages.oDAEQq, 'Approved by', 'Catalog refresh retains the member label');
restoreLabels();
assert.equal(translations.messages.oDAEQq, 'Ownership', 'Other collections keep their native labels');
assert.equal(translations.messages.VbeIOx, 'Author');
assert.equal(labelListeners.size, 0, 'Leaving the member editor removes the catalog listener');

const seo = memberSeoDefaults({ title: 'Ee One Lim', bio: 'Builds apps for learning and care.', photo: { meta: { storageKey: 'portrait.jpg' } } });
assert.equal(seo.title, 'Ee One Lim');
assert.equal(seo.description, 'Builds apps for learning and care.');
assert.equal(seo.image, '/_emdash/api/media/file/portrait.jpg');
assert.ok(memberSeoDefaults({ title: 'Test', bio: 'a'.repeat(300) }).description.length <= 160);
async function settingsRequest(path, body, role = 30, method = 'PUT') {
  const url = new URL(path, 'http://localhost:4321');
  const request = new Request(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const context = { url, request, locals: { user: { role } }, rewrite: async rewritten => {
    const prepared = await rewritten.json();
    const again = await memberSettingsMiddleware({ ...context, request: rewritten }, async () => new Response(null, { status: 204 }));
    assert.equal(again.status, 204, 'A prepared request is not rewritten twice');
    return Response.json(prepared);
  } };
  return memberSettingsMiddleware(context, async () => new Response(null, { status: 204 }));
}
assert.equal((await settingsRequest('/_emdash/api/content/members/member-id', { seo: { noIndex: true } })).status, 403);
assert.equal((await settingsRequest('/_emdash/api/content/%6Dembers/member-id', { seo: null })).status, 403);
assert.equal((await settingsRequest('/_emdash/api/content/members/member-id', { data: { bio: 'Allowed' } })).status, 204);
assert.equal((await settingsRequest('/_emdash/api/content/members/member-id', { seo: { title: 'Admin override' } }, 50)).status, 204);
assert.equal((await settingsRequest('/_emdash/api/content/posts/post-id', { seo: { title: 'Other collection' } })).status, 204);
assert.equal((await settingsRequest('/_emdash/api/mcp', { method: 'tools/call', params: { name: 'content_update', arguments: { collection: 'members', id: 'member-id', seo: {} } } }, 30, 'POST')).status, 403);
const prepared = await (await settingsRequest('/_emdash/api/content/members', { data: { title: 'New member', bio: 'New biography.' } }, 30, 'POST')).json();
assert.equal(prepared.seo.title, 'New member');
assert.equal(prepared.seo.description, 'New biography.');

const speaker = slug => ({ _type: 'block', style: 'h2', children: [{ text: 'Speaker', marks: ['member'] }], markDefs: [{ _type: 'link', _key: 'member', href: `/members#${slug}` }] });
const post = (id, slug, content, status = 'published') => ({ id, slug, status, data: { title: slug, content } });
const pages = [
  { items: [post('a', 'roast-2', [speaker('ee-one-lim')]), post('b', 'roast-3', [speaker('someone-else'), null, { _type: 'block', style: 'h2', children: [null], markDefs: [null] }])], cursor: 'second', hasMore: true },
  { items: [post('c', 'roast-4', [speaker('ee-one-lim'), speaker('ee-one-lim')]), post('d', 'roast-5', [speaker('ee-one-lim')], 'draft')], hasMore: false },
];
const content = {
  get: async (_, id) => id === 'member-id' ? { slug: 'ee-one-lim' } : null,
  list: async (_, options) => {
    assert.equal(options.where.status, 'published');
    return pages[options.cursor === 'second' ? 1 : 0];
  },
};
const recaps = await memberRecaps(content, 'member-id');
assert.deepEqual(recaps.map(b => b.markDefs[0].href), ['/posts/roast-2', '/posts/roast-4']);
assert.deepEqual(await memberRecaps(content, 'missing'), []);
const hook = createPlugin({ adminEntry: 'test-admin' }).hooks['content:beforeSave'].handler;
assert.equal(await hook({ collection: 'posts', content: {} }, { content }), undefined);
assert.deepEqual((await hook({ collection: 'members', id: 'member-id', content: { bio: 'Keep this', recaps: ['manual override'] } }, { content })).recaps, recaps);
assert.equal((await hook({ collection: 'members', id: 'member-id', content: { bio: 'Keep this' } }, { content })).bio, 'Keep this');
assert.deepEqual((await hook({ collection: 'members', content: { title: 'New member' } }, { content })).recaps, []);
for (const exco of [true, false, null]) assert.equal(Object.hasOwn(await hook({ collection: 'members', content: { exco } }, { content }), 'exco'), false, 'Content writes cannot expose or toggle the private tag');
console.log('Member checks passed: published appearances, repeated speakers, cursor pagination and automatic recaps.');

if (process.argv.includes('--cms-check')) {
  const origin = process.env.CHECK_SITE_URL || 'http://127.0.0.1:4321';
  const auth = await fetch(origin + '/_emdash/api/auth/dev-bypass', { method: 'POST' });
  assert.ok(auth.ok);
  const cookie = auth.headers.getSetCookie().map(v => v.split(';')[0]).join('; ');
  async function api(path, method = 'GET', body) {
    const response = await fetch(origin + '/_emdash/api/' + path, { method, headers: { cookie, origin, 'X-EmDash-Request': '1', 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const result = await response.json();
    assert.ok(response.ok, JSON.stringify(result));
    return result.data;
  }
  const { item } = await api('content/members', 'POST', { slug: `member-check-${Date.now()}`, status: 'draft', data: { title: 'Temporary member editor check', bio: 'A private verification draft.', interests: 'Testing · PostgreSQL', exco: true, recaps } });
  try {
    const privateTag = await api(`plugins/techies-members/exco?memberId=${item.id}`);
    assert.equal(privateTag.enabled, false, 'Content fields cannot grant Exco membership');
    const tagged = await api('plugins/techies-members/exco-update', 'POST', { memberId: item.id, enabled: true, revision: privateTag.revision });
    assert.equal(tagged.enabled, true);
    await api('plugins/techies-members/exco-update', 'POST', { memberId: item.id, enabled: false, revision: tagged.revision });
    const noAuth = await fetch(origin + `/_emdash/api/plugins/techies-members/exco?memberId=${item.id}`);
    assert.ok([401, 403].includes(noAuth.status), 'Private tag reads require admin authentication');
    assert.deepEqual(item.data.recaps, [], 'New unrelated members do not inherit manual recap links');
    assert.equal(item.seo.title, 'Temporary member editor check | Techies', 'SEO is prefilled during creation');
    assert.equal(item.seo.description, 'A private verification draft.');
    const current = await api(`content/members/${item.id}`);
    await api(`content/members/${item.id}`, 'PUT', { _rev: current._rev, data: { bio: 'Still a private draft.', recaps } });
    const saved = await api(`content/members/${item.id}`);
    assert.deepEqual(saved.item.data.recaps, [], 'Saving recalculates recaps instead of accepting manual links');
    assert.equal(saved.item.data.interests, 'Testing · PostgreSQL', 'Prefilled interests survive saves');
    const computed = await api(`plugins/techies-members/recaps?memberId=${item.id}`);
    assert.deepEqual(computed.recaps, []);
    const unauthenticated = await fetch(origin + `/_emdash/api/plugins/techies-members/recaps?memberId=${item.id}`);
    assert.ok([401, 403].includes(unauthenticated.status), 'Recap editor route requires authentication');
  } finally {
    await api(`content/members/${item.id}`, 'DELETE');
  }
  console.log('CMS member check passed: private draft creation, save-time autofill, interest preservation and authenticated recap lookup.');
}
