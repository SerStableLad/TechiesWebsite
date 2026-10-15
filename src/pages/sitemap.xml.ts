import type { APIRoute } from "astro";
import { getEmDashCollection, getSeoMeta, getSiteSettings, getTaxonomyTerms } from "emdash";
import { campaignQuery } from "../plugins/campaigns/public-query";
import type { CampaignSummary } from "../plugins/campaigns/model";

const escapeXml = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);

export const GET: APIRoute = async ({ url, locals }) => {
	try {
		const settings = await getSiteSettings();
		const siteUrl = settings.url || url.origin;
		const urls = new Set(["/events", "/people", "/posts", "/campaigns"].map(path => new URL(path, siteUrl).href));
		for (const collection of ["pages", "posts"] as const) {
			let cursor: string | undefined;
			do {
				const result = await getEmDashCollection(collection, { status: "published", limit: 100, cursor });
				if (result.error) throw result.error;
				for (const entry of result.entries) {
					const path = collection === "posts" ? `/posts/${encodeURIComponent(entry.id)}` : entry.id === "home" ? "/" : `/${encodeURIComponent(entry.id)}`;
					const seo = getSeoMeta(entry, { siteUrl, path });
					// Exclude noindex entries and copies whose canonical points elsewhere.
					if (!seo.robots && seo.canonical === new URL(path, siteUrl).href) urls.add(seo.canonical);
				}
				cursor = result.nextCursor;
			} while (cursor);
		}
		for (const taxonomy of ["category", "tag"]) {
			for (const term of await getTaxonomyTerms(taxonomy)) {
				urls.add(new URL(`/${taxonomy}/${encodeURIComponent(term.slug)}`, siteUrl).href);
			}
		}
		let cursor: string | undefined;
		do {
			const result = await campaignQuery<{ items: CampaignSummary[]; cursor?: string }>(locals, url, "catalog", { cursor: cursor ?? "" });
			for (const campaign of result.items) {
				if (campaign.visibility === "public") urls.add(new URL(`/campaigns/${encodeURIComponent(campaign.slug)}`, siteUrl).href);
			}
			cursor = result.cursor;
		} while (cursor);
		// shortcut: one sitemap supports 50,000 URLs; split into an index before exceeding that limit.
		if (urls.size > 50_000) throw new Error("Sitemap requires pagination");
		return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...urls].map(loc => `  <url><loc>${escapeXml(loc)}</loc></url>`).join("\n")}\n</urlset>`, {
			headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300" },
		});
	} catch (error) {
		console.error("Could not generate sitemap", error);
		return new Response("Sitemap temporarily unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
	}
};
