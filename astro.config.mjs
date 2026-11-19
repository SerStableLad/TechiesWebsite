import { fileURLToPath } from "node:url";

import node from "@astrojs/node";
import react from "@astrojs/react";
import cloudflare from "@astrojs/cloudflare";
import { d1, r2 } from "@emdash-cms/cloudflare";
import { defineConfig, passthroughImageService } from "astro/config";
import emdash, { local } from "emdash/astro";
import { sqlite } from "emdash/db";

import { settingsSchema } from "./src/plugins/resend/index.ts";

const workers = process.env.EMDASH_RUNTIME === "cloudflare";

const plugins = ["members", "pages", "announcements"].map((name) => {
	const adminEntry = fileURLToPath(new URL(`./src/plugins/${name}/admin.tsx`, import.meta.url));
	return {
		id: `techies-${name}`,
		version: name === "members" ? "0.2.1" : "0.1.0",
		format: "native",
		entrypoint: fileURLToPath(new URL(`./src/plugins/${name}/index.ts`, import.meta.url)),
		adminEntry,
		options: { adminEntry },
	};
});

plugins.push({
	id: "techies-resend",
	version: "0.1.0",
	format: "native",
	entrypoint: fileURLToPath(new URL("./src/plugins/resend/index.ts", import.meta.url)),
	capabilities: ["hooks.email-transport:register", "network:request"],
	allowedHosts: ["api.resend.com"],
	settingsSchema,
});

export default defineConfig({
	output: "server",
	adapter: workers ? cloudflare() : node({ mode: "standalone" }),
	...(workers ? { vite: { build: { rolldownOptions: { output: { minify: true } } } } } : {}),
	image: {
		service: passthroughImageService(),
		layout: "constrained",
		responsiveStyles: true,
	},
	integrations: [
		react(),
		emdash({
			database: workers ? d1({ binding: "DB", session: "auto" }) : sqlite({ url: "file:./data.db" }),
			storage: workers ? r2({ binding: "MEDIA" }) : local({ directory: "./uploads", baseUrl: "/_emdash/api/media/file" }),
			plugins,
		}),
	],
	devToolbar: { enabled: false },
});
