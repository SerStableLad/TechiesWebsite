import { definePlugin } from "emdash";
import type { ContentAccess } from "emdash";
import { excoTag } from "./exco.ts";

/** Published recaps identify speakers through their reciprocal member-profile links. */
export async function memberRecaps(content: ContentAccess, memberId: string) {
  const member = await content.get("members", memberId);
  if (!member?.slug) return [];
  const href = `/members#${member.slug}`;
  const recaps = [];
  let cursor: string | undefined;
  do {
    const page = await content.list("posts", { limit: 100, cursor, where: { status: "published" }, orderBy: { publishedAt: "asc" } });
    for (const post of page.items) {
      if (!post.slug || post.status !== "published" || !Array.isArray(post.data.content)) continue;
      const speaker = post.data.content.some(block => {
        if (!block || block._type !== "block" || block.style !== "h2" || !Array.isArray(block.markDefs) || !Array.isArray(block.children)) return false;
        return block.markDefs.some((mark: Record<string, unknown> | null) => mark?._type === "link" && mark.href === href && block.children.some((span: Record<string, unknown> | null) => Array.isArray(span?.marks) && span.marks.includes(mark._key)));
      });
      if (!speaker) continue;
      const edition = /^roast-(\d+)$/.exec(post.slug)?.[1];
      recaps.push({
        _type: "block", _key: `recap-${post.id}`, style: "normal",
        children: [{ _type: "span", _key: "s0", text: edition ? `Speaker · Roast #${edition}` : `Speaker · ${post.data.title}`, marks: ["recap-link"] }],
        markDefs: [{ _type: "link", _key: "recap-link", href: `/posts/${encodeURIComponent(post.slug)}` }],
      });
    }
    cursor = page.cursor;
  } while (cursor);
  return recaps.sort((a, b) => a.markDefs[0].href.localeCompare(b.markDefs[0].href, undefined, { numeric: true }));
}

export function createPlugin(options: { adminEntry: string }) {
  return definePlugin({
    id: "techies-members", version: "0.2.1", capabilities: ["content:read", "content:write"],
    admin: { entry: options.adminEntry },
    hooks: {
      "content:beforeSave": { errorPolicy: "abort", handler: async (event, ctx) => {
        if (event.collection !== "members") return;
        const { exco, ...data } = event.content;
        // The widget saves privately; native form defaults must never become public tag data.
        return { ...data, recaps: event.id ? await memberRecaps(ctx.content!, event.id) : [] };
      } },
    },
    routes: {
      exco: {
        permission: "settings:manage", methods: ["GET"], handler: excoTag,
      },
      "exco-update": {
        permission: "settings:manage", methods: ["POST"],
        request: { body: "json", maxBytes: 2048 },
        handler: excoTag,
      },
      recaps: {
        permission: "content:read", methods: ["GET"],
        handler: async ctx => {
          const memberId = new URL(ctx.request.url).searchParams.get("memberId");
          return { recaps: memberId ? await memberRecaps(ctx.content!, memberId) : [] };
        },
      },
    },
  });
}
