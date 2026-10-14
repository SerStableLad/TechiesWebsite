// Run with PLAYWRIGHT_MODULE pointing to an existing Playwright installation.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../node_modules/@emdash-cms/admin/dist/index.js', import.meta.url), 'utf8');
const context = vm.createContext({ encodeURIComponent });
for (const name of ['localMediaFileUrl', 'mediaDisplayUrl', 'getContentListImage']) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing patched function: ${name}`);
  vm.runInContext(source.slice(start, source.indexOf('\n}', start) + 2), context);
}
vm.runInContext('const INTERNAL_MEDIA_PREFIX = "/_emdash/api/media/file/";', context);
const image = context.getContentListImage;
const fields = { cover: { kind: 'image' }, featured_image: { kind: 'image' }, title: { kind: 'string' } };
assert.equal(image({ cover: { src: '/cover.png' }, featured_image: { src: '/featured.png' } }, fields).url, '/featured.png');
assert.equal(image({ featured_image: {}, cover: { id: 'asset', meta: { storageKey: 'photo one.png' } } }, fields).url, '/_emdash/api/media/file/photo%20one.png');
assert.equal(image({ cover: { provider: 'remote', previewUrl: 'https://example.test/preview.png' } }, fields).url, 'https://example.test/preview.png');
assert.equal(image({ cover: '/legacy.png' }, fields).url, '/legacy.png');
assert.equal(image({ title: '/not-an-image.png' }, fields), undefined);
assert.equal(image({ cover: {}, featured_image: null }, fields), undefined);

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.CHECK_SITE_URL || 'http://127.0.0.1:4321';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const auth = await fetch(origin + '/_emdash/api/auth/dev-bypass', { method: 'POST' });
assert.equal(auth.status, 200);
const pairs = auth.headers.getSetCookie().map(value => value.split(';')[0]);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  const browserContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await browserContext.addCookies(pairs.map(pair => {
    const i = pair.indexOf('=');
    return { name: pair.slice(0, i), value: pair.slice(i + 1), url: origin };
  }));
  const page = await browserContext.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const collection of ['campaigns', 'posts', 'programmes', 'members', 'team', 'pages', 'announcements']) {
    await page.goto(origin + '/_emdash/admin/content/' + collection);
    const welcome = page.getByRole('button', { name: 'Get Started', exact: true });
    await welcome.waitFor({ timeout: 3000 }).catch(() => {});
    if (await welcome.isVisible()) await welcome.click();
    await page.locator('table').waitFor();
    await page.getByText('Loading...', { exact: true }).waitFor({ state: 'hidden' });
    const rows = page.locator('tbody tr').filter({ has: page.locator('a[href*="/content/"]') });
    const count = await rows.count();
    assert.ok(count > 0, `${collection}: expected seeded content`);
    assert.equal(await page.getByTestId('content-thumbnail').count(), count, `${collection}: every row has a preview slot`);
    for (const row of await rows.all()) {
      const thumb = row.getByTestId('content-thumbnail');
      const box = await thumb.boundingBox();
      assert.equal(box.width, 40);
      assert.equal(box.height, 40);
      assert.ok(await thumb.evaluate(el => Boolean(el.closest('a'))), 'Thumbnail opens the editor');
    }
    console.log(`${collection}: ${count} row thumbnails`);
  }
  await page.goto(origin + '/_emdash/admin/content/posts');
  const thumbs = page.getByTestId('content-thumbnail');
  await thumbs.first().waitFor();
  const firstImage = thumbs.locator('img').first();
  await firstImage.scrollIntoViewIfNeeded();
  await firstImage.evaluate(img => img.complete || new Promise(resolve => img.addEventListener('load', resolve, { once: true })));
  assert.ok(await firstImage.evaluate(img => img.naturalWidth > 0), 'Real preview loads');
  await firstImage.evaluate(img => img.dispatchEvent(new Event('error')));
  if (await thumbs.first().locator('img').count()) await thumbs.first().locator('img').evaluate(img => img.dispatchEvent(new Event('error')));
  await thumbs.first().locator('svg').waitFor();
  const checkbox = page.locator('tbody tr').first().getByRole('checkbox');
  await checkbox.click();
  assert.equal(await checkbox.getAttribute('aria-checked'), 'true');
  await page.getByRole('button', { name: 'Title', exact: true }).click();
  assert.equal(await page.locator('th[aria-sort="descending"]').first().innerText(), 'Title');
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.getByRole('button', { name: 'Switch to dark', exact: true }).click();
  await page.getByRole('button', { name: 'Switch to light', exact: true }).waitFor();
  if (process.env.CHECK_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.CHECK_SCREENSHOT_DIR}/content-thumbnails-desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal((await thumbs.first().boundingBox()).width, 40);
  if (process.env.CHECK_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.CHECK_SCREENSHOT_DIR}/content-thumbnails-mobile.png` });
  assert.deepEqual(errors, []);
  console.log('Image selection, loading, broken-image fallback, selection, sorting and mobile sizing passed.');
} finally {
  await browser.close();
}
