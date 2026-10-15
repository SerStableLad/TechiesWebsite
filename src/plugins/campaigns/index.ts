import { definePlugin, pluginResponse } from "emdash";
import type { PluginRoute, RouteContext } from "emdash";
import { CampaignError, pluginId } from "./model";
import * as service from "./service";
import * as native from "./native";

const eventPolicy = (handler: typeof native.beforePublish) => ({ handler, errorPolicy: "abort" as const });

function route(handler: (ctx: RouteContext) => Promise<unknown>, publicRoute = false, method: "GET" | "POST" = "POST"): PluginRoute {
	return {
		public: publicRoute, permission: publicRoute ? undefined : "plugins:manage", methods: [method],
		...(method === "POST" ? { request: { body: "json" as const, maxBytes: publicRoute ? 8192 : 512000 } } : {}),
		handler: async ctx => {
			try { return { ok: true, ...await handler(ctx) as object }; }
			catch (error) {
				if (error instanceof CampaignError) return { ok: false, error: error.message };
				ctx.log.error("Campaign request failed", { route: new URL(ctx.request.url).pathname, errorType: error instanceof Error ? error.name : "unknown" });
				return { ok: false, error: "We could not complete that request. Please try again." };
			}
		},
	};
}
export function createPlugin(options: { adminEntry: string }) {
	return definePlugin({
		id: pluginId, version: "0.3.2", capabilities: ["email:send", "content:write", "content:publish", "content:revisions:read", "media:read", "hooks.content-policy:register"],
		storage: {
			campaigns: { indexes: ["visibility", "status", "updatedAt", "autoDraw", "endsAt", "contentId", "launchAt"], uniqueIndexes: ["slug"] },
			participants: { indexes: ["campaignId", "entered"] },
			challenges: { indexes: ["expiresAt"] }, sessions: { indexes: ["expiresAt"] }, limits: { indexes: ["expiresAt"] }, draws: { indexes: [] },
		},
		admin: { entry: options.adminEntry },
		hooks: {
			"content:beforeSave": { handler: native.beforeSave, errorPolicy: "abort" },
			"content:afterSave": native.afterSave,
			"content:beforePublish": eventPolicy(native.beforePublish),
			"content:beforeSchedule": eventPolicy((event, ctx) => native.beforePublish(event, ctx, false)),
			"content:afterPublish": async (event, ctx) => { if (event.collection === "campaigns") await native.afterPublish(event.content, ctx); },
			"content:afterUnpublish": async (event, ctx) => { if (event.collection === "campaigns") await native.afterUnpublish(event.content, ctx); },
			"content:afterDelete": async (event, ctx) => { if (event.collection === "campaigns") await native.afterDelete(event.id, ctx); },
			"plugin:activate": async (_, ctx) => { await ctx.cron?.schedule("cleanup", { schedule: "0 * * * *" }); await service.ensureDrawScheduler(ctx); },
			cron: async (event, ctx) => {
				if (event.name === "cleanup") await service.cleanup(ctx);
				if (event.name === "draw-deadlines") await service.runDeadlineDraws(ctx);
				if (event.name.startsWith("draw-") && typeof event.data?.campaignId === "string") await service.runScheduledDraw(ctx, event.data.campaignId);
				if (event.name.startsWith("launch-") && typeof event.data?.campaignId === "string") await native.runScheduledLaunch(ctx, event.data.campaignId);
				if (event.name === "draw-deadlines") {
					const due = await service.stores(ctx).campaigns.query({ where: { status: "scheduled", launchAt: { lte: new Date().toISOString() } }, orderBy: { launchAt: "asc" }, limit: 10 });
					for (const c of due.items) await native.runScheduledLaunch(ctx, c.id);
				}
			},
		},
		routes: {
			catalog: route(service.catalog, true, "GET"), detail: route(service.detail, true, "GET"),
			register: route(service.register, true), "request-code": route(service.requestCode, true), verify: route(service.verify, true), participant: route(service.participant, true), enter: route(service.enter, true), submit: route(service.submit, true), "sign-out": route(service.signOut, true),
			"admin/list": route(service.adminList, false, "GET"), "admin/detail": route(service.adminDetail, false, "GET"), "admin/draw": route(service.draw), "admin/recover": route(service.recover), "admin/archive": route(service.archive),
			"admin/content-status": route(native.contentStatus, false, "GET"), "admin/activate-private": route(native.activatePrivate), "admin/launch": route(native.launch), "admin/cancel-launch": route(native.cancelLaunch), "admin/settings": route(native.saveSettings),
			"admin/export": {
				permission: "plugins:manage", methods: ["GET"], response: "raw",
				handler: async ctx => {
					try { return pluginResponse({ headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="campaign-data.csv"' }, body: { kind: "text", value: await service.exportCsv(ctx) } }); }
					catch (error) { return pluginResponse({ status: 400, headers: { "Content-Type": "application/json" }, body: { kind: "text", value: JSON.stringify({ error: error instanceof CampaignError ? error.message : "Could not export this campaign." }) } }); }
				},
			},
		},
	});
}
