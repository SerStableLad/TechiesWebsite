import { expect, it, vi } from "vitest";

vi.mock("@emdash-cms/cloudflare/worker", () => ({
	default: {
		fetch: (request: Request) => new Response(request.headers.get("Authorization") ?? "site"),
	},
	createScheduledHandler: () => vi.fn(),
}));

import worker from "../src/worker.js";

it("keeps the preview closed and does not forward its password", async () => {
	const url = "https://preview.example.com/_emdash/admin/setup";
	const bindings = { PREVIEW_PASSWORD: "preview-test" };
	const context = {} as Parameters<typeof worker.fetch>[2];
	const request = new Request(url, {
		headers: { Authorization: `Basic ${btoa("techies:preview-test")}` },
	});
	expect((await worker.fetch(request, {}, context)).status).toBe(401);
	expect((await worker.fetch(new Request(url), bindings, context)).status).toBe(401);
	expect(await (await worker.fetch(request, bindings, context)).text()).toBe("site");
});
