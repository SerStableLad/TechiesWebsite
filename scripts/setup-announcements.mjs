import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const origin = process.env.CHECK_SITE_URL || "http://localhost:4322";
assert.ok(
	["localhost", "127.0.0.1"].includes(new URL(origin).hostname),
	"Only apply this development setup to localhost",
);
const auth = await fetch(`${origin}/_emdash/api/auth/dev-bypass`, { method: "POST" });
assert.ok(auth.ok);
const cookie = auth.headers
	.getSetCookie()
	.map((value) => value.split(";")[0])
	.join("; ");
async function api(path, method = "GET", body) {
	const response = await fetch(`${origin}/_emdash/api/${path}`, {
		method,
		headers: { cookie, origin, "Content-Type": "application/json", "X-EmDash-Request": "1" },
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
	const result = await response.json();
	assert.ok(response.ok && result.success, JSON.stringify(result));
	return result.data;
}
const seed = JSON.parse(await readFile(new URL("../seed/seed.json", import.meta.url), "utf8"));
const fields = seed.collections
	.find((collection) => collection.slug === "posts")
	.fields.filter((field) => field.slug.startsWith("announcement_"));
const existing = await api("schema/collections/posts/fields");
for (const field of fields) {
	const saved = existing.items.find((item) => item.slug === field.slug);
	if (saved) {
		assert.equal(
			saved.type,
			field.type,
			`Unexpected existing type for ${field.slug}; no changes applied to this field`,
		);
		assert.equal(saved.widget, field.widget, `Unexpected existing widget for ${field.slug}`);
		await api(`schema/collections/posts/fields/${field.slug}`, "PUT", {
			options: { ...saved.options, ...field.options },
		});
	} else await api("schema/collections/posts/fields", "POST", field);
}
const updated = await api("schema/collections/posts/fields");
assert.ok(
	fields.every((field) =>
		updated.items.some(
			(item) =>
				item.slug === field.slug &&
				item.type === field.type &&
				item.options?.placement === "sidebar" &&
				item.options?.autosave === false,
		),
	),
);
console.log("Announcement fields ready. Existing posts and Pages content retained.");
