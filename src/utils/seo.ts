export const defaultDescription = "Techies brings developers, builders, and the technically curious across APAC together for candid engineering conversations, meetups, and practical workshops.";

/** Keep generated snippets concise; explicit CMS SEO descriptions remain untouched. */
export function summarize(value?: string | null): string | undefined {
	const text = value?.replace(/\s+/g, " ").trim();
	if (!text) return undefined;
	if (text.length <= 160) return text;
	const excerpt = text.slice(0, 157);
	const boundary = excerpt.lastIndexOf(" ");
	return `${excerpt.slice(0, boundary > 0 ? boundary : excerpt.length).trimEnd()}…`;
}
