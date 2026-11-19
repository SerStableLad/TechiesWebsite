import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

import { chromium } from "@playwright/test";

const origin = process.env.CHECK_SITE_URL || "http://localhost:4322";
const evidence = new URL("../.emdash/screenshots/", import.meta.url).pathname;
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch();
try {
	const page = await browser.newPage({
		viewport: { width: 1440, height: 1000 },
	});
	const errors = [];
	page.on("pageerror", (error) => errors.push(error.message));
	for (const [name, path] of [
		["home", "/"],
		["members", "/members"],
		["summaries", "/category/event-summaries"],
		["partnerships", "/category/partnership-announcement"],
		["post", "/posts/roast-7"],
	]) {
		const response = await page.goto(origin + path);
		assert.equal(response.status(), 200, path);
		await page.locator("h1").waitFor();
		assert.equal(await page.locator("h1").count(), 1, "One primary heading");
		const brokenImages = await page.evaluate(async () => {
			const images = [...document.images];
			for (const image of images) image.loading = "eager";
			await Promise.allSettled(images.map((image) => image.decode()));
			return images
				.filter(
					(image) =>
						!image.naturalWidth &&
						new URL(image.src).origin === location.origin,
				)
				.map((image) => image.src);
		});
		assert.deepEqual(brokenImages, [], `${path}: local images load`);
		await page.screenshot({
			path: `${evidence}${name}-desktop.png`,
			fullPage: true,
		});
		if (name === "members") {
			assert.equal(await page.locator(".member-card").count(), 17);
			const trigger = page.getByRole("button", { name: /Learn more/ }).first();
			await trigger.click();
			await page.getByRole("dialog").waitFor();
			await page.keyboard.press("Escape");
			assert.equal(await page.locator("dialog[open]").count(), 0);
			assert.ok(
				await trigger.evaluate((element) => element === document.activeElement),
				"Dialog restores keyboard focus",
			);
		}
		if (name === "summaries" || name === "partnerships") {
			const links = await page
				.locator(".post-card h2 a, .post-card h3 a")
				.evaluateAll((elements) =>
					elements.map((element) => element.getAttribute("href")),
				);
			assert.equal(links.length, name === "summaries" ? 6 : 2);
			assert.ok(
				links.every((link) =>
					name === "summaries"
						? link.startsWith("/posts/roast-")
						: link.startsWith("/posts/community-partner-"),
				),
				"Blog categories remain separate",
			);
		}
		await page.setViewportSize({ width: 390, height: 844 });
		await page.screenshot({
			path: `${evidence}${name}-mobile.png`,
			fullPage: true,
		});
		assert.ok(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= innerWidth,
			),
			`${path}: no mobile horizontal overflow`,
		);
		await page.setViewportSize({ width: 1440, height: 1000 });
	}
	await page.goto(origin);
	await page.setViewportSize({ width: 390, height: 844 });
	const menu = page.getByRole("button", { name: "Menu", exact: true });
	await menu.click();
	assert.equal(await menu.getAttribute("aria-expanded"), "true");
	await page
		.locator("#main-nav")
		.getByRole("link", { name: "Members", exact: true })
		.click();
	await page.getByRole("heading", { name: "Meet the members." }).waitFor();
	await page.setViewportSize({ width: 1440, height: 1000 });
	await page.goto(
		`${origin}/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin`,
	);
	await page.waitForURL("**/_emdash/admin**");
	for (const [name, column] of [
		["footer_social", 0],
		["footer_explore", 1],
	]) {
		const response = await page.request.get(
			`${origin}/_emdash/api/menus/${name}`,
		);
		assert.equal(response.status(), 200, `${name} exists in the CMS`);
		const { data: footerMenu } = await response.json();
		await page.goto(origin);
		const footerItems = await page
			.locator(".footer-top > div")
			.nth(column)
			.locator("a, h3")
			.evaluateAll((elements) =>
				elements.map((element) => ({
					label: element.textContent.trim(),
					url: element.getAttribute("href"),
					tag: element.tagName,
				})),
			);
		const topLevelItems = footerMenu.items.filter((item) => !item.parentId);
		assert.deepEqual(
			footerItems.map(({ label, tag }) => ({ label, tag })),
			topLevelItems.map((item) => ({
				label: item.label,
				tag: item.type === "heading" ? "H3" : "A",
			})),
			`${name} controls footer column ${column + 3}`,
		);
		for (const [index, item] of topLevelItems.entries()) {
			if (item.type === "custom")
				assert.equal(footerItems[index].url, item.customUrl);
			if (item.type === "heading") assert.equal(footerItems[index].url, null);
		}
	}
	const home = await (
		await page.request.get(`${origin}/_emdash/api/content/pages/home`)
	).json();
	await page.goto(`${origin}/_emdash/admin/content/pages/${home.data.item.id}`);
	await page.locator(".page-format").waitFor();
	const welcome = page.getByRole("button", {
		name: "Get Started",
		exact: true,
	});
	if (await welcome.isVisible()) await welcome.click();
	await page.getByRole("radio", { name: /Page builder/ }).waitFor();
	await page.setViewportSize({ width: 1440, height: 1000 });
	await page.screenshot({ path: `${evidence}pages-admin.png` });
	await page
		.context()
		.addCookies([
			{ name: "emdash-locale", value: "ar", url: `${origin}/_emdash` },
		]);
	await page.reload();
	await page.getByRole("radio", { name: /Page builder/ }).waitFor();
	assert.equal(
		await page.locator("html").getAttribute("dir"),
		"rtl",
		"Pages editor supports Arabic direction",
	);
	await page.screenshot({ path: `${evidence}pages-admin-arabic.png` });
	assert.deepEqual(errors, [], "No browser runtime errors");
	console.log(
		`Desktop/mobile routes, category isolation, member dialogs, keyboard focus and navigation passed. Screenshots: ${evidence}`,
	);
} finally {
	await browser.close();
}
