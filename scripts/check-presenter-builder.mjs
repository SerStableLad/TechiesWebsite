// Local-only end-to-end check; removes its own test submission.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.CHECK_SITE_URL || 'http://localhost:4321';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const base = origin + '/_emdash/api/plugins/emdash-forms/';
const login = await fetch(origin + '/_emdash/api/auth/dev-bypass', { method: 'POST' });
assert.equal(login.status, 200);
const cookies = login.headers.getSetCookie();
const cookie = cookies.map(value => value.split(';')[0]).join('; ');
async function api(path, body) {
  const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { cookie, origin, 'Content-Type': 'application/json', 'X-EmDash-Request': '1' }, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json();
  assert.ok(response.ok && result.success, JSON.stringify(result));
  return result.data;
}
const forms = await api('forms/list');
const form = forms.items.find(item => item.slug === 'roastmytechstack-presenter-interest');
assert.ok(form);
const name = 'TEST presenter builder ' + Date.now();
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  const denied = await fetch(base + 'submissions/list', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ formId: form.id }) });
  assert.ok([401, 403].includes(denied.status), 'Responses must be private');
  const rejected = await fetch(base + 'submit', { method: 'POST', headers: { 'Content-Type': 'application/json', origin }, body: JSON.stringify({ formId: form.id, data: { name, whatsapp: '+6581234567', project: 'Temporary check', theme: 'Help me choose' } }) });
  const rejection = await rejected.json();
  assert.ok(!rejection.success || !rejection.data?.success, 'Server must reject missing consent');
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/present', { waitUntil: 'networkidle' });
  await page.locator('input[name=name]').waitFor();
  for (const [width, height] of [[1440, 1050], [390, 844]]) {
    await page.setViewportSize({ width, height });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow');
    if (process.env.CHECK_SCREENSHOT_DIR) {
      await mkdir(process.env.CHECK_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: `${process.env.CHECK_SCREENSHOT_DIR}/presenter-builder-${width}.png`, fullPage: true });
    }
  }
  await page.locator('input[name=name]').fill(name);
  await page.locator('input[name=whatsapp]').fill('+6581234567');
  await page.locator('textarea[name=project]').fill('Temporary test: Astro project and architecture discussion.');
  await page.locator('input[name=theme]').fill('Help me choose');
  await page.getByRole('button', { name: 'Express interest', exact: true }).click();
  assert.equal(await page.locator('input[name=consent]').evaluate(input => input.validity.valueMissing), true);
  await page.locator('input[name=consent]').check();
  await page.getByRole('button', { name: 'Express interest', exact: true }).click();
  await page.locator('.ec-form-status--success').waitFor();
  const entries = await api('submissions/list', { formId: form.id });
  const entry = entries.items.find(item => item.data.name === name);
  assert.ok(entry, 'Submission saved in Forms inbox');
  assert.ok(entry.data.consent);
  const csv = await api('submissions/export', { formId: form.id, format: 'csv' });
  assert.ok(csv.data.includes(name), 'CSV export includes response');
  await page.context().addCookies(cookies.map(value => {
    const pair = value.split(';')[0]; const split = pair.indexOf('=');
    return { name: pair.slice(0, split), value: pair.slice(split + 1), url: origin };
  }));
  await page.goto(origin + '/_emdash/admin/plugins/emdash-forms');
  await page.getByText(form.name, { exact: true }).first().waitFor();
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await page.getByRole('heading', { name: 'Edit Form', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Fields', exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log('Passed: plugin admin, desktop/mobile form, required consent, private saved response, CSV export.');
} finally {
  await browser.close();
  const entries = await api('submissions/list', { formId: form.id });
  for (const item of entries.items.filter(item => item.data.name === name)) await api('submissions/delete', { id: item.id });
}
