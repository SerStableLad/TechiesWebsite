import type { MiddlewareHandler } from "astro";
import { ContentRepository, getSiteSettings, MediaRepository } from "emdash";
import { imageUrl, populateSeo, seoDefaults, seoImage, type SeoCollection, type SeoFields } from "../utils/auto-seo.ts";

/** Enrich the normal save payload so EmDash persists content and SEO atomically. */
export const autoSeoMiddleware: MiddlewareHandler = async (context, next) => {
  const locals = context.locals as typeof context.locals & { seoPrepared?: boolean; memberSeoPrepared?: boolean };
  if (locals.seoPrepared || !locals.user || !locals.emdash || !["POST", "PUT"].includes(context.request.method)) return next();
  let path: string;
  try { path = decodeURIComponent(context.url.pathname); } catch { return next(); }
  const rest = /^\/_emdash\/api\/content\/(pages|posts|members)(?:\/([^/]+))?\/?$/.exec(path);
  const mcp = path === "/_emdash/api/mcp";
  if (!rest && !mcp) return next();
  let body: any;
  try { body = await context.request.clone().json(); } catch { return next(); }
  let changed = false;
  for (const call of Array.isArray(body) ? body : [body]) {
    const args = rest ? call : call?.method === "tools/call" && ["content_create", "content_update"].includes(call.params?.name) ? call.params.arguments : null;
    const collection = (rest?.[1] || args?.collection) as SeoCollection;
    if (!args || typeof args !== "object" || Array.isArray(args) || !["pages", "posts", "members"].includes(collection)) continue;
    if (args.data !== undefined && (!args.data || typeof args.data !== "object" || Array.isArray(args.data))) continue;
    if (args.seo !== undefined && (!args.seo || typeof args.seo !== "object" || Array.isArray(args.seo))) continue;
    const id = rest?.[2] || args.id;
    if (id !== undefined && typeof id !== "string" || args.slug != null && typeof args.slug !== "string" || args.locale != null && typeof args.locale !== "string") continue;
    if (rest && (id ? context.request.method !== "PUT" : context.request.method !== "POST")) continue;
    let stored: { id: string; data: Record<string, any>; slug: string; seo?: SeoFields } | undefined;
    if (id) {
      const result = await locals.emdash.handleContentGet(collection, id, args.locale || context.url.searchParams.get("locale") || undefined);
      if (!result.success || !result.data?.item) continue;
      const item = result.data.item;
      if (typeof item.slug !== "string" || !item.data || typeof item.data !== "object") continue;
      stored = { id: item.id, slug: item.slug, data: item.data as Record<string, any>, seo: item.seo as SeoFields | undefined };
    }
    const data = { ...stored?.data, ...args.data };
    if (!id && !args.slug && typeof data.title === "string") {
      args.slug = await new ContentRepository(locals.emdash.db).generateUniqueSlug(collection, data.title, args.locale);
    }
    const slug = args.slug || stored?.slug || "";
    const settings = await getSiteSettings();
    const options = { siteUrl: settings.url || context.url.origin, defaultImage: settings.seo?.defaultOgImage?.url };
    async function defaults(content: Record<string, any>, contentSlug: string) {
      const image = seoImage(collection, content);
      let resolvedImage = imageUrl(image);
      if (!resolvedImage && image && typeof image === "object" && "id" in image && typeof image.id === "string") {
        const media = await new MediaRepository(locals.emdash!.db).findById(image.id);
        if (media) resolvedImage = locals.emdash!.getPublicMediaUrl?.(media.storageKey) || `/_emdash/api/media/file/${media.storageKey}`;
      }
      return seoDefaults(collection, content, contentSlug, { ...options, image: resolvedImage });
    }
    const generated = await defaults(data, slug);
    if (!slug) delete generated.canonical;
    const previous = stored ? await defaults(stored.data, stored.slug) : seoDefaults(collection, data, slug, options);
    args.seo = populateSeo(generated, previous, stored?.seo, args.seo);
    changed = true;
  }
  if (!changed) return next();
  locals.seoPrepared = true;
  // The member guard already checked the original client payload before this middleware.
  locals.memberSeoPrepared = true;
  const headers = new Headers(context.request.headers);
  headers.delete("content-length");
  return context.rewrite(new Request(context.request, { headers, body: JSON.stringify(body) }));
};
