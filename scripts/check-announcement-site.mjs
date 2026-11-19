import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";

const origin = process.env.CHECK_SITE_URL || "http://localhost:4322";
assert.ok(
	["localhost", "127.0.0.1"].includes(new URL(origin).hostname),
	"Use a local test site only",
);
const auth = await fetch(`${origin}/_emdash/api/auth/dev-bypass`, { method: "POST" });
assert.ok(auth.ok);
const cookie = auth.headers
	.getSetCookie()
	.map((value) => value.split(";")[0])
	.join("; ");
async function request(path, method = "GET", body) {
	const response = await fetch(`${origin}/_emdash/api/${path}`, {
		method,
		headers: { cookie, origin, "Content-Type": "application/json", "X-EmDash-Request": "1" },
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
	return { response, result: await response.json() };
}
async function api(path, method = "GET", body) {
	const { response, result } = await request(path, method, body);
	assert.ok(response.ok && result.success, JSON.stringify(result));
	return result.data;
}
const ids = [];
const prefix = `announcement-check-${Date.now()}`;
const future = new Date(Date.now() + 3_600_000).toISOString();
const past = new Date(Date.now() - 60_000).toISOString();
async function create(slug, data) {
	const created = await api("content/posts", "POST", {
		slug: `${prefix}-${slug}`,
		status: "draft",
		data: { title: `Test announcement ${slug}`, ...data },
	});
	ids.push(created.item.id);
	return created.item.id;
}
async function publish(id) {
	const current = await api(`content/posts/${id}`);
	await api(`content/posts/${id}/publish`, "POST", { _rev: current._rev });
}
async function save(id, data) {
	const current = await api(`content/posts/${id}`);
	await api(`content/posts/${id}`, "PUT", { _rev: current._rev, data });
}
const html = async () => (await fetch(origin)).text();
const evidence = new URL("../.emdash/screenshots/announcements/", import.meta.url).pathname;
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch();
try {
	const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
	const page = await context.newPage();
	const errors = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto(origin);
	await page.screenshot({ path: `${evidence}before-home.png` });
	const rejected = await request("content/posts", "POST", {
		slug: `${prefix}-invalid`,
		data: { title: "Missing expiry", announcement_banner: true },
	});
	if (rejected.result.success && rejected.result.data?.item?.id)
		ids.push(rejected.result.data.item.id);
	assert.ok(!rejected.response.ok && !rejected.result.success, "Enabled banners require an expiry");
	const first = await create("first", {
		announcement_banner: true,
		announcement_until: future,
		excerpt: "A timed community announcement.",
	});
	assert.ok(!(await html()).includes(`${prefix}-first`), "Draft banners stay private");
	await publish(first);
	assert.match(await html(), new RegExp(`${prefix}-first`));
	const expired = await create("expired", { announcement_banner: true, announcement_until: past });
	await publish(expired);
	assert.match(
		await html(),
		new RegExp(`${prefix}-first`),
		"Expired posts do not hide an active banner",
	);
	const latest = await create("latest", {
		announcement_banner: true,
		announcement_until: future,
		excerpt: "A timed community announcement.",
	});
	await publish(latest);
	await page.goto(origin);
	const banner = page.getByRole("complementary", { name: "Announcement", exact: true });
	await banner.waitFor();
	assert.match(await banner.innerText(), /Test announcement latest/);
	assert.equal(await banner.getByRole("link").getAttribute("href"), `/posts/${prefix}-latest`);
	assert.match(await banner.getByRole("link").innerText(), /^Learn more/);
	const accessibility = await new AxeBuilder({ page })
		.include(".announcement-banner")
		.withTags(["wcag2a", "wcag2aa"])
		.analyze();
	assert.deepEqual(accessibility.violations, [], "Banner text and controls are accessible");
	for (const [name, path] of [
		["home", "/"],
		["members", "/members"],
		["summaries", "/category/event-summaries"],
		["partnerships", "/category/partnership-announcement"],
		["post", "/posts/roast-7"],
		["events", "/events"],
		["present", "/present"],
	]) {
		assert.equal((await page.goto(origin + path)).status(), 200);
		await banner.waitFor();
		if (name === "present")
			await page
				.frameLocator('iframe[title="Roast My TechStack presenter registration"]')
				.getByText("Presenter Interest Form", { exact: true })
				.waitFor({ timeout: 30_000 });
		await page.screenshot({ path: `${evidence}${name}-desktop.png` });
		await page.setViewportSize({ width: 390, height: 844 });
		assert.ok(
			await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
			`${path}: mobile fits`,
		);
		await page.screenshot({ path: `${evidence}${name}-mobile.png` });
		await page.setViewportSize({ width: 1440, height: 1000 });
	}
	const frame = page.getByTitle("Roast My TechStack presenter registration");
	assert.equal(
		await frame.getAttribute("src"),
		"https://airtable.com/embed/appHBgwONjOo1OWbJ/pagsVh4kFQ8DRzT7Y/form",
	);
	await page.goto(origin);
	const dismiss = banner.getByRole("button", { name: "Dismiss announcement", exact: true });
	await dismiss.focus();
	await page.keyboard.press("Enter");
	assert.equal(await banner.count(), 0, "Announcement can be dismissed with the keyboard");
	await page.reload();
	assert.equal(await banner.count(), 0, "Dismissal survives reloads");
	await page.goto(`${origin}/category/event-summaries`);
	assert.equal(await banner.count(), 0, "Dismissal applies across pages");
	await page.screenshot({ path: `${evidence}dismissed-summaries.png` });
	const freshContext = await browser.newContext();
	const freshPage = await freshContext.newPage();
	await freshPage.goto(origin);
	await freshPage.getByRole("complementary", { name: "Announcement", exact: true }).waitFor();
	await freshContext.close();
	await save(latest, { announcement_text: "Updated community news" });
	await page.goto(origin);
	assert.equal(await banner.count(), 0, "Draft changes do not reset dismissal");
	await publish(latest);
	await page.reload();
	await banner.waitFor();
	assert.equal(
		await banner.locator("p").innerText(),
		"Updated community news",
		"Published changes show again",
	);
	await dismiss.click();
	const replacement = await create("replacement", {
		announcement_banner: true,
		announcement_until: future,
		announcement_text: "Updated community news",
	});
	await publish(replacement);
	await page.reload();
	await banner.waitFor();
	assert.equal(
		await banner.getByRole("link").getAttribute("href"),
		`/posts/${prefix}-replacement`,
		"A different announcement appears even with identical text",
	);
	await save(replacement, { announcement_until: past });
	await publish(replacement);
	await page.reload();
	assert.equal(
		await banner.count(),
		0,
		"Previously dismissed announcements stay dismissed on fallback",
	);
	await save(latest, { announcement_text: null });
	await publish(latest);
	await page.reload();
	await banner.waitFor();
	const blockedContext = await browser.newContext();
	await blockedContext.addInitScript(() => {
		for (const method of ["getItem", "setItem"]) {
			const original = Storage.prototype[method];
			Storage.prototype[method] = function (key, ...args) {
				if (key.startsWith("techies-dismissed-announcement:")) throw new Error("Storage blocked");
				return original.call(this, key, ...args);
			};
		}
	});
	const blockedPage = await blockedContext.newPage();
	await blockedPage.goto(origin);
	await blockedPage.getByRole("button", { name: "Dismiss announcement", exact: true }).click();
	assert.equal(
		await blockedPage.getByRole("complementary", { name: "Announcement", exact: true }).count(),
		0,
		"Dismissal still works when browser storage is blocked",
	);
	await blockedContext.close();
	// API authentication is separate from the browser context.
	await page.context().addCookies(
		cookie.split("; ").map((value) => ({
			name: value.slice(0, value.indexOf("=")),
			value: value.slice(value.indexOf("=") + 1),
			url: origin,
		})),
	);
	await page.goto(`${origin}/_emdash/admin/content/posts/${latest}`);
	await page.locator(".announcement-option").waitFor();
	const welcome = page.getByRole("button", { name: "Get Started", exact: true });
	if (await welcome.isVisible()) await welcome.click();
	const checkbox = page.getByRole("checkbox", { name: "Announcement banner", exact: true });
	const settings = page.getByLabel("Settings", { exact: true }).filter({ has: checkbox });
	assert.equal(
		await settings.getByRole("checkbox", { name: "Announcement banner", exact: true }).count(),
		1,
		"Announcement settings belong in the post settings sidebar",
	);
	assert.equal(await settings.getByLabel("Display until", { exact: true }).count(), 1);
	assert.equal(await checkbox.isChecked(), true);
	await page.getByLabel("Display until", { exact: true }).waitFor();
	assert.ok(
		await page
			.locator(".announcement-expiry")
			.evaluate((element) => element.scrollWidth <= element.clientWidth),
		"Announcement date and help text fit within the sidebar",
	);
	await page.locator(".announcement-expiry").scrollIntoViewIfNeeded();
	await page.screenshot({ path: `${evidence}editor-enabled.png` });
	const expiry = page.getByLabel("Display until", { exact: true });
	assert.equal(await expiry.getAttribute("type"), "date", "Expiry picker has no time control");
	const bannerText = page.getByLabel("Banner text", { exact: true });
	const buttonText = page.getByLabel("Button text", { exact: true });
	await bannerText.fill("Community news <not markup>");
	await buttonText.fill("Read update");
	await expiry.fill("2030-03-10");
	await page.getByRole("button", { name: "Save", exact: true }).click();
	await page.getByRole("button", { name: "Save", exact: true }).waitFor({ state: "hidden" });
	const saved = await api(`content/posts/${latest}`);
	assert.equal(saved.item.data.announcement_text, "Community news <not markup>");
	assert.equal(saved.item.data.announcement_button_text, "Read update");
	const deadline = new Date(saved.item.data.announcement_until);
	assert.equal(deadline.getHours(), 0);
	assert.equal(deadline.getDate(), 11, "Banner expires after the entire selected date");
	await publish(latest);
	await page.goto(origin);
	assert.equal(await banner.locator("p").innerText(), "Community news <not markup>");
	assert.equal(await banner.locator("not").count(), 0, "Custom banner text is escaped");
	await banner.getByRole("link", { name: /^Read update/ }).waitFor();
	assert.ok((await banner.boundingBox()).height <= 64, "Short desktop announcements stay compact");
	const customAccessibility = await new AxeBuilder({ page })
		.include(".announcement-banner")
		.withTags(["wcag2a", "wcag2aa"])
		.analyze();
	assert.deepEqual(
		customAccessibility.violations,
		[],
		"Orange banner and subtle button remain accessible",
	);
	await page.screenshot({ path: `${evidence}home-custom-text.png` });
	await page.evaluate(() => window.scrollTo(0, 700));
	assert.equal(
		Math.round((await page.locator(".site-header").boundingBox()).y),
		0,
		"Menu stays at the top while scrolling",
	);
	assert.equal(
		Math.round((await banner.boundingBox()).y),
		Math.round((await page.locator(".site-header").boundingBox()).height),
		"Announcement stays directly below the menu while scrolling",
	);
	await page.screenshot({ path: `${evidence}sticky-desktop.png` });
	await page
		.locator("main h2")
		.first()
		.evaluate((element) => element.scrollIntoView({ block: "start" }));
	assert.ok(
		(await page.locator("main h2").first().boundingBox()).y >=
			(await page.locator(".site-chrome").boundingBox()).height,
		"Anchor targets remain visible below the pinned menu and announcement",
	);
	await page.evaluate(() => window.scrollTo(0, 0));
	await page.setViewportSize({ width: 390, height: 844 });
	assert.ok(
		await banner.evaluate((element) => element.scrollWidth <= element.clientWidth),
		"Mobile banner fits",
	);
	await page.screenshot({ path: `${evidence}home-custom-text-mobile.png` });
	await page.evaluate(() => window.scrollTo(0, 700));
	assert.equal(
		Math.round((await page.locator(".site-header").boundingBox()).y),
		0,
		"Mobile menu stays pinned",
	);
	assert.equal(
		Math.round((await banner.boundingBox()).y),
		Math.round((await page.locator(".site-header").boundingBox()).height),
		"Mobile announcement stays pinned below the menu",
	);
	await page.getByRole("button", { name: "Menu", exact: true }).click();
	await page
		.getByRole("navigation", { name: "Primary navigation" })
		.getByRole("link")
		.first()
		.waitFor();
	await page.keyboard.press("Escape");
	await page.screenshot({ path: `${evidence}sticky-mobile.png` });
	await page.setViewportSize({ width: 1440, height: 1000 });
	await page.goto(`${origin}/_emdash/admin/content/posts/${latest}`);
	await bannerText.waitFor();
	assert.equal(await expiry.inputValue(), "2030-03-10");
	assert.equal(await buttonText.inputValue(), "Read update");
	await page.screenshot({ path: `${evidence}editor-enabled.png` });
	await page
		.context()
		.addCookies([{ name: "emdash-locale", value: "ar", url: `${origin}/_emdash` }]);
	await page.reload();
	await checkbox.waitFor();
	assert.equal(await page.locator("html").getAttribute("dir"), "rtl");
	await page.locator(".announcement-expiry").scrollIntoViewIfNeeded();
	await page.screenshot({ path: `${evidence}editor-arabic.png` });
	await page
		.context()
		.addCookies([{ name: "emdash-locale", value: "en", url: `${origin}/_emdash` }]);
	await page.reload();
	await checkbox.waitFor();
	await checkbox.uncheck();
	assert.equal(await bannerText.isVisible(), false, "Banner text hides when unchecked");
	assert.equal(await buttonText.isVisible(), false, "Button text hides when unchecked");
	assert.equal(
		await page.locator(".announcement-expiry").isVisible(),
		false,
		"Expiry field hides when unchecked",
	);
	await page.screenshot({ path: `${evidence}editor-disabled.png` });
	await page.goto(origin);
	assert.match(
		await banner.innerText(),
		/Community news <not markup>/,
		"Unsaved changes do not change the public banner",
	);
	await save(latest, { announcement_until: past });
	assert.match(await html(), new RegExp(`${prefix}-latest`), "Draft changes remain private");
	await publish(latest);
	assert.match(
		await html(),
		new RegExp(`${prefix}-first`),
		"Expiry falls back to the next active post",
	);
	await save(first, { announcement_until: new Date(Date.now() + 60_000).toISOString() });
	await publish(first);
	await page.clock.install();
	await page.goto(origin);
	await banner.waitFor();
	await page.clock.fastForward(61_000);
	assert.equal(await banner.count(), 0, "An open page removes its banner at expiry");
	assert.deepEqual(errors, [], "No browser runtime errors");
} finally {
	await browser.close();
	for (const id of ids) {
		const current = await api(`content/posts/${id}`);
		await api(`content/posts/${id}`, "DELETE", { _rev: current._rev });
	}
}
console.log(
	"Banner privacy, scheduling, expiry, fallback, editor controls, mobile layout and presenter embed checks passed. Only temporary test posts moved to trash.",
);
