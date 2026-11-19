import assert from "node:assert/strict";

import { localDate, utcDate } from "../src/plugins/announcements/dates.ts";
import { validateAnnouncement, createPlugin } from "../src/plugins/announcements/index.ts";

assert.equal(validateAnnouncement({ title: "Existing post" }), undefined);
assert.equal(validateAnnouncement({ announcement_banner: false }), undefined);
for (const announcement_until of [undefined, null, "", "not-a-date"]) {
	assert.throws(
		() => validateAnnouncement({ announcement_banner: true, announcement_until }),
		/display-until/,
	);
}
const enabled = {
	title: "Announcement",
	announcement_banner: true,
	announcement_until: "2030-01-02T12:30:00+08:00",
};
assert.equal(validateAnnouncement(enabled).announcement_until, "2030-01-02T04:30:00.000Z");
assert.equal(
	enabled.announcement_until,
	"2030-01-02T12:30:00+08:00",
	"Validation does not mutate the input",
);
assert.ok(
	validateAnnouncement({ announcement_banner: true, announcement_until: "2020-01-01T00:00:00Z" }),
	"Expired banners do not prevent unrelated post edits",
);
assert.equal(localDate(null), "");
assert.equal(localDate("bad"), "");
for (const invalid of ["", "bad", "2030-02-30", "2030-13-01", "2030-01-02T12:30"])
	assert.equal(utcDate(invalid), null);
for (const timezone of ["UTC", "Asia/Singapore", "America/New_York"]) {
	const previous = process.env.TZ;
	process.env.TZ = timezone;
	try {
		for (const day of ["2030-01-02", "2030-07-02", "2030-03-10", "2030-11-03", "2030-12-31"]) {
			const expiry = utcDate(day);
			assert.equal(localDate(expiry), day);
			const midnight = new Date(expiry);
			assert.equal(midnight.getHours(), 0, "Expiry is local midnight after the selected day");
			const lastMoment = new Date(midnight.getTime() - 1);
			assert.equal(
				lastMoment.getDate(),
				Number(day.slice(-2)),
				"The whole selected day stays active",
			);
		}
	} finally {
		if (previous === undefined) delete process.env.TZ;
		else process.env.TZ = previous;
	}
}
const plugin = createPlugin({ adminEntry: "test" });
assert.equal(
	await plugin.hooks["content:beforeSave"].handler({
		collection: "posts",
		content: { title: "Autosaved without announcement settings" },
	}),
	undefined,
	"Partial autosaves do not run announcement validation",
);
assert.equal(
	await plugin.hooks["content:beforeSave"].handler({
		collection: "pages",
		content: { announcement_banner: true },
	}),
	undefined,
	"Pages are unaffected",
);
console.log("Announcement validation, legacy defaults and date picker checks passed.");
