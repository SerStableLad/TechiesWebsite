import assert from "node:assert/strict";

import {
	parseCalendar,
	parseCalendarPage,
	futureEvents,
	eventVenue,
	eventTimezone,
	getCalendar,
} from "../src/utils/luma.ts";
const event = {
	name: "A session",
	url: "session-one",
	start_at: "2026-12-02T10:30:00Z",
	end_at: "2026-12-02T13:30:00Z",
};
const later = {
	...event,
	name: "Later",
	start_at: "2026-12-04T10:30:00Z",
	end_at: "2026-12-04T13:30:00Z",
};
const parsed = parseCalendar({
	entries: [
		{ event: later },
		{ event },
		{ event: { ...event, url: "javascript:alert(1)" } },
		{ event: { ...event, start_at: "invalid" } },
		{ event: { ...event, end_at: event.start_at } },
		null,
	],
});
assert.deepEqual(parsed, [event, later]);
assert.deepEqual(
	futureEvents(parsed, Date.parse(event.start_at)),
	[later],
	"Advance as soon as an event starts",
);
assert.deepEqual(futureEvents(parsed, Date.parse("2027-01-01")), []);
assert.equal(
	eventVenue({
		...event,
		geo_address_visibility: "private",
		geo_address_info: { address: "Private address" },
	}),
	"Venue details on Luma",
);
assert.equal(eventVenue({ ...event, location_type: "online" }), "Online");
assert.equal(eventTimezone({ ...event, timezone: "invalid" }), "Asia/Singapore");
assert.throws(() => parseCalendar({ entries: null }));
const structuredEvent = (value) => ({
	"@type": "Event",
	name: value.name,
	url: `https://luma.com/${value.url}`,
	startDate: value.start_at,
	endDate: value.end_at,
	eventStatus: "https://schema.org/EventScheduled",
});
const calendarPage = (items) =>
	`<script data-cfasync="false" type="application/ld+json">${JSON.stringify({ "@type": "ItemList", url: "https://luma.com/APACtechies", itemListElement: items.map((item) => ({ "@type": "ListItem", item })) })}</script>`;
const publicPage = calendarPage([
	structuredEvent(later),
	{
		...structuredEvent(event),
		image: ["https://images.lumacdn.com/event.png"],
		location: { "@type": "Place", name: "SGInnovate" },
	},
	{ ...structuredEvent(event), url: "https://evil.example/event" },
	{ ...structuredEvent(event), eventStatus: "https://schema.org/EventCancelled" },
	{ ...structuredEvent(event), endDate: "invalid" },
]);
assert.deepEqual(
	parseCalendarPage(publicPage).map((session) => session.name),
	["A session", "Later"],
);
assert.equal(eventVenue(parseCalendarPage(publicPage)[0]), "SGInnovate");
assert.equal(
	parseCalendarPage(publicPage)[0].cover_url,
	"https://images.lumacdn.com/event.png",
	"Preserve the accompanying Luma event image",
);
assert.equal(
	eventVenue(parseCalendarPage(publicPage)[1]),
	"Venue details on Luma",
	"Only public JSON-LD locations are used",
);
assert.deepEqual(parseCalendarPage(calendarPage([])), [], "An explicitly empty calendar is valid");
assert.throws(() => parseCalendarPage("<html>Unrelated page</html>"));
assert.throws(() => parseCalendarPage('<script type="application/ld+json">not json</script>'));
let calls = 0;
const oldFetch = globalThis.fetch;
const oldNow = Date.now;
const oldWarn = console.warn;
const warnings = [];
console.warn = (...values) => warnings.push(values);
let now = Date.parse("2026-11-02T00:00:00Z");
Date.now = () => now;
globalThis.fetch = async (url) => {
	assert.equal(url, "https://luma.com/APACtechies");
	calls++;
	return { ok: true, text: async () => publicPage };
};
try {
	const [a, b] = await Promise.all([getCalendar(), getCalendar()]);
	assert.equal(calls, 1, "Concurrent homepage/calendar requests share one upstream fetch");
	assert.deepEqual(a, b);
	assert.equal(a.events[0]?.name, "A session");
	globalThis.fetch = async () => ({ ok: false, status: 429 });
	now += 6 * 60_000;
	assert.equal(
		(await getCalendar()).events[0]?.name,
		"A session",
		"Temporary outages keep the last successful upcoming events",
	);
	now += 2 * 3_600_000;
	assert.deepEqual((await getCalendar()).events, [], "Discard stale data after one hour");
	assert.equal(warnings.length, 2);
} finally {
	globalThis.fetch = oldFetch;
	Date.now = oldNow;
	console.warn = oldWarn;
}
console.log(
	"Luma public-page parsing, validation, caching, outage recovery, rollover and private-venue checks passed.",
);

if (process.argv.includes("--live")) {
	const response = await fetch("https://luma.com/APACtechies");
	assert.ok(response.ok, `Public calendar returned ${response.status}`);
	const events = futureEvents(parseCalendarPage(await response.text()));
	console.log(
		events[0]
			? `Live next event: ${events[0].name} · ${events[0].start_at} · ${eventVenue(events[0])} · https://luma.com/${events[0].url}`
			: "Live calendar loaded; no upcoming events.",
	);
}
