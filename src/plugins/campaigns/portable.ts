import { toHTML } from "@portabletext/to-html";
import { htmlToPortableText } from "@emdash-cms/gutenberg-to-portable-text";
import type { PluginContext } from "emdash";
import { hasRichText, sanitizeCampaignHtml } from "./content.ts";
import { editorHtml } from "./rich-text.ts";
import { fail } from "./model.ts";

export function importedBlocks(value: string, format?: string) {
	return htmlToPortableText(editorHtml(value, format));
}
export async function portableHtml(ctx: PluginContext, value: unknown) {
	if (!Array.isArray(value)) return "";
	if (JSON.stringify(value).length > 100000) fail("Campaign rich text is too large.");
	const images = new Map<string, { src: string; alt: string }>();
	for (const block of value) {
		if (block?._type === "image") {
			const id = block.asset?.id ?? block.asset?._ref;
			const media = typeof id === "string" ? await ctx.media?.get(id) : null;
			const src = media?.url ?? block.asset?.src ?? block.asset?.url ?? "";
			images.set(block._key, { src, alt: block.alt ?? media?.alt ?? "" });
		} else if (!["block", "code", "htmlBlock", "break"].includes(block?._type)) {
			fail("Campaign text supports paragraphs, formatting, lists, images, code and inline HTML. Use a link for other embedded content.");
		}
	}
	const escape = (s: unknown) => String(s ?? "").replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
	const html = toHTML(value, {
		components: { types: {
			image: ({ value }) => { const image = images.get(value._key); return image?.src ? `<img src="${escape(image.src)}" alt="${escape(image.alt)}">` : ""; },
			code: ({ value }) => `<pre><code>${escape(value.code)}</code></pre>`,
			htmlBlock: ({ value }) => String(value.html ?? ""),
			break: () => "<hr>",
		} }, onMissingComponent: false,
	});
	return sanitizeCampaignHtml(html);
}
export function requirePortableText(html: string, label: string) {
	if (!hasRichText(html)) fail(`${label} must contain text before activation.`);
}
