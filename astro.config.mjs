import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import { d1, r2 } from "@emdash-cms/cloudflare";
import { defineConfig, passthroughImageService, sessionDrivers } from "astro/config";
import emdash, { local } from "emdash/astro";
import { sqlite } from "emdash/db";

const nodeRuntime = process.env.EMDASH_RUNTIME === "node";
const adapter = nodeRuntime
	? (await import("@astrojs/node")).default({ mode: "standalone" })
	: cloudflare();

export default defineConfig({
	output: "server",
	redirects: {
		"/index.html": { destination: "/", status: 301 },
		"/exco.html": { destination: "/exco", status: 301 },
		...Object.fromEntries([2, 3, 4, 5, 6, 7].map(n => [
			`/roast-${n}.html`, { destination: `/posts/roast-${n}`, status: 301 },
		])),
	},
	adapter,
	...(nodeRuntime ? { session: { driver: sessionDrivers.fs({ base: "/data/sessions" }) } } : {}),
	image: {
		// ponytail: serve CMS originals; enable Cloudflare optimisation once IMAGES is provisioned.
		service: passthroughImageService(),
		layout: "constrained",
		responsiveStyles: true,
	},
	integrations: [
		react(),
		emdash({
			database: nodeRuntime ? sqlite({ url: "file:/data/techies.db" }) : d1({ binding: "DB", session: "auto" }),
			storage: nodeRuntime
				? local({ directory: "/data/uploads", baseUrl: "/_emdash/api/media/file" })
				: r2({ binding: "MEDIA" }),
		}),
	],
	devToolbar: { enabled: false },
});
