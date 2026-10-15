import type { RouteContext } from "emdash";

/** Keep committee membership out of public content, search, exports and revisions. */
export async function excoTag(ctx: RouteContext) {
  if (!ctx.user || ctx.user.role !== 50) throw new Error("Only administrators can manage Exco tags.");
  const input = ctx.request.method === "GET" ? Object.fromEntries(new URL(ctx.request.url).searchParams) : ctx.input as Record<string, unknown>;
  const memberId = input?.memberId;
  if (typeof memberId !== "string" || !memberId || memberId.length > 100) throw new Error("A saved member is required.");
  const member = await ctx.content!.get("members", memberId);
  if (!member) throw new Error("Member not found.");
  const key = `state:exco:${member.id}`;
  if (ctx.request.method === "POST") {
    if (typeof input.enabled !== "boolean" || !(input.revision === null || typeof input.revision === "string")) throw new Error("Invalid Exco tag update.");
    const result = await ctx.kv.compareAndSet(key, input.revision, input.enabled);
    if (!result.applied) throw new Error("The Exco tag changed. Reload this profile and try again.");
  }
  const saved = await ctx.kv.getVersioned<boolean>(key);
  return { enabled: saved?.value === true, revision: saved?.revision ?? null };
}
