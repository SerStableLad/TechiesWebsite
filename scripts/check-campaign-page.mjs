// Local-only public UI check; removes its own temporary campaign.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.CHECK_SITE_URL || 'http://127.0.0.1:4321';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const auth = await fetch(origin + '/_emdash/api/auth/dev-bypass', { method: 'POST' });
assert.equal(auth.status, 200);
const cookie = auth.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
async function api(path, body, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(origin + '/_emdash/api/' + path, { method, headers: { cookie, origin, 'content-type': 'application/json', 'X-EmDash-Request': '1' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json();
  assert.ok(response.ok && result.success && result.data?.ok !== false, JSON.stringify(result));
  return result.data;
}
const blocks = text => [{ _type: 'block', _key: crypto.randomUUID(), style: 'normal', markDefs: [], children: [{ _type: 'span', _key: crypto.randomUUID(), text, marks: [] }] }];
const nonce = Date.now(), slug = `public-ui-check-${nonce}`;
let contentId, campaignId;
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  const doc = await api('content/campaigns', { slug, status: 'draft', data: {
    title: 'Your next great build starts here', prize: 'A developer desk upgrade', image: { src: '/brand/techies-social.png' },
    description: blocks('A little more room for your next big idea. Enter our community giveaway for a developer desk upgrade. Complete both actions below to qualify for the draw.'),
    rules: blocks('Open to the Techies community. One entry per person. Complete every action before entries close.'),
    visibility: 'private', winner_count: 1,
    entry_window: { startsAt: new Date(nonce - 60000).toISOString(), endsAt: new Date(nonce + 86400000 * 7).toISOString() },
    actions: [{ id: 'follow', type: 'linkedin_follow', title: 'Follow Techies on LinkedIn', url: 'https://lnkd.in/p/gZEbMkrR' }, { id: 'question', type: 'question', title: 'What are you building next?', url: '' }],
  } });
  contentId = doc.item.id;
  campaignId = doc.item.data.campaign_key;
  await api('plugins/techies-campaigns/admin/launch', { contentId, contentRevision: doc._rev });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  let registrations = 0;
  page.on('request', request => { if (request.url().endsWith('/techies-campaigns/register')) registrations++; });
  await page.goto(origin + '/campaigns/' + slug);
  const overview = await page.locator('.campaign-overview').boundingBox();
  const widget = await page.locator('.campaign-widget').boundingBox();
  assert.ok(widget.x > overview.x + overview.width, 'Giveaway widget sits beside the campaign details');
  assert.equal(await page.locator('.campaign-widget .campaign-image').count(), 1);
  assert.equal(await page.getByText(/Report giveaway|Run similar campaign/).count(), 0);
  assert.equal(await page.locator('.campaign-terms').isVisible(), true, 'Rules stay directly visible');
  assert.equal(await page.locator('.campaign-page details').count(), 0, 'No nested disclosures');
  assert.equal(await page.locator('.campaign-stats, .campaign-widget-footer, .campaign-organiser').count(), 0);
  assert.equal(await page.getByRole('timer', { name: 'Campaign countdown' }).count(), 1);
  assert.equal(await page.getByRole('heading', { name: 'Complete your entry', exact: true }).count(), 0);
  assert.equal(await page.getByLabel('Your name', { exact: true }).isVisible(), true, 'Email entry stays directly visible');
  assert.equal(await page.getByRole('button', { name: 'Continue', exact: true }).count(), 0);
  assert.equal(await page.getByText('Your address stays private and is not added to a mailing list. Use this browser to return to your entry.', { exact: true }).count(), 0);
  if (process.env.CHECK_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.CHECK_SCREENSHOT_DIR}/campaign-public-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow on mobile');
  const mobileOverview = await page.locator('.campaign-overview').boundingBox();
  const mobileWidget = await page.locator('.campaign-widget').boundingBox();
  assert.ok(mobileWidget.y >= mobileOverview.y + mobileOverview.height, 'Mobile uses one column');
  if (process.env.CHECK_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.CHECK_SCREENSHOT_DIR}/campaign-public-mobile.png`, fullPage: true });
  const email = `public-ui-${nonce}@example.test`;
  const follow = page.locator('.campaign-action').filter({ hasText: 'Follow Techies on LinkedIn' });
  await follow.getByRole('button', { name: 'I’ve completed this action', exact: true }).click();
  assert.equal(await page.getByLabel('Your name', { exact: true }).evaluate(input => input.validity.valueMissing), true);
  assert.equal(registrations, 0, 'Missing details do not register an entry');
  await page.getByLabel('Your name', { exact: true }).fill('UI check');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await follow.getByRole('button', { name: 'I’ve completed this action', exact: true }).click();
  assert.equal(registrations, 0, 'Consent is required before registration');
  await page.getByLabel('I agree to the campaign rules and eligibility', { exact: false }).check();
  assert.equal(await follow.getByRole('link', { name: /Open Follow Techies on LinkedIn/ }).getAttribute('href'), 'https://lnkd.in/p/gZEbMkrR');
  await follow.getByRole('button', { name: 'I’ve completed this action', exact: true }).click();
  await follow.getByText('This action is complete.', { exact: true }).waitFor();
  const question = page.locator('.campaign-action').filter({ hasText: 'What are you building next?' });
  await question.getByLabel('Your answer', { exact: true }).fill('A community app');
  await question.getByRole('button', { name: 'Submit answer', exact: true }).click();
  await page.getByRole('heading', { name: 'You’re entered', exact: true }).waitFor();
  assert.equal(registrations, 1, 'The first action registers once; later actions reuse the session');
  assert.equal(await page.locator('.campaign-action-state').filter({ hasText: 'Completed' }).count(), 2);
  assert.ok(!(await api('dev/emails')).items.some(item => JSON.stringify(item).includes(email)), 'Registration sends no verification email');
  const stored = await api(`plugins/techies-campaigns/admin/detail?id=${campaignId}`);
  assert.equal(stored.participants.length, 1);
  assert.equal(stored.participants[0].qualified, true, 'Registration without email verification can qualify');
  const duplicate = await fetch(origin + '/_emdash/api/plugins/techies-campaigns/register', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ campaignId, email, name: 'Impersonator', consent: true }) });
  const denied = await duplicate.json();
  assert.equal(denied.data.ok, false, 'An existing email must not grant another browser access');
  assert.equal(denied.data.token, undefined);
  for (const invalid of [{ email: 'invalid' }, { name: '' }, { consent: false }]) {
    const response = await fetch(origin + '/_emdash/api/plugins/techies-campaigns/register', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ campaignId, email: `invalid-${nonce}@example.test`, name: 'Boundary check', consent: true, ...invalid }) });
    assert.equal((await response.json()).data.ok, false, 'Invalid registration is rejected');
  }
  await page.reload();
  await page.getByRole('heading', { name: 'You’re entered', exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log('Public campaign checks passed: countdown, flat desktop/mobile layout, code-free registration, duplicate protection, actions, qualification and session restoration.');
} finally {
  await browser.close();
  if (campaignId) await api('plugins/techies-campaigns/admin/archive', { id: campaignId });
  if (contentId) await api(`content/campaigns/${contentId}`, undefined, 'DELETE');
}
