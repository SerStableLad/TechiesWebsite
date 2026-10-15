import { defaultDescription, summarize } from "./seo.ts";
import { pageFormat } from "./page-format.ts";

export type SeoCollection = "pages" | "posts" | "members";
type Data = Record<string, any>;
export type SeoFields = { title?: string | null; description?: string | null; image?: string | null; canonical?: string | null; noIndex?: boolean };

function plainText(value: unknown): string {
  if (typeof value === "string") return value.replace(/<[^>]*>/g, " ").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/(^|\n)\s*#{1,6}\s+/g, "$1").replace(/[*_`]/g, "").trim();
  if (!Array.isArray(value)) return "";
  return value.filter(block => block?._type === "block").map(block => Array.isArray(block.children) ? block.children.map((span: { text?: string }) => span?.text ?? "").join("") : "").join(" ");
}

function sections(data: Data) {
  return pageFormat(data) === "sections" && Array.isArray(data.layout) ? data.layout.filter(block => block && typeof block === "object") : [];
}

export function seoImage(collection: SeoCollection, data: Data): unknown {
  if (collection === "members") return data.photo;
  if (collection === "posts") return data.featured_image;
  return sections(data).map(block => block.image || block.images?.[0]?.image).find(Boolean);
}

export function imageUrl(image: unknown): string | undefined {
  if (!image || typeof image !== "object") return undefined;
  const value = image as Data;
  return value.src || value.url || (value.meta?.storageKey ? `/_emdash/api/media/file/${value.meta.storageKey}` : undefined);
}

export function seoDefaults(collection: SeoCollection, data: Data, slug: string, options: { siteUrl: string; defaultImage?: string; image?: string } ): SeoFields {
  const title = plainText(data.title) || (collection === "members" ? "Member" : "Techies");
  const recapTitle = collection === "posts" ? title.match(/^Roast My TechStack #\d+/)?.[0] : undefined;
  const heading = collection === "pages" && slug === "home" ? "Developer Community Across APAC" : recapTitle ? `${recapTitle} Recap` : title;
  const sectionText = sections(data).map(block => plainText(block.intro) || plainText(block.body)).find(Boolean);
  const description = collection === "members" ? plainText(data.bio) || `Meet ${title} in the Techies community.`
    : collection === "posts" ? plainText(data.excerpt) || plainText(data.content)
    : sectionText || (pageFormat(data) === "rich_text" ? plainText(data.content) || plainText(data.intro) : plainText(data.intro) || plainText(data.content));
  const path = collection === "members" ? "/people" : collection === "posts" ? `/posts/${encodeURIComponent(slug)}` : slug === "home" ? "/" : `/${encodeURIComponent(slug)}`;
  return {
    // EmDash appends the site name when rendering the document title.
    title: heading.slice(0, 200),
    description: summarize(description) || defaultDescription,
    image: options.image || imageUrl(seoImage(collection, data)) || options.defaultImage || "/brand/techies-social.png",
    canonical: new URL(path, options.siteUrl).href,
  };
}

/** Refresh generated values, but never overwrite a distinct editorial override. */
export function populateSeo(defaults: SeoFields, previous: SeoFields, saved: SeoFields = {}, submitted: SeoFields = {}): SeoFields {
  const result = { ...saved, ...submitted };
  for (const key of ["title", "description", "image", "canonical"] as const) {
    const value = result[key];
    if (value == null || typeof value === "string" && (!value.trim() || value === previous[key])) result[key] = defaults[key];
  }
  if (result.noIndex === undefined) result.noIndex = false;
  return result;
}
