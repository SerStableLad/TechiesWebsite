import type { MiddlewareHandler } from "astro";
import { seoDefaults } from "../../utils/auto-seo.ts";

export function memberSeoDefaults(data: Record<string, unknown>) {
  const defaults = seoDefaults("members", data, "", { siteUrl: "http://localhost" });
  return {
    title: defaults.title,
    description: defaults.description,
    image: defaults.image,
    noIndex: false,
  };
}

/** Run after EmDash authentication; member-level users cannot write SEO via REST or MCP. */
export const memberSettingsMiddleware: MiddlewareHandler = async (context, next) => {
  const locals = context.locals as typeof context.locals & { memberSeoPrepared?: boolean };
  if (locals.memberSeoPrepared || !locals.user || !["POST", "PUT", "PATCH"].includes(context.request.method)) return next();
  let path: string;
  try { path = decodeURIComponent(context.url.pathname); } catch { return next(); }
  const rest = /^\/_emdash\/api\/content\/members(?:\/[^/]+)?\/?$/.test(path);
  const mcp = path === "/_emdash/api/mcp";
  if (!rest && !mcp) return next();
  let body: Record<string, any>;
  try { body = await context.request.clone().json(); } catch { return next(); }
  const calls = Array.isArray(body) ? body : [body];
  let changed = false;
  for (const call of calls) {
    const args = rest ? call : call?.method === "tools/call" && ["content_create", "content_update"].includes(call.params?.name) && call.params?.arguments?.collection === "members" ? call.params.arguments : null;
    if (!args || typeof args !== "object") continue;
    if (locals.user.role < 40 && (Object.hasOwn(args, "seo") || args.data && Object.hasOwn(args.data, "seo"))) {
      return Response.json({ success: false, error: { code: "FORBIDDEN", message: "Member SEO is managed by the Techies team." } }, { status: 403 });
    }
    const create = rest ? context.request.method === "POST" && /^\/_emdash\/api\/content\/members\/?$/.test(path) : call.params.name === "content_create";
    if (create && args.data && typeof args.data === "object") {
      args.seo = { ...memberSeoDefaults(args.data), ...args.seo };
      changed = true;
    }
  }
  if (!changed) return next();
  locals.memberSeoPrepared = true;
  const headers = new Headers(context.request.headers);
  headers.delete("content-length");
  return context.rewrite(new Request(context.request, { headers, body: JSON.stringify(body) }));
};
