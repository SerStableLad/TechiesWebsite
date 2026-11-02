import { definePlugin } from "emdash";
import type { PluginRoute, RouteContext, StorageCollection } from "emdash";
import { defaultForm, parseForm, parseSubmission, pluginId, PresenterError, type PresenterForm, type PresenterSubmission } from "./model.ts";

async function settings(ctx: RouteContext) {
  const saved = await ctx.settings.getVersioned<PresenterForm>("form");
  return { form: saved?.value ?? defaultForm, revision: saved?.revision ?? null };
}
function route(handler: (ctx: RouteContext) => Promise<object>, isPublic = false, method: "GET" | "POST" = "GET"): PluginRoute {
  return {
    public: isPublic, permission: isPublic ? undefined : "plugins:manage", methods: [method],
    ...(method === "POST" ? { request: { body: "json" as const, maxBytes: isPublic ? 16384 : 100000 } } : {}),
    handler: async ctx => {
      try { return { ok: true, ...await handler(ctx) }; }
      catch (error) {
        if (error instanceof PresenterError) return { ok: false, error: error.message };
        ctx.log.error("Presenter form request failed", { errorType: error instanceof Error ? error.name : "unknown" });
        return { ok: false, error: "We couldn’t save that. Please try again; your answers are still here." };
      }
    },
  };
}
export function createPlugin(options: { adminEntry: string }) {
  return definePlugin({
    id: pluginId, version: "0.1.0",
    storage: { submissions: { indexes: ["createdAt"] }, cooldowns: { indexes: ["expiresAt"] } },
    admin: { entry: options.adminEntry, pages: [{ path: "/presenters", label: "Presenter interest", icon: "microphone-stage" }] },
    routes: {
      form: route(async ctx => settings(ctx), true),
      submit: route(async ctx => {
        if (ctx.request.headers.get("origin") !== new URL(ctx.request.url).origin) throw new PresenterError("Please submit this form from the Techies website.");
        const { form, revision } = await settings(ctx);
        const data = parseSubmission(ctx.input, form);
        if ((ctx.input as Record<string, unknown>).revision !== revision) throw new PresenterError("The presentation guidelines changed. Refresh this page and review them before submitting.");
        const submissions = ctx.storage.submissions as StorageCollection<PresenterSubmission>;
        const existing = await submissions.get(data.requestId);
        if (existing) {
          if (existing.whatsapp !== data.whatsapp || existing.project !== data.project || existing.name !== data.name || existing.theme !== data.theme) throw new PresenterError("Please refresh the page before sending a new submission.");
          return { title: form.successTitle, message: form.successMessage };
        }
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data.whatsapp));
        const key = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
        const cooldowns = ctx.storage.cooldowns as StorageCollection<{ expiresAt: number }>;
        const previous = await cooldowns.getVersioned(key);
        if (previous && previous.value.expiresAt > Date.now()) throw new PresenterError("Please wait a minute before sending another expression of interest.");
        const locked = await cooldowns.compareAndSet(key, previous?.revision ?? null, { expiresAt: Date.now() + 60000 });
        if (!locked.applied) throw new PresenterError("Please wait a minute and try again.");
        try {
          const saved = await submissions.compareAndSet(data.requestId, null, { ...data, createdAt: new Date().toISOString(), guidelines: form.guidelines, consent: form.consent, formRevision: revision ?? "default" });
          if (!saved.applied) throw new PresenterError("This submission was already sent. Refresh the page before submitting again.");
        } catch (error) {
          await cooldowns.compareAndDelete(key, locked.revision);
          throw error;
        }
        return { title: form.successTitle, message: form.successMessage };
      }, true, "POST"),
      "admin/form": route(async ctx => settings(ctx)),
      "admin/save": route(async ctx => {
        const input = ctx.input as { form?: unknown; revision?: unknown };
        const form = parseForm(input?.form);
        if (input.revision !== null && typeof input.revision !== "string") throw new PresenterError("Please reload the settings and try again.");
        const result = await ctx.settings.compareAndSet("form", input.revision, form);
        if (!result.applied) throw new PresenterError("Someone else changed this form. Reload before saving so their changes are not overwritten.");
        return { form, revision: result.revision };
      }, false, "POST"),
      "admin/submissions": route(async ctx => {
        const cursor = new URL(ctx.request.url).searchParams.get("cursor") ?? undefined;
        const result = await ctx.storage.submissions.query({ orderBy: { createdAt: "desc" }, limit: 50, cursor });
        return { ...result, count: await ctx.storage.submissions.count() };
      }),
    },
  });
}
