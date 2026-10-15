// node scripts/check-campaigns.mjs [--cms-check]
import assert from 'node:assert/strict';
import { actionPreset, campaignDateError, campaignSlug, csvCell, entryCount, isOpen, parseCampaign, pickWinners, publicCampaign, qualifiesForDraw, safeUrl } from '../src/plugins/campaigns/model.ts';
import { hasRichText, sanitizeCampaignHtml } from '../src/plugins/campaigns/content.ts';
assert.equal(campaignSlug('Dévelopers’ Giveaway #2'), 'developers-giveaway-2');
assert.ok(campaignSlug('A lengthy campaign title '.repeat(10)).length <= 100);
assert.ok(campaignDateError('', 'invalid'));
assert.equal(campaignDateError('2027-01-01T00:00:00Z', '2027-01-01T00:00:01Z'), '');
const clean = sanitizeCampaignHtml('<h1>Heading</h1><p><strong>Bold</strong><a href="javascript:alert(1)" onclick="bad()">Link</a></p><script>alert(1)</script>');
assert.match(clean, /<h2>Heading<\/h2>/);
assert.doesNotMatch(clean, /javascript:|onclick|script/);
assert.equal(hasRichText('<p>&nbsp;</p>'), false);
assert.match(actionPreset('linkedin_like').instructions, /confirm/);
const template = { slug: 'campaign-check', title: 'Check', description: 'Description', prize: 'Prize', rules: 'Rules', startsAt: '2026-01-01T00:00:00Z', endsAt: '2027-01-01T00:00:00Z', visibility: 'private', status: 'published', winnerCount: 1, actions: [{ id: 'question', type: 'question', title: 'Question', url: '', answer: 'private-answer', points: 100 }] };
const c = parseCampaign(template, 'check');
assert.ok(c.actions.every(a => a.required && a.points === undefined));
assert.equal(c.invites.length, 0, 'No invitation restriction');
assert.ok(!JSON.stringify(publicCampaign(c)).includes('private-answer'));
assert.equal(isOpen(c, Date.parse(c.startsAt)), true);
assert.equal(isOpen(c, Date.parse(c.endsAt)), false);
const p = { entered: true, verifiedAt: c.startsAt, consentAt: c.startsAt, submissions: { question: { status: 'approved', submittedAt: c.startsAt, points: 100 } } };
assert.equal(qualifiesForDraw(c, p), true);
assert.equal(qualifiesForDraw(c, { ...p, verifiedAt: undefined, registeredAt: c.startsAt }), true);
assert.equal(qualifiesForDraw(c, { ...p, verifiedAt: undefined, registeredAt: c.endsAt }), false);
assert.equal(qualifiesForDraw(c, { ...p, verifiedAt: undefined }), false);
assert.equal(qualifiesForDraw(c, { ...p, submissions: {} }), false);
assert.equal(qualifiesForDraw(c, { ...p, submissions: { question: { status: 'approved', submittedAt: c.endsAt } } }), false);
assert.equal(entryCount(p), 1);
assert.equal(entryCount({ ...p, entered: false }), 0);
assert.throws(() => parseCampaign({ ...template, endsAt: template.startsAt }, 'check'));
assert.throws(() => parseCampaign({ ...template, actions: [{ ...template.actions[0], type: 'proof' }] }, 'check'));
assert.throws(() => parseCampaign({ ...template, actions: [{ ...template.actions[0], type: 'linkedin_like', url: 'https://attacker.test' }] }, 'check'));
for (const type of ['linkedin_follow', 'linkedin_like']) {
  for (const url of ['https://lnkd.in/p/gZEbMkrR', 'https://www.linkedin.com/company/apac-techies/', 'https://sg.linkedin.com/in/hanwai']) {
    assert.equal(parseCampaign({ ...template, actions: [{ ...template.actions[0], type, url }] }, 'check').actions[0].url, url);
  }
  for (const url of ['https://lnkd.in.attacker.test/p/gZEbMkrR', 'https://fake-lnkd.in/p/gZEbMkrR', 'https://lnkd.in@attacker.test/p/gZEbMkrR', 'javascript:alert(1)']) {
    assert.throws(() => parseCampaign({ ...template, actions: [{ ...template.actions[0], type, url }] }, 'check'));
  }
}
for (const link of ['javascript:alert(1)', 'data:text/html,hi', '//attacker.test']) assert.throws(() => safeUrl(link));
const pool = [{ id: 'a', entries: 100 }, { id: 'b', entries: 1 }];
assert.equal(pickWinners(pool, 1, size => { assert.equal(size, 2); return 1; })[0].id, 'b');
assert.equal(new Set(pickWinners(pool, 2, () => 0).map(p => p.id)).size, 2);
assert.throws(() => pickWinners(pool, 3));
assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
console.log('Campaign model checks passed: validation, private answers, equal chances, required actions, deadlines, HTML and CSV safety.');
if (process.argv.includes('--cms-check')) await import('./check-campaign-creation.mjs');
