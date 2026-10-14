import sanitizeHtml from "sanitize-html";

export function sanitizeCampaignHtml(value: string) {
	return sanitizeHtml(value, {
		allowedTags: ["p", "br", "strong", "b", "em", "i", "u", "s", "strike", "h2", "h3", "h4", "ul", "ol", "li", "blockquote", "pre", "code", "hr", "a", "sub", "sup", "img"],
		allowedAttributes: { a: ["href", "title", "target", "rel"], ol: ["start"], img: ["src", "alt"] },
		allowedSchemesByTag: { img: ["http", "https"] },
		allowedSchemes: ["http", "https", "mailto"], allowProtocolRelative: false,
		transformTags: { h1: "h2", a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, ...(attribs.target === "_blank" ? { rel: "noopener noreferrer" } : {}) } }) },
	});
}
export function hasRichText(value: string) {
	return Boolean(sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }).replace(/&(?:nbsp|#0*160|#x0*a0);/gi, " ").trim());
}
