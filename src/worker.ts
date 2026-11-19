import handler, { createScheduledHandler, PluginBridge } from "@emdash-cms/cloudflare/worker";
import { timingSafeEqual } from "node:crypto";

export { PluginBridge };

type WorkerFetch = NonNullable<typeof handler.fetch>;

export default {
	...handler,
	fetch(
		request: Parameters<WorkerFetch>[0],
		bindings: Parameters<WorkerFetch>[1] & { PREVIEW_PASSWORD?: string },
		context: Parameters<WorkerFetch>[2],
	) {
		const expected =
			bindings.PREVIEW_PASSWORD && Buffer.from(`Basic ${btoa(`techies:${bindings.PREVIEW_PASSWORD}`)}`);
		const received = Buffer.from(request.headers.get("Authorization") ?? "");
		if (!expected || received.length !== expected.length || !timingSafeEqual(received, expected)) {
			return new Response("Private Techies preview", {
				status: 401,
				headers: { "WWW-Authenticate": 'Basic realm="Techies preview"', "Cache-Control": "no-store" },
			});
		}
		const headers = new Headers(request.headers);
		headers.delete("Authorization");
		// Replacing headers preserves the incoming request's Cloudflare metadata.
		const forwarded = new Request(request, { headers }) as typeof request;
		return handler.fetch(forwarded, bindings, context);
	},
	scheduled: createScheduledHandler({ generalCron: "0 * * * *" }),
};
