// Isolated checks: no production or local CMS records are written.
import assert from 'node:assert/strict';
import { defaultForm, parseForm, parseSubmission, themeOptions } from '../src/plugins/presenters/model.ts';
import { createPlugin } from '../src/plugins/presenters/index.ts';

const input = { name: 'Test presenter', whatsapp: '+65 (8123) 4567', project: 'A community app built with Astro.', theme: defaultForm.unsureLabel, consent: true, requestId: crypto.randomUUID(), revision: null };
assert.equal(parseSubmission(input, defaultForm).whatsapp, '+6581234567');
for (const invalid of [{ name: '' }, { whatsapp: '81234567' }, { consent: false }, { project: 'x'.repeat(3001) }, { theme: 'invented' }, { requestId: '../bad' }, { website: 'bot' }]) {
  assert.throws(() => parseSubmission({ ...input, ...invalid }, defaultForm));
}
assert.throws(() => parseSubmission(input, { ...defaultForm, open: false }));
assert.deepEqual(themeOptions({ ...defaultForm, themes: 'AI\nData\nAI\n ' }), ['AI', 'Data', defaultForm.unsureLabel]);
assert.equal(parseForm(defaultForm).title, defaultForm.title);
assert.throws(() => parseForm({ ...defaultForm, consent: '' }));
assert.throws(() => parseForm({ ...defaultForm, open: 'yes' }));

function store() {
  const rows = new Map();
  return {
    rows,
    get: async key => rows.get(key)?.value ?? null,
    getVersioned: async key => rows.get(key) ?? null,
    compareAndSet: async (key, revision, value) => {
      if ((rows.get(key)?.revision ?? null) !== revision) return { applied: false };
      const next = crypto.randomUUID(); rows.set(key, { value, revision: next }); return { applied: true, revision: next };
    },
    compareAndDelete: async (key, revision) => {
      if (rows.get(key)?.revision !== revision) return { applied: false };
      rows.delete(key); return { applied: true };
    },
  };
}
const plugin = createPlugin({ adminEntry: '/test/admin.tsx' });
const settings = store(), submissions = store(), cooldowns = store();
const context = { settings, storage: { submissions, cooldowns }, log: { error: () => {} }, request: new Request('http://localhost/submit', { headers: { origin: 'http://localhost' } }), input };
assert.equal(plugin.routes['admin/submissions'].public, false);
assert.equal(plugin.routes['admin/submissions'].permission, 'plugins:manage');
assert.equal(plugin.routes['admin/save'].public, false);
assert.equal((await plugin.routes.submit.handler(context)).ok, true);
assert.equal(submissions.rows.size, 1);
assert.equal((await submissions.get(input.requestId)).guidelines, defaultForm.guidelines);
assert.equal((await plugin.routes.submit.handler(context)).ok, true, 'Network retries are idempotent');
assert.equal(submissions.rows.size, 1);
assert.equal((await plugin.routes.submit.handler({ ...context, input: { ...input, project: 'Different' } })).ok, false);
assert.equal((await plugin.routes.submit.handler({ ...context, input: { ...input, requestId: crypto.randomUUID() } })).ok, false, 'Cooldown prevents duplicate rapid submissions');
assert.equal((await plugin.routes.submit.handler({ ...context, request: new Request('http://localhost/submit', { headers: { origin: 'https://other.test' } }) })).ok, false);
const saved = await plugin.routes['admin/save'].handler({ ...context, input: { form: { ...defaultForm, themes: 'AI systems' }, revision: null } });
assert.equal(saved.ok, true);
assert.equal((await plugin.routes['admin/save'].handler({ ...context, input: { form: defaultForm, revision: null } })).ok, false, 'Stale editors cannot overwrite settings');
assert.equal((await plugin.routes.submit.handler(context)).ok, false, 'Outdated terms require refresh');
await settings.compareAndSet('form', saved.revision, { ...saved.form, open: false });
assert.equal((await plugin.routes.submit.handler({ ...context, input: { ...input, revision: saved.revision } })).ok, false);
console.log('Presenter checks passed: validation, consent, private routes, saved guidelines, retries, cooldown, same-origin, settings conflicts and closure.');
