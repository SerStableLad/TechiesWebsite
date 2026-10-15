import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import { d1, r2 } from "@emdash-cms/cloudflare";
import { defineConfig, passthroughImageService, sessionDrivers } from "astro/config";
import emdash, { local } from "emdash/astro";
import { sqlite } from "emdash/db";
import { fileURLToPath } from "node:url";

const campaignsAdmin = fileURLToPath(new URL("./src/plugins/campaigns/admin.tsx", import.meta.url));
const membersAdmin = fileURLToPath(new URL("./src/plugins/members/admin.tsx", import.meta.url));
const pagesAdmin = fileURLToPath(new URL("./src/plugins/pages/admin.tsx", import.meta.url));

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
			plugins: [{
				id: "techies-campaigns", version: "0.3.2", format: "native",
				entrypoint: fileURLToPath(new URL("./src/plugins/campaigns/index.ts", import.meta.url)),
				adminEntry: campaignsAdmin, options: { adminEntry: campaignsAdmin },
			}, {
				id: "techies-members", version: "0.2.1", format: "native",
				entrypoint: fileURLToPath(new URL("./src/plugins/members/index.ts", import.meta.url)),
				adminEntry: membersAdmin, options: { adminEntry: membersAdmin },
			}, {
				id: "techies-pages", version: "0.1.0", format: "native",
				entrypoint: fileURLToPath(new URL("./src/plugins/pages/index.ts", import.meta.url)),
				adminEntry: pagesAdmin, options: { adminEntry: pagesAdmin },
			}],
			database: nodeRuntime ? sqlite({ url: "file:/data/techies.db" }) : d1({ binding: "DB", session: "auto" }),
			storage: nodeRuntime
				? local({ directory: "/data/uploads", baseUrl: "/_emdash/api/media/file" })
				: r2({ binding: "MEDIA" }),
		}),
	],
	devToolbar: { enabled: false },
});
