// Exercises the actual scheduled-draw service with an isolated CAS-backed store.
import assert from 'node:assert/strict';
import { ensureDrawScheduler, exportCsv, hash, runDeadlineDraws, runScheduledDraw } from '../src/plugins/campaigns/service.ts';
import { afterPublish, runScheduledLaunch } from '../src/plugins/campaigns/native.ts';
import { importedBlocks } from '../src/plugins/campaigns/portable.ts';
import { parseCampaign } from '../src/plugins/campaigns/model.ts';

function collection(initial = []) {
  const rows = new Map(initial.map(({ id, data }) => [id, { value: structuredClone(data), revision: crypto.randomUUID() }]));
  const matches = (data, where = {}) => Object.entries(where).every(([key, value]) => typeof value === 'object' ? value.in ? value.in.includes(data[key]) : data[key] <= value.lte : data[key] === value);
  return {
    async get(id) { return structuredClone(rows.get(id)?.value ?? null); },
    async exists(id) { return rows.has(id); },
    async getVersioned(id) { return structuredClone(rows.get(id) ?? null); },
    async compareAndSet(id, expected, value) {
      if ((rows.get(id)?.revision ?? null) !== expected) return { applied: false };
      const revision = crypto.randomUUID(); rows.set(id, { value: structuredClone(value), revision });
      return { applied: true, revision };
    },
    async query({ where, limit = 100, orderBy = {} } = {}) {
      let items = [...rows].filter(([, row]) => matches(row.value, where)).map(([id, row]) => ({ id, data: structuredClone(row.value) }));
      const [key, direction] = Object.entries(orderBy)[0] ?? [];
      if (key) items.sort((a, b) => (String(a.data[key]).localeCompare(String(b.data[key]))) * (direction === 'desc' ? -1 : 1));
      return { items: items.slice(0, limit), hasMore: false };
    },
  };
}
const end = Date.now() - 1000;
const template = { slug: 'scheduled-check', title: 'Scheduled check', description: 'Test', prize: 'Test', rules: 'Test rules', startsAt: new Date(end - 86400000).toISOString(), endsAt: new Date(end).toISOString(), visibility: 'public', status: 'published', invites: '', winnerCount: 2, actions: [{ id: 'like', type: 'linkedin_like', title: 'Like the post', instructions: '', url: 'https://www.linkedin.com/feed/update/test/', points: 100, answer: '' }] };
const campaign = parseCampaign(template, 'scheduled');
const empty = parseCampaign({ ...template, slug: 'empty-check' }, 'empty');
const future = parseCampaign({ ...template, slug: 'future-check', endsAt: new Date(Date.now() + 3600000).toISOString() }, 'future');
const entrant = (email, status, reviewedAt) => ({ campaignId: 'scheduled', email, name: email, entered: true, verifiedAt: new Date(end - 60000).toISOString(), consentAt: new Date(end - 60000).toISOString(), submissions: { like: { status, points: 0, submittedAt: new Date(end - 30000).toISOString(), ...(reviewedAt ? { reviewedAt: new Date(reviewedAt).toISOString() } : {}) } }, attempts: {} });
const taskMap = new Map();
let schedules = 0;
const ctx = {
  storage: {
    campaigns: collection([{ id: 'scheduled', data: campaign }, { id: 'empty', data: empty }, { id: 'future', data: future }]),
    participants: collection([{ id: 'qualified', data: entrant('qualified@example.test', 'approved', end - 5000) }, { id: 'pending', data: entrant('pending@example.test', 'pending') }, { id: 'late', data: entrant('late@example.test', 'approved', end + 500) }]),
    draws: collection(),
  },
  cron: { async list() { return [...taskMap.values()]; }, async schedule(name, options) { schedules++; taskMap.set(name, { name, ...options }); } },
  log: { error() {} },
};
await ensureDrawScheduler(ctx);
await ensureDrawScheduler(ctx);
assert.equal(schedules, 1, 'Repeated saves do not reset the registered minute scheduler');
assert.equal(taskMap.get('draw-deadlines').schedule, '* * * * *');
await runScheduledDraw(ctx, 'future');
assert.equal(await ctx.storage.draws.get('future'), null, 'A stale one-shot cannot draw before the current deadline');
await runScheduledDraw(ctx, 'scheduled');
await runDeadlineDraws(ctx);
const draw = await ctx.storage.draws.get('scheduled');
assert.equal(draw.actor, 'scheduler');
assert.equal(draw.deadline, campaign.endsAt);
assert.deepEqual(draw.winners.map(w => w.email), ['qualified@example.test']);
assert.equal(draw.unfilledPrizes, 1);
assert.equal(draw.eligible.length, 1, 'Pending and post-deadline approvals excluded');
assert.deepEqual((await ctx.storage.draws.get('empty')).winners, [], 'An empty campaign completes without inventing winners');
assert.equal(await ctx.storage.draws.get('future'), null, 'No early draw');
await runDeadlineDraws(ctx);
assert.deepEqual(await ctx.storage.draws.get('scheduled'), draw, 'Scheduler replay does not reroll');
assert.equal(draw.algorithm, 'crypto-uniform-without-replacement-v1');
assert.ok(draw.eligible.every(p => p.entries === 1));
// Both public and unlisted go-live use saved, revision-fenced content snapshots.
for (const visibility of ['public', 'private']) {
  const id = `launch-${visibility}`;
  const doc = { id, slug: id, status: 'draft', data: { campaign_key: id, title: id, description: importedBlocks('Description'), rules: importedBlocks('Rules'), prize: 'Prize', visibility, winner_count: 1, entry_window: { startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 3600000).toISOString() }, actions: [{ id: 'like', type: 'linkedin_like', title: 'Like', url: 'https://www.linkedin.com/feed/update/test/' }] } };
  const snapshot = { ...future, id, contentId: id, nativeRevision: await hash(JSON.stringify([doc.slug, doc.data])), visibility, status: 'scheduled', launchAt: new Date(Date.now() + 60000).toISOString() };
  await ctx.storage.campaigns.compareAndSet(id, null, snapshot);
  let publishCalls = 0;
  ctx.content = { async getVersioned() { return { item: doc, _rev: 'saved-revision' }; }, async list() { return { items: [] }; }, async publish(collection, docId, { _rev }) { assert.equal(_rev, 'saved-revision'); assert.equal(docId, id); publishCalls++; await afterPublish(doc, ctx); }, async create() { return { id: `announcement-${id}`, status: 'draft' }; }, async update() {} };
  await runScheduledLaunch(ctx, id);
  assert.equal((await ctx.storage.campaigns.get(id)).status, 'scheduled');
  let row = await ctx.storage.campaigns.getVersioned(id);
  await ctx.storage.campaigns.compareAndSet(id, row.revision, { ...row.value, launchAt: new Date(Date.now() - 1000).toISOString() });
  // Announcement publishing is independently stubbed to leave the real campaign hook exercised.
  ctx.content.publish = async (collection, docId, { _rev }) => { if (collection === 'announcements') return; assert.equal(_rev, 'saved-revision'); publishCalls++; await afterPublish(doc, ctx); };
  await runScheduledLaunch(ctx, id);
  assert.equal((await ctx.storage.campaigns.get(id)).status, 'published');
  assert.equal(publishCalls, visibility === 'public' ? 1 : 0);
  await runScheduledLaunch(ctx, id);
  assert.equal(publishCalls, visibility === 'public' ? 1 : 0, 'Replayed launch never republishes');
}
// Exports include every page, use immutable winner records, and escape spreadsheet formulas.
const exportRows = Array.from({ length: 65 }, (_, i) => ({ id: `export-${i}`, data: { ...entrant(`person-${i}@example.test`, 'approved', end - 5000), name: i === 0 ? '=SUM(1,2)' : `Person ${i}` } }));
ctx.storage.participants.query = async ({ cursor }) => { const offset = Number(cursor ?? 0); return { items: exportRows.slice(offset, offset + 25), cursor: offset + 25 < exportRows.length ? String(offset + 25) : undefined }; };
ctx.input = { id: 'scheduled', kind: 'participants' };
const participantCsv = await exportCsv(ctx);
assert.equal(participantCsv.split('\r\n').length, 66);
assert.ok(participantCsv.includes('person-64@example.test'), 'Export includes unloaded pages');
assert.ok(participantCsv.includes('"\'=SUM(1,2)"'), 'Names cannot inject spreadsheet formulas');
ctx.input = { id: 'scheduled', kind: 'winners' };
const winnerCsv = await exportCsv(ctx);
assert.ok(winnerCsv.includes('qualified@example.test'), 'Export uses the saved draw, not current participant pages');
assert.ok(!winnerCsv.includes('person-64@example.test'));
ctx.input = { id: 'scheduled', kind: 'unknown' };
await assert.rejects(() => exportCsv(ctx), /Choose a participants or winners export/);
console.log('Scheduled draw and export checks passed: deadlines, replay, all participant pages, saved winners and CSV safety.');
