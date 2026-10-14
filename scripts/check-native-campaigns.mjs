// Development-only checks. Own temporary content is removed; engine audit history is retained.
import assert from 'node:assert/strict';
import { importedBlocks } from '../src/plugins/campaigns/portable.ts';
const origin = process.env.CHECK_SITE_URL || 'http://127.0.0.1:4321';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const auth = await fetch(origin + '/_emdash/api/auth/dev-bypass', { method: 'POST' });
assert.equal(auth.status, 200);
const cookie = auth.headers.getSetCookie().map(v => v.split(';')[0]).join('; ');
async function api(path, method = 'GET', body, expected = true) {
  const r = await fetch(origin + '/_emdash/api/' + path, { method, headers: { cookie, origin, 'content-type': 'application/json', 'X-EmDash-Request': '1' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await r.json();
  if (expected) assert.ok(r.ok && result.success && result.data?.ok !== false, JSON.stringify(result));
  else assert.ok(!r.ok || !result.success || result.data?.ok === false, JSON.stringify(result));
  return result.data;
}
async function wait(read, condition, label) {
  for (let i = 0; i < 50; i++) { const value = await read(); if (condition(value)) return value; await new Promise(r => setTimeout(r, 100)); }
  assert.fail(label);
}
const plugin = 'plugins/techies-campaigns/admin/';
const nonce = Date.now();
const docs = [], keys = [], announcements = [];
const template = {
  title: `Native campaign verification ${nonce}`, prize: 'Development-only prize',
  description: importedBlocks('<p>Native <strong>formatted description</strong>.</p>', 'html'), rules: importedBlocks('<ul><li>Development-only rules.</li></ul>', 'html'),
  entry_window: { startsAt: new Date(Date.now() - 60000).toISOString(), endsAt: new Date(Date.now() + 3600000).toISOString() },
  visibility: 'public', winner_count: 1, actions: [{ id: 'like', type: 'linkedin_like', title: 'Like the LinkedIn post', instructions: '', url: 'https://www.linkedin.com/feed/update/urn:li:activity:123456/', points: 0 }], announce: true,
};
const annList = id => api(`content/announcements?status=all&fieldFilters=${encodeURIComponent(JSON.stringify({ campaign_ref: id }))}`);
async function create(slug, data) {
  const value = await api('content/campaigns', 'POST', { slug, status: 'draft', data });
  docs.push(value.item.id);
  const status = await wait(() => api(plugin + `content-status?contentId=${value.item.id}`), x => x.campaign?.contentId === value.item.id, 'Native engine link created');
  keys.push(status.campaign.id);
  return { contentId: value.item.id, key: status.campaign.id };
}
async function edit(id, data) {
  const current = await api(`content/campaigns/${id}`);
  await api(`content/campaigns/${id}`, 'PUT', { _rev: current._rev, data });
}
try {
  const pub = await create(`native-public-${nonce}`, template);
  const ann = await wait(() => annList(pub.key), x => x.items.length === 1, 'Draft announcement created');
  announcements.push(ann.items[0].id);
  assert.equal(ann.items[0].status, 'draft');
  assert.equal((await fetch(origin + `/campaigns/native-public-${nonce}`)).status, 404);
  const current = await api(`content/campaigns/${pub.contentId}`);
  await api(`content/campaigns/${pub.contentId}/publish`, 'POST', { _rev: current._rev });
  await wait(() => api(plugin + `detail?id=${pub.key}`), x => x.campaign.status === 'published', 'Public content activates engine');
  await wait(() => annList(pub.key), x => x.items[0]?.status === 'published', 'Announcement published with campaign');
  const html = await (await fetch(origin + `/campaigns/native-public-${nonce}`)).text();
  assert.match(html, /<strong>formatted description<\/strong>/);
  assert.match(html, /<ul>/);
  await edit(pub.contentId, { title: `Unpublished native edit ${nonce}` });
  assert.ok(!(await (await fetch(origin + `/campaigns/native-public-${nonce}`)).text()).includes(`Unpublished native edit ${nonce}`), 'Draft edits do not alter live campaign');
  assert.equal((await annList(pub.key)).items.length, 1, 'Repeated saves do not duplicate announcements');
  const updated = await api(`content/campaigns/${pub.contentId}`);
  await api(`content/campaigns/${pub.contentId}/publish`, 'POST', { _rev: updated._rev });
  await wait(() => api(plugin + `detail?id=${pub.key}`), x => x.campaign.title === `Unpublished native edit ${nonce}`, 'Publishing updates engine snapshot');
  assert.equal((await annList(pub.key)).items[0].id, announcements[0]);
  assert.equal((await annList(pub.key)).items[0].status, 'published', 'Public campaigns automatically announce');
  await api(`content/campaigns/${pub.contentId}/unpublish`, 'POST', {});
  assert.equal((await fetch(origin + `/campaigns/native-public-${nonce}`)).status, 404, 'Native unpublish closes public visibility');

  const invited = `native-invited-${nonce}@example.test`;
  const priv = await create(`native-private-${nonce}`, { ...template, title: `Private secret prize ${nonce}`, visibility: 'private', actions: [...template.actions, { id: 'quiz', type: 'question', title: 'Private question', instructions: 'Answer the question', url: '', points: 1 }] });
  const privateCurrent = await api(`content/campaigns/${priv.contentId}`);
  await api(`content/campaigns/${priv.contentId}/publish`, 'POST', { _rev: privateCurrent._rev }, false);
  let managed = await api(plugin + `detail?id=${priv.key}`);
  await api(plugin + 'settings', 'POST', { id: priv.key, revision: managed.revision, answers: { quiz: 'native-private-answer' } });
  let state = await api(plugin + `content-status?contentId=${priv.contentId}`);
  await api(plugin + 'activate-private', 'POST', { contentId: priv.contentId, contentRevision: state.contentRevision });
  assert.equal((await api(`content/campaigns/${priv.contentId}`)).item.status, 'draft', 'Private details stay out of published CMS content');
  assert.ok(!JSON.stringify(await api(`content/campaigns/${priv.contentId}`)).includes('native-private-answer'), 'Correct answers do not enter content or revision fields');
  const publicNative = await api('content/campaigns?status=published');
  assert.ok(!publicNative.items.some(i => i.id === priv.contentId));
  const privateHtml = await (await fetch(origin + `/campaigns/native-private-${nonce}`)).text();
  assert.ok(privateHtml.includes(`Private secret prize ${nonce}`), 'Unlisted details are readable by URL');
  assert.equal((await annList(priv.key)).items.length, 0, 'Unlisted campaigns never announce');
  await edit(priv.contentId, { title: `Private saved draft ${nonce}` });
  assert.equal((await api(plugin + `detail?id=${priv.key}`)).campaign.title, `Private secret prize ${nonce}`, 'Private autosave does not change active snapshot');
  state = await api(plugin + `content-status?contentId=${priv.contentId}`);
  await api(plugin + 'activate-private', 'POST', { contentId: priv.contentId, contentRevision: state.contentRevision });
  assert.equal((await api(plugin + `detail?id=${priv.key}`)).campaign.title, `Private saved draft ${nonce}`);
  assert.equal((await annList(priv.key)).items.length, 0);
  await api(`content/campaigns/${priv.contentId}`, 'PUT', { data: { actions: [{ ...template.actions[0], answer: 'must-not-enter-revisions' }] } }, false);
  await api(`content/campaigns/${priv.contentId}`, 'PUT', { data: { entry_window: { startsAt: template.entry_window.endsAt, endsAt: template.entry_window.startsAt } } }, false);
  const entryApi = path => 'plugins/techies-campaigns/' + path;
  await api(entryApi('request-code'), 'POST', { campaignId: priv.key, email: invited, name: 'Native entrant verification', consent: true });
  const emails = await api('dev/emails');
  const code = emails.items.find(e => e.message.to === invited).message.text.match(/code is (\d{6})/)[1];
  const verified = await api(entryApi('verify'), 'POST', { campaignId: priv.key, email: invited, code });
  assert.ok(!JSON.stringify(verified).includes('native-private-answer'), 'Verified participant payload still omits correct answers');
  const credentials = { campaignId: priv.key, token: verified.token };
  await api(entryApi('enter'), 'POST', { ...credentials, consent: true });
  await api(entryApi('submit'), 'POST', { ...credentials, actionId: 'quiz', response: 'wrong' }, false);
  await api(entryApi('submit'), 'POST', { ...credentials, actionId: 'quiz', response: 'native-private-answer' });
  await api(entryApi('submit'), 'POST', { ...credentials, actionId: 'like', response: 'confirmed' });
  assert.equal((await api(entryApi('participant'), 'POST', credentials)).participant.qualified, true);
  await api(`content/campaigns/${priv.contentId}`, 'PUT', { data: { actions: [{ ...template.actions[0], title: 'Changed locked terms' }] } }, false);
  console.log('Native campaign checks passed: content editing/publishing, revision isolation, private activation/privacy, dates, linked announcements and no duplication.');
} finally {
  for (const id of keys) await api(plugin + 'archive', 'POST', { id });
  for (const id of docs) await api(`content/campaigns/${id}`, 'DELETE');
  for (const id of announcements) await api(`content/announcements/${id}`, 'DELETE');
}
