import assert from 'node:assert/strict';
import { announcementLink, isAnnouncementActive } from '../src/utils/announcement.ts';

const now = Date.parse('2026-10-09T12:00:00Z');
const active = { title: 'Community update', starts_at: '2026-10-09T20:00:00+08:00', ends_at: '2026-10-09T13:00:00Z' };
assert.equal(isAnnouncementActive(active, now), true, 'Start is inclusive; timezone offsets are respected');
assert.equal(isAnnouncementActive(active, now - 1), false, 'Future announcement hidden');
assert.equal(isAnnouncementActive(active, now + 3600000), false, 'End is exclusive');
assert.equal(isAnnouncementActive({ title: 'Always on' }, now), true);
for (const data of [{ title: ' ' }, { ...active, starts_at: 'invalid' }, { ...active, ends_at: 'invalid' }, { ...active, ends_at: active.starts_at }]) {
  assert.equal(isAnnouncementActive(data, now), false, 'Empty, invalid or reversed windows stay hidden');
}
console.log('Announcement schedule checks passed.');
assert.equal(announcementLink(' https://example.com/campaign '), 'https://example.com/campaign');
assert.equal(announcementLink('/events?from=banner'), '/events?from=banner');
for (const link of ['', 'javascript:alert(1)', 'data:text/html,hello', '//example.com', 'https://', 'events']) {
  assert.equal(announcementLink(link), null, 'Unsafe or invalid links rejected');
}

if (process.argv.includes('--cms-check')) {
  const origin = process.env.CHECK_SITE_URL || 'http://127.0.0.1:4321';
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname), 'CMS check is local-only');
  const auth = await fetch(origin + '/_emdash/api/auth/dev-bypass', { method: 'POST' });
  assert.equal(auth.status, 200);
  const cookie = auth.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  async function api(path, method = 'GET', body) {
    const response = await fetch(origin + '/_emdash/api/' + path, {
      method, headers: { cookie, origin, 'content-type': 'application/json', 'X-EmDash-Request': '1' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await response.json();
    assert.ok(response.ok, JSON.stringify(result));
    return result.data;
  }
  const title = `Announcement verification ${Date.now()}`;
  const { item } = await api('content/announcements', 'POST', { slug: `verification-${Date.now()}`, status: 'draft', data: { title } });
  const html = async () => (await (await fetch(origin + '/')).text());
  async function publish(data) {
    const current = await api(`content/announcements/${item.id}`);
    await api(`content/announcements/${item.id}`, 'PUT', { _rev: current._rev, data });
    await api(`content/announcements/${item.id}/publish`, 'POST', {});
  }
  try {
    assert.ok(!(await html()).includes(title), 'Draft hidden');
    await publish({ title, starts_at: new Date(Date.now() + 3600000).toISOString() });
    assert.ok(!(await html()).includes(title), 'Future announcement hidden');
    await publish({ title, starts_at: new Date(Date.now() - 7200000).toISOString(), ends_at: new Date(Date.now() - 3600000).toISOString() });
    assert.ok(!(await html()).includes(title), 'Expired announcement hidden');
    await publish({ title, starts_at: new Date(Date.now() - 60000).toISOString(), ends_at: new Date(Date.now() + 3600000).toISOString() });
    const activeHtml = await html();
    assert.ok(activeHtml.includes(title), 'Active announcement renders');
    assert.ok(activeHtml.indexOf(title) < activeHtml.indexOf('class="site-header"'), 'Strip above navigation');
    assert.match(activeHtml, /aria-label="Dismiss announcement"/);
    assert.ok((await (await fetch(origin + '/members')).text()).includes(title), 'Shared across pages');
    await publish({ title, cta_label: 'See events', cta_url: '/events' });
    assert.match(await html(), /class="announcement-cta"[^>]*href="\/events"[^>]*>See events<\/a>/);
    assert.doesNotMatch((await html()).match(/<a class="announcement-cta"[^>]*>/)[0], /target=/, 'Current tab by default');
    await publish({ title, cta_label: 'See events', cta_url: '/events', cta_new_tab: true });
    const newTabLink = (await html()).match(/<a class="announcement-cta"[^>]*>/)[0];
    assert.match(newTabLink, /target="_blank"/);
    assert.match(newTabLink, /rel="noopener noreferrer"/);
    assert.match(newTabLink, /aria-label="See events \(opens in new tab\)"/);
    await publish({ title, cta_label: 'See events', cta_url: '/events', cta_new_tab: false });
    assert.doesNotMatch((await html()).match(/<a class="announcement-cta"[^>]*>/)[0], /target=/, 'Unchecked returns to current tab');
    await publish({ title, cta_label: 'Unsafe CTA', cta_url: 'javascript:alert(1)' });
    assert.ok(!(await html()).includes('class="announcement-cta"'), 'Unsafe CTA not rendered');
  } finally {
    await api(`content/announcements/${item.id}`, 'DELETE');
  }
  assert.ok(!(await html()).includes(title), 'Temporary announcement cleaned up');
  console.log('Announcement CMS checks passed: draft privacy, scheduling, shared layout and cleanup.');
}
