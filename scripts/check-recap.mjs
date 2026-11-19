// node scripts/check-recap.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
	blockText,
	isDecorativeLabel,
	recapCharts,
	recapContent,
	recapOutline,
	recapSpeakers,
	recapTitle,
} from "../src/utils/recap.ts";

const sample = [
	{
		_type: "block",
		_key: "a",
		style: "normal",
		children: [{ _type: "span", _key: "s", text: "Speaker 01" }],
	},
	{
		_type: "block",
		_key: "b",
		style: "h2",
		markDefs: [{ _type: "link", _key: "profile", href: "/members#kong" }],
		children: [{ _type: "span", _key: "s", text: "Kong", marks: ["profile"] }],
	},
	{
		_type: "block",
		_key: "roast-7-7",
		style: "normal",
		children: [{ _type: "span", _key: "s", text: "01" }],
	},
	{
		_type: "block",
		_key: "d",
		style: "h2",
		children: [{ _type: "span", _key: "s", text: "Who was in the room" }],
	},
];

assert.deepEqual(recapTitle("Roast My TechStack #7 · July 2, 2026 · Singapore"), {
	title: "Roast My TechStack #7",
	dateLabel: "July 2, 2026",
	city: "Singapore",
});
assert.deepEqual(recapTitle("Community Partner for SINCON 2026"), {
	title: "Community Partner for SINCON 2026",
});
assert.equal(blockText(sample[1]), "Kong");
assert.deepEqual(recapSpeakers(sample), [{ name: "Kong", href: "/members#kong" }]);
assert.deepEqual(recapOutline(sample), [
	{ id: "b", text: "Kong" },
	{ id: "d", text: "Who was in the room" },
]);
assert.equal(isDecorativeLabel(sample[0]), true);
assert.equal(isDecorativeLabel(sample[2]), true);
assert.equal(isDecorativeLabel(sample[1]), false);
assert.equal(
	isDecorativeLabel({ ...sample[2], _key: "new-number" }),
	false,
	"New numeric content is preserved",
);
assert.equal(
	isDecorativeLabel({ ...sample[2], listItem: "number" }),
	false,
	"List values are preserved",
);
const photo = { _type: "image", _key: "photo", asset: { _ref: "photo" } };
const project = { ...sample[2], _key: "project", children: [{ _type: "span", text: "Project" }] };
const original = [photo, project, sample[1], sample[3]];
assert.equal(blockText(recapContent(original)[0]), "Kong · Project");
assert.equal(recapContent(original)[1]._type, "image");
assert.deepEqual(original, [photo, project, sample[1], sample[3]], "Saved content is not mutated");
assert.deepEqual(recapContent(recapContent(original)), recapContent(original));
const chartBlocks = [
	"Organisation type",
	"Startups 34.9%",
	"SMEs 65.1%",
	"Seniority",
	"Lead / IC 100%",
	"Role type",
	"Engineering 100%",
	"Excludes unknown roles.",
].map((text, i) => ({
	_type: "block",
	_key: `chart-${i}`,
	style: "normal",
	children: [{ _type: "span", text }],
}));
const headingBlock = {
	_type: "block",
	_key: "demo-heading",
	style: "h2",
	children: [{ _type: "span", text: "Demographic breakdown" }],
};
const roomIntro = {
	_type: "block",
	_key: "room-intro",
	style: "normal",
	children: [{ _type: "span", text: "Who was in the room" }],
};
const venueHeading = {
	...headingBlock,
	_key: "venue-h2",
	children: [{ _type: "span", text: "Venue sponsor" }],
};
const charts = recapCharts(chartBlocks);
assert.equal(charts[0]._type, "audienceCharts");
assert.equal(charts[0].charts[0].items[0].value, 34.9);
assert.equal(blockText(charts[1]), "Excludes unknown roles.");
assert.deepEqual(
	recapCharts([roomIntro, headingBlock, ...chartBlocks.slice(0, 4), venueHeading]),
	[venueHeading],
	"Incomplete demographic data is skipped entirely",
);
const partial = recapCharts(chartBlocks.slice(0, 5));
assert.equal(partial[0]._type, "audienceCharts");
assert.deepEqual(
	partial[0].charts.map((chart) => chart.title),
	["Organisation type", "Seniority"],
	"Chart whichever demographic groups the recap includes",
);
const seniorityOnly = recapCharts([chartBlocks[3], chartBlocks[4]]);
assert.equal(seniorityOnly[0]._type, "audienceCharts");
assert.equal(seniorityOnly[0].charts[0].title, "Seniority");
assert.deepEqual(
	recapCharts([chartBlocks[7]]),
	[chartBlocks[7]],
	"Recaps without demographics are left alone",
);
const creditBlocks = [
	{
		_type: "block",
		_key: "credits-h2",
		style: "h2",
		children: [{ _type: "span", text: "Venue sponsor" }],
	},
	{ _type: "image", _key: "venue-logo", asset: { _ref: "logo" }, alt: "SGInnovate" },
	{
		_type: "block",
		_key: "venue-name",
		style: "h3",
		children: [{ _type: "span", text: "SGInnovate" }],
	},
	{
		_type: "block",
		_key: "pic",
		style: "normal",
		markDefs: [{ _type: "link", _key: "coord", href: "https://example.com/coordinator" }],
		children: [
			{ _type: "span", text: "PIC: " },
			{ _type: "span", text: "An Ting", marks: ["coord"] },
		],
	},
	{
		_type: "block",
		_key: "ops",
		style: "normal",
		children: [{ _type: "span", text: "Event ops volunteers" }],
	},
	{ _type: "block", _key: "mic-emoji", style: "normal", children: [{ _type: "span", text: "⏳" }] },
	{
		_type: "block",
		_key: "role",
		style: "h3",
		children: [{ _type: "span", text: "Time & Mic Keeper" }],
	},
	{
		_type: "block",
		_key: "name",
		style: "normal",
		children: [{ _type: "span", text: "YingZhao" }],
	},
	{
		_type: "block",
		_key: "profile",
		style: "normal",
		markDefs: [{ _type: "link", _key: "yin", href: "https://example.com/yingzhao" }],
		children: [{ _type: "span", text: "LinkedIn", marks: ["yin"] }],
	},
	{
		_type: "block",
		_key: "tail",
		style: "normal",
		children: [{ _type: "span", text: "After the credits." }],
	},
];
const credits = recapContent(creditBlocks);
assert.equal(credits[0]._type, "credits");
assert.equal(credits[0].venueName, "SGInnovate");
assert.equal(credits[0].coordinatorHref, "https://example.com/coordinator");
assert.deepEqual(credits[0].people, [
	{ role: "Time & Mic Keeper", name: "YingZhao", href: "https://example.com/yingzhao" },
]);
assert.equal(credits.at(-1)._key, "tail");
assert.deepEqual(recapOutline(credits), [{ id: credits[0]._key, text: "Community credits" }]);
assert.deepEqual(recapContent(credits), credits, "Credits conversion is idempotent");
const legacyCredits = recapContent(
	creditBlocks.filter(({ _key }) => !["ops", "mic-emoji", "profile"].includes(_key)),
);
assert.equal(legacyCredits[0]._type, "credits");
assert.deepEqual(legacyCredits[0].people, [
	{ role: "Time & Mic Keeper", name: "YingZhao", href: undefined },
]);

const demoWithData = recapCharts([roomIntro, headingBlock, ...chartBlocks]);
assert.equal(demoWithData[0], headingBlock);
assert.equal(demoWithData[1]._type, "audienceCharts");
assert.equal(demoWithData.at(-1)._key, "chart-7");
const demoWithoutData = recapCharts([
	roomIntro,
	headingBlock,
	{
		...chartBlocks[0],
		_key: "missing",
		children: [{ _type: "span", text: "No demographic data was collected." }],
	},
	venueHeading,
]);
assert.deepEqual(demoWithoutData, [venueHeading]);
const percentagePattern = /\d+(?:\.\d+)?%/;
const zeroCharts = chartBlocks.map((block) => ({
	...block,
	children: block.children.map((span) => ({
		...span,
		text: span.text.replace(percentagePattern, "0%"),
	})),
}));
assert.deepEqual(
	recapCharts([roomIntro, headingBlock, ...zeroCharts, venueHeading]),
	[venueHeading],
	"An all-zero demographic dataset is skipped",
);

const seed = JSON.parse(await readFile(new URL("../seed/seed.json", import.meta.url), "utf8"));
const sections = new Map((seed.sections ?? []).map((item) => [item.slug, item]));
const speakerSection = sections.get("event-recap-speaker");
const audienceSection = sections.get("event-recap-audience");
const creditsSection = sections.get("event-recap-credits");
assert.ok(speakerSection && audienceSection && creditsSection, "Recap blocks are seeded");
for (const section of sections.values()) {
	assert.ok(
		section.content.every(
			(block) => block._key && (block.children ?? []).every((span) => span._key),
		),
		`${section.slug}: stable block and span keys`,
	);
}
assert.deepEqual(recapSpeakers(speakerSection.content), [
	{ name: "Speaker name", href: "/members#member-slug" },
]);
assert.equal(
	recapCharts(audienceSection.content).some((block) => block._type === "audienceCharts"),
	false,
	"Unfilled audience placeholders stay hidden",
);
const filledAudience = audienceSection.content.map((block) =>
	block.children?.length
		? {
				...block,
				children: block.children.map((span) => ({
					...span,
					text: span.text.replace(/\b0%$/, "50%"),
				})),
			}
		: block,
);
assert.ok(
	recapCharts(filledAudience).some((block) => block._type === "audienceCharts"),
	"Filled audience placeholders render a chart",
);
assert.match(
	blockText(creditsSection.content.find((block) => block._key === "recap-credits-pic")),
	/^PIC: /,
);

console.log("Recap title, speaker, outline and section checks passed.");

if (process.argv.includes("--site")) {
	const origin = process.env.CHECK_SITE_URL || "http://localhost:4322";
	for (const slug of ["roast-2", "roast-3", "roast-4", "roast-5", "roast-6", "roast-7"]) {
		const response = await fetch(`${origin}/posts/${slug}`);
		assert.equal(response.status, 200);
		const html = await response.text();
		const toc = html.match(/<nav[^>]*aria-label="In this article"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
		assert.ok(toc, `${slug}: visible contents navigation`);
		for (const [, id] of toc.matchAll(/href="#([^"]+)"/g))
			assert.ok(html.includes(`id="${id}"`), `${slug}: contents target ${id}`);
		assert.match(html, /More from the room/);
		assert.ok(!/>Speaker\s*\d+</.test(html), `${slug}: imported decorative labels removed`);
	}
	console.log("Six rendered recaps have working contents links and related posts.");
}
