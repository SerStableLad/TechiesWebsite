import assert from "node:assert/strict";

const origin = process.env.CHECK_SITE_URL || "http://localhost:4322";
assert.ok(
	["localhost", "127.0.0.1"].includes(new URL(origin).hostname),
	"Run against a local test site only",
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
const homeBefore = await api("content/pages/home");
const body = [
	{
		_type: "block",
		_key: "body",
		style: "normal",
		markDefs: [],
		children: [{ _type: "span", _key: "text", text: "Preserved rich-text content", marks: [] }],
	},
];
const layout = [
	{ _type: "page_text", _version: 1, _key: "section", heading: "Editable section", body },
];
const slug = `page-check-${Date.now()}`;
const created = await api("content/pages", "POST", {
	slug,
	status: "draft",
	data: { title: "Pages verification", page_format: "sections", layout, content: body },
});
const path = `content/pages/${created.item.id}`;
async function publish() {
	const current = await api(path);
	await api(`${path}/publish`, "POST", { _rev: current._rev });
}
async function save(data) {
	const current = await api(path);
	await api(path, "PUT", { _rev: current._rev, data });
}
try {
	assert.equal((await fetch(`${origin}/${slug}`)).status, 404, "Drafts stay private");
	const preview = await api(`${path}/preview-url`, "POST", {});
	const previewResponse = await fetch(new URL(preview.url, origin));
	assert.equal(previewResponse.status, 200);
	assert.match(await previewResponse.text(), /Editable section/);
	await publish();
	assert.match(await (await fetch(`${origin}/${slug}`)).text(), /Editable section/);
	assert.match(
		await (await fetch(`${origin}/pages/${slug}`)).text(),
		/Editable section/,
		"Existing Pages URL form still works",
	);
	await save({ page_format: "rich_text" });
	assert.match(
		await (await fetch(`${origin}/${slug}`)).text(),
		/Editable section/,
		"Unpublished changes are not exposed",
	);
	await publish();
	const richText = await (await fetch(`${origin}/${slug}`)).text();
	assert.match(richText, /Preserved rich-text content/);
	assert.doesNotMatch(richText, /Editable section/);
	assert.deepEqual(
		(await api(path)).item.data.layout,
		layout,
		"Switching formats retains sections",
	);
	await save({ page_format: "sections" });
	await publish();
	assert.match(await (await fetch(`${origin}/${slug}`)).text(), /Editable section/);
	assert.deepEqual(
		(await api("content/pages/home")).item,
		homeBefore.item,
		"Homepage remains untouched",
	);
} finally {
	const current = await api(path);
	await api(path, "DELETE", { _rev: current._rev });
}
console.log(
	"Pages CMS checks passed: draft privacy, previews, publishing, legacy URLs, format switching and content retention.",
);
