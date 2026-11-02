// Local-only browser test. Removes only its own submission and cooldown record.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.CHECK_SITE_URL || 'http://localhost:4321';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const dbPath = process.env.CHECK_PRESENTER_DB;
assert.ok(dbPath?.includes('/.wrangler/state/'), 'Provide the local D1 SQLite path for fixture cleanup');
const base = origin + '/_emdash/api/plugins/techies-presenters/';
const login = await fetch(origin + '/_emdash/api/auth/dev-bypass', { method: 'POST' });
assert.equal(login.status, 200);
const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
async function api(path, body) {
  const r = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { cookie, origin, 'Content-Type': 'application/json', 'X-EmDash-Request': '1' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await r.json();
  assert.ok(r.ok && result.success && result.data?.ok, JSON.stringify(result));
  return result.data;
}
const original = await api('admin/form');
let saved, requestId;
const phone = '+999' + String(Date.now()).slice(-10);
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  for (const path of ['admin/form', 'admin/submissions']) {
    const denied = await fetch(base + path);
    assert.ok([401, 403].includes(denied.status), 'Personal data and settings require admin authentication');
  }
  saved = await api('admin/save', { form: { ...original.form, themes: 'Browser check theme' }, revision: original.revision });
  const publicSettings = await (await fetch(base + 'form')).json();
  assert.equal(publicSettings.data.form.themes, 'Browser check theme');
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('request', req => { if (req.url() === base + 'submit') requestId = req.postDataJSON().requestId; });
  await page.goto(origin + '/present');
  await page.locator('#presenter-name').waitFor();
  assert.equal(await page.locator('input[type=email]').count(), 0);
  assert.equal(await page.locator('#presenter-theme option').count(), 3);
  assert.equal(await page.locator('details').count(), 0);
  if (process.env.CHECK_SCREENSHOT_DIR) {
    await mkdir(process.env.CHECK_SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: process.env.CHECK_SCREENSHOT_DIR + '/presenter-desktop.png', fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const theme = await page.locator('#presenter-theme').boundingBox();
  const terms = await page.locator('.presenter-guidelines').boundingBox();
  assert.ok(terms.y > theme.y, 'On phones, the short questions come before the guidelines');
  if (process.env.CHECK_SCREENSHOT_DIR) await page.screenshot({ path: process.env.CHECK_SCREENSHOT_DIR + '/presenter-mobile.png', fullPage: true });
  await page.locator('#presenter-name').fill('TEST — presenter form verification');
  await page.locator('#presenter-whatsapp').fill(phone);
  await page.locator('#presenter-project').fill('Temporary browser test: Astro community project. This record will be removed.');
  await page.locator('#presenter-theme').selectOption('Browser check theme');
  await page.locator('button[type=submit]').click();
  assert.equal(requestId, undefined, 'No submission before consent');
  await page.locator('input[name=consent]').check();
  await page.locator('button[type=submit]').click();
  await page.locator('#presenter-success').waitFor({ state: 'visible' });
  const list = await api('admin/submissions');
  const entry = list.items.find(item => item.id === requestId);
  assert.equal(entry.data.whatsapp, phone);
  assert.equal(entry.data.guidelines, original.form.guidelines);
  assert.equal(entry.data.theme, 'Browser check theme');
  const admin = await browser.newContext();
  await admin.addCookies(login.headers.getSetCookie().map(value => { const pair = value.split(';')[0]; const i = pair.indexOf('='); return { name: pair.slice(0, i), value: pair.slice(i + 1), url: origin }; }));
  const adminPage = await admin.newPage();
  await adminPage.goto(origin + '/_emdash/admin/plugins/techies-presenters/presenters');
  await adminPage.getByRole('heading', { name: 'Presenter interest', exact: true }).waitFor();
  await adminPage.getByRole('tab', { name: /Responses/ }).click();
  await adminPage.getByText('TEST — presenter form verification', { exact: true }).waitFor();
  await adminPage.getByRole('tab', { name: 'Questions', exact: true }).click();
  await adminPage.getByRole('button', { name: 'Edit Theme', exact: true }).click();
  await adminPage.getByRole('heading', { name: 'Dropdown options', exact: true }).waitFor();
  await adminPage.getByLabel('Theme 1', { exact: true }).fill('AI systems');
  await adminPage.getByRole('button', { name: 'Add option', exact: true }).click();
  await adminPage.getByLabel('Theme 2', { exact: true }).fill('Architecture trade-offs');
  assert.match(await adminPage.getByRole('button', { name: 'Edit Theme', exact: true }).textContent(), /AI systems · Architecture trade-offs/, 'Preview updates as options are edited');
  await adminPage.getByRole('button', { name: 'Save form', exact: true }).click();
  await adminPage.getByText('Form saved. The public page now uses these settings.', { exact: true }).waitFor();
  saved = await api('admin/form');
  assert.equal(saved.form.themes, 'AI systems\nArchitecture trade-offs');
  await page.reload();
  await page.locator('#presenter-theme option[value="AI systems"]').waitFor({ state: 'attached' });
  await adminPage.getByRole('tab', { name: 'Settings', exact: true }).click();
  await adminPage.getByLabel('Confirmation heading', { exact: true }).waitFor();
  await adminPage.getByRole('tab', { name: 'Questions', exact: true }).click();
  await adminPage.getByRole('tab', { name: 'Questions', exact: true }).press('ArrowRight');
  assert.equal(await adminPage.getByRole('tab', { name: /Responses/ }).getAttribute('aria-selected'), 'true', 'Tabs support keyboard navigation');
  await adminPage.getByRole('tab', { name: /Responses/ }).press('Home');
  await adminPage.getByRole('heading', { name: 'Presenter interest', exact: true }).scrollIntoViewIfNeeded();
  if (process.env.CHECK_SCREENSHOT_DIR) await adminPage.screenshot({ path: process.env.CHECK_SCREENSHOT_DIR + '/presenter-admin.png', fullPage: true });
  await adminPage.setViewportSize({ width: 390, height: 844 });
  assert.ok(await adminPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Builder has no horizontal overflow on phones');
  await adminPage.getByRole('heading', { name: 'Presenter interest', exact: true }).scrollIntoViewIfNeeded();
  if (process.env.CHECK_SCREENSHOT_DIR) await adminPage.screenshot({ path: process.env.CHECK_SCREENSHOT_DIR + '/presenter-admin-mobile.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('Presenter browser checks passed: admin editing, private records, consent, saved submission, desktop/mobile layout, admin UI.');
} finally {
  await browser.close();
  if (saved) await api('admin/save', { form: original.form, revision: saved.revision });
  const db = new DatabaseSync(dbPath); db.exec('PRAGMA busy_timeout=5000');
  if (requestId) db.prepare("DELETE FROM _plugin_storage WHERE plugin_id = 'techies-presenters' AND collection = 'submissions' AND id = ?").run(requestId);
  db.prepare("DELETE FROM _plugin_storage WHERE plugin_id = 'techies-presenters' AND collection = 'cooldowns' AND id = ?").run(createHash('sha256').update(phone).digest('hex'));
  db.close();
}
