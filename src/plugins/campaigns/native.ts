import type { ContentHookEvent, ContentPolicyEvent, PluginContext, PluginContentItem, RouteContext } from "emdash";
import { actionPreset, actionTypes, campaignDateError, campaignSlug, fail, parseCampaign, record, text, type Campaign, type CampaignAction } from "./model.ts";
import { portableHtml, requirePortableText } from "./portable.ts";
import { ensureDrawScheduler, hash, mutate, stores } from "./service.ts";

const collection = "campaigns";
const publication = "content-publication";
const actionSignature = (c: Campaign) => c.actions.map(({ id, type, title, url }) => ({ id, type, title, url }));
const configSignature = (c: Campaign) => JSON.stringify([c.slug, c.title, c.prize, c.image, c.description, c.rules, c.visibility, c.startsAt, c.endsAt, c.winnerCount, actionSignature(c), c.announcement]);
const termsSignature = (c: Campaign) => JSON.stringify([c.slug, c.startsAt, c.endsAt, c.winnerCount, actionSignature(c)]);

function item(value: unknown): PluginContentItem {
	const v = record(value);
	if (typeof v.id !== "string" || !v.data) fail("Campaign content is unavailable.");
	return v as unknown as PluginContentItem;
}
export function cleanActions(value: unknown): Array<Omit<CampaignAction, "answer">> {
	if (value === undefined || value === null) return [];
	if (!Array.isArray(value) || value.length > 20) fail("Use at most 20 entry actions.");
	return value.map(input => {
		const a = record(input);
		if ("answer" in a || "correct_answer" in a) fail("Correct answers belong in private Question answers settings, not content fields.");
		if (Object.keys(a).some(key => !["id", "type", "title", "instructions", "url", "points", "required"].includes(key))) fail("Unknown campaign action field.");
		if (!actionTypes.includes(a.type as CampaignAction["type"])) fail("Choose a valid action type.");
		const id = text(a.id, "Action ID", 50) || crypto.randomUUID();
		if (!/^[a-zA-Z0-9-]+$/.test(id) || Object.hasOwn(Object.prototype, id)) fail("Invalid action ID.");
		return { id, type: a.type as CampaignAction["type"], title: text(a.title, "Action title", 160), instructions: actionPreset(a.type as CampaignAction["type"]).instructions, url: text(a.url, "Action link", 2000), required: true };
	});
}
async function image(ctx: PluginContext, value: unknown) {
	if (!value) return { image: "", imageId: "" };
	const v = typeof value === "string" ? { id: value } : record(value);
	const id = typeof v.id === "string" ? v.id : "";
	const media = id ? await ctx.media?.get(id) : null;
	return { image: media?.url ?? (typeof v.src === "string" ? v.src : ""), imageId: id };
}
async function candidate(ctx: PluginContext, doc: PluginContentItem, current?: Campaign | null, active = false) {
	const d = doc.data;
	const id = text(d.campaign_key, "Campaign reference", 100, true);
	const window = d.entry_window ? record(d.entry_window) : {};
	const actions = cleanActions(d.actions).map(a => ({ ...a, answer: current?.privateAnswers?.[a.id] ?? current?.actions.find(old => old.id === a.id)?.answer ?? "" }));
	const fields = {
		id, slug: doc.slug || campaignSlug(String(d.title ?? "")) || `campaign-${id.toLowerCase()}`,
		title: String(d.title ?? ""), prize: String(d.prize ?? ""), description: await portableHtml(ctx, d.description), rules: await portableHtml(ctx, d.rules),
		...await image(ctx, d.image), contentFormat: "html" as const,
		startsAt: String(window.startsAt ?? ""), endsAt: String(window.endsAt ?? ""),
		visibility: d.visibility === "private" ? "private" as const : "public" as const,
		winnerCount: Number(d.winner_count ?? 1), actions, invites: current?.invites ?? [],
		status: "draft" as Campaign["status"], autoDraw: true, updatedAt: new Date().toISOString(), pendingWrites: {},
		contentId: doc.id, nativeManaged: current?.nativeManaged ?? !current, nativeRevision: await hash(JSON.stringify([doc.slug, d])), announcement: d.visibility !== "private",
		announcementId: current?.announcementId,
		privateAnswers: current?.privateAnswers,
	};
	if (!active) return fields;
	requirePortableText(fields.description, "Campaign description"); requirePortableText(fields.rules, "Rules and eligibility");
	const parsed = parseCampaign({ ...fields, status: "published", invites: fields.invites.join("\n") }, id);
	return { ...parsed, contentId: doc.id, nativeRevision: fields.nativeRevision, announcement: fields.announcement, announcementId: current?.announcementId };
}
async function validateChanges(ctx: PluginContext, current: Campaign, next: Campaign) {
	if (current.pendingWrites[publication]) fail("A publication is in progress. Retry publishing or recover the interrupted publication before editing.");
	if (Object.keys(current.pendingWrites).length) fail("An entry or review is being updated. Please retry shortly.");
	if (await stores(ctx).draws.exists(current.id) || (current.autoDraw && current.status === "published" && Date.parse(current.endsAt) <= Date.now())) {
		if (configSignature(current) !== configSignature(next)) fail("This campaign has closed or been drawn. Its content and entry terms are locked.");
	}
	if (await stores(ctx).participants.count({ campaignId: current.id, entered: true }) && termsSignature(current) !== termsSignature(next)) fail("Actions, URL, dates and winner count are locked after the first entrant. Create a new campaign to change them.");
}
export async function beforeSave(event: ContentHookEvent, ctx: PluginContext) {
	if (event.collection !== collection) return;
	if (event.actor && event.actor.role < 50) fail("Only administrators can configure giveaway campaigns.");
	const existing = event.id ? await ctx.content?.get(collection, event.id) : null;
	const d = { ...existing?.data, ...event.content };
	if ("invites" in d || "answers" in d) fail("Invitations and answers must be configured through private Campaign controls.");
	let key = text(d.campaign_key, "Campaign reference", 100);
	const old = key ? await stores(ctx).campaigns.get(key) : null;
	if (event.isNew && (!key || old?.contentId)) key = crypto.randomUUID();
	if (!event.isNew && key !== existing?.data.campaign_key) fail("The managed campaign reference cannot be changed.");
	d.campaign_key = key;
	d.visibility ??= "public"; d.winner_count ??= 1; d.announce = d.visibility !== "private";
	if (d.publishing) { const p = record(d.publishing); if (p.mode !== undefined && !["now", "schedule"].includes(String(p.mode))) fail("Choose immediate publication or scheduled go-live."); }
	d.actions = cleanActions(d.actions);
	const window = d.entry_window ? record(d.entry_window) : {};
	if (window.startsAt && window.endsAt) { const error = campaignDateError(String(window.startsAt), String(window.endsAt)); if (error) fail(error); }
	if (existing && old && old.contentId === existing.id) {
		// No-op saves remain possible for migrated historical records.
		if (JSON.stringify(d) !== JSON.stringify(existing.data)) await validateChanges(ctx, old, await candidate(ctx, { ...existing, data: d }, old));
	}
	return d;
}
export async function afterSave(event: ContentHookEvent, ctx: PluginContext) {
	if (event.collection !== collection) return;
	const eventDoc = item(event.content);
	const latest = await ctx.content?.getVersioned?.(collection, eventDoc.id);
	const doc = latest?.item ?? eventDoc;
	const id = text(doc.data.campaign_key, "Campaign reference", 100, true);
	const next = await candidate(ctx, doc, await stores(ctx).campaigns.get(id));
	await mutate(stores(ctx).campaigns, id, current => {
		if (current?.contentId && current.contentId !== doc.id) fail("This campaign is already linked to another content entry.");
		if (current?.pendingWrites[publication]) return current;
		// Active config is a published snapshot; autosave must not change it.
		return current && current.status !== "draft" ? { ...current, contentId: doc.id } : { ...next, invites: current?.invites ?? [], actions: next.actions, announcementId: current?.announcementId };
	});
	await syncAnnouncement(ctx, next, false);
}
export async function beforePublish(event: ContentPolicyEvent, ctx: PluginContext, reserve = true) {
	if (event.collection !== collection) return;
	try {
		const doc = item(event.content);
		const id = text(doc.data.campaign_key, "Campaign reference", 100, true);
		const old = await stores(ctx).campaigns.getVersioned(id);
		const next = await candidate(ctx, doc, old?.value, true);
		if (next.visibility === "private") fail("Use Publish in the campaign editor to activate unlisted access. Unlisted campaigns stay out of public CMS content.");
		if (old?.value.pendingWrites[publication] && old.value.pendingContent?.nativeRevision === next.nativeRevision) return;
		if (old) await validateChanges(ctx, old.value, next);
		await ensureDrawScheduler(ctx);
		if (reserve) {
			const updated = await stores(ctx).campaigns.compareAndSet(id, old?.revision ?? null, { ...(old?.value ?? next), contentId: doc.id, pendingContent: next, pendingWrites: { [publication]: Date.now() } });
			if (!updated.applied) fail("Campaign state changed while publishing. Please try again.");
		}
	} catch (error) { return { cancel: true as const, reason: error instanceof Error ? error.message : "Campaign validation failed." }; }
}
export async function afterPublish(value: unknown, ctx: PluginContext) {
	const doc = item(value);
	const id = text(doc.data.campaign_key, "Campaign reference", 100, true);
	const old = await stores(ctx).campaigns.get(id);
	const next = await candidate(ctx, doc, old, true);
	await commit(ctx, next);
}
async function commit(ctx: PluginContext, next: Campaign) {
	const drawn = await stores(ctx).draws.exists(next.id);
	await mutate(stores(ctx).campaigns, next.id, (current): Campaign => ({ ...next, nativeManaged: true, status: drawn ? "drawn" : "published", invites: current?.invites ?? next.invites, privateAnswers: current?.privateAnswers, announcementId: current?.announcementId, pendingWrites: {} }));
	await ensureDrawScheduler(ctx);
	if (!drawn) await ctx.cron?.schedule(`draw-${next.id}`, { schedule: next.endsAt, data: { campaignId: next.id } });
	await syncAnnouncement(ctx, next, true);
}
export async function afterUnpublish(value: unknown, ctx: PluginContext) {
	const doc = item(value);
	const id = text(doc.data.campaign_key, "Campaign reference", 100, true);
	const existing = await stores(ctx).campaigns.get(id);
	if (!existing) return;
	await mutate(stores(ctx).campaigns, id, (current): Campaign => { if (!current) fail("Campaign not found."); return { ...current, status: current.status === "archived" ? "archived" : "draft", pendingWrites: {}, pendingContent: undefined }; });
	await ctx.cron?.cancel(`draw-${id}`);
	await ctx.cron?.cancel(`launch-${id}`);
	await withdrawAnnouncement(ctx, id);
}
export async function afterDelete(id: string, ctx: PluginContext) {
	const result = await stores(ctx).campaigns.query({ where: { contentId: id }, limit: 1 });
	const current = result.items[0]?.data;
	if (!current) return;
	await mutate(stores(ctx).campaigns, current.id, (c): Campaign => { if (!c) fail("Campaign not found."); return { ...c, status: "archived", pendingWrites: {}, pendingContent: undefined }; });
	await ctx.cron?.cancel(`draw-${current.id}`); await withdrawAnnouncement(ctx, current.id);
	await ctx.cron?.cancel(`launch-${current.id}`);
}
export async function contentStatus(ctx: RouteContext) {
	const id = text(record(ctx.input).contentId, "Content entry", 100, true);
	const current = await ctx.content?.getVersioned?.(collection, id);
	if (!current) fail("Campaign content not found.");
	const key = text(current.item.data.campaign_key, "Campaign reference", 100, true);
	if (!await stores(ctx).campaigns.exists(key)) await afterSave({ collection, isNew: true, content: current.item as unknown as Record<string, unknown> }, ctx);
	const c = await stores(ctx).campaigns.get(key);
	return { campaign: c, contentRevision: current._rev, locked: Boolean(await stores(ctx).participants.count({ campaignId: key, entered: true })) || await stores(ctx).draws.exists(key) };
}
export async function activatePrivate(ctx: RouteContext) {
	const v = record(ctx.input);
	const current = await ctx.content?.getVersioned?.(collection, text(v.contentId, "Content entry", 100, true));
	if (!current || current._rev !== v.contentRevision) fail("The saved draft changed. Refresh Campaign controls and try again.");
	if (current.item.status === "published") fail("Unpublish the public entry before activating it as unlisted.");
	const key = text(current.item.data.campaign_key, "Campaign reference", 100, true);
	const old = await stores(ctx).campaigns.getVersioned(key);
	const next = await candidate(ctx, current.item, old?.value, true);
	if (next.visibility !== "private") fail("Public campaigns use the native Publish action.");
	if (old) await validateChanges(ctx, old.value, next);
	const reserved = await stores(ctx).campaigns.compareAndSet(key, old?.revision ?? null, { ...(old?.value ?? next), contentId: current.item.id, pendingContent: next, pendingWrites: { [publication]: Date.now() } });
	if (!reserved.applied) fail("Campaign state changed. Please retry.");
	// Fence against an autosave that completed while activation was prepared.
	const latest = await ctx.content?.getVersioned?.(collection, current.item.id);
	if (latest?._rev !== v.contentRevision) { await mutate(stores(ctx).campaigns, key, c => { if (!c) fail("Campaign not found."); return { ...c, pendingWrites: {}, pendingContent: undefined }; }); fail("The draft changed. Save and refresh before activating."); }
	await commit(ctx, next);
	return { id: key };
}
export async function launch(ctx: RouteContext) {
	const v = record(ctx.input);
	const current = await ctx.content?.getVersioned?.(collection, text(v.contentId, "Content entry", 100, true));
	if (!current || current._rev !== v.contentRevision) fail("The saved draft changed. Refresh and try again.");
	const key = text(current.item.data.campaign_key, "Campaign reference", 100, true);
	const old = await stores(ctx).campaigns.getVersioned(key);
	const next = await candidate(ctx, current.item, old?.value, true);
	if (old) await validateChanges(ctx, old.value, next);
	const publishing = current.item.data.publishing ? record(current.item.data.publishing) : {};
	if (publishing.mode === "schedule") {
		const at = text(publishing.at, "Go-live date", 40, true);
		if (!Number.isFinite(Date.parse(at)) || Date.parse(at) <= Date.now()) fail("Choose a future go-live date.");
		if (Date.parse(at) >= Date.parse(next.endsAt)) fail("Go-live must be before entries close.");
		if (old?.value.status !== "draft" && old?.value.status !== "scheduled") fail("Unpublish this campaign before scheduling a new go-live.");
		await ensureDrawScheduler(ctx);
		if (!ctx.cron) fail("Campaign scheduling is unavailable.");
		const saved = await stores(ctx).campaigns.compareAndSet(key, old?.revision ?? null, { ...next, status: "scheduled", launchAt: new Date(at).toISOString(), pendingContent: next });
		if (!saved.applied) fail("Campaign state changed. Please retry.");
		await ctx.cron.schedule(`launch-${key}`, { schedule: at, data: { campaignId: key } });
		return { id: key, scheduled: true };
	}
	await ctx.cron?.cancel(`launch-${key}`);
	if (next.visibility === "private") return activatePrivate(ctx);
	await ctx.content?.publish?.(collection, current.item.id, { _rev: current._rev });
	return { id: key };
}
export async function runScheduledLaunch(ctx: PluginContext, id: string) {
	const version = await stores(ctx).campaigns.getVersioned(id);
	const c = version?.value;
	if (!c || c.status !== "scheduled" || !c.launchAt || Date.parse(c.launchAt) > Date.now()) return;
	if (Object.keys(c.pendingWrites).length) return;
	try {
		const current = c.contentId ? await ctx.content?.getVersioned?.(collection, c.contentId) : null;
		if (!current || await hash(JSON.stringify([current.item.slug, current.item.data])) !== c.nativeRevision) fail("The scheduled draft changed. Review it and schedule again.");
		const next = await candidate(ctx, current.item, c, true);
		const reserved = await stores(ctx).campaigns.compareAndSet(id, version!.revision, { ...c, pendingContent: next, pendingWrites: { [publication]: Date.now() } });
		if (!reserved.applied) return;
		const latest = await ctx.content?.getVersioned?.(collection, current.item.id);
		if (latest?._rev !== current._rev) fail("The scheduled draft changed during publication. Review it and schedule again.");
		if (next.visibility === "private") await commit(ctx, next);
		else await ctx.content?.publish?.(collection, current.item.id, { _rev: current._rev });
	} catch (error) {
		await mutate(stores(ctx).campaigns, id, (current): Campaign => { if (!current) fail("Campaign not found."); return { ...current, ...(current.status === "scheduled" ? { status: "draft" as const, launchAt: undefined, pendingContent: undefined, pendingWrites: {} } : {}), drawError: error instanceof Error ? error.message : "Scheduled publication failed. Please retry." }; });
	}
}
export async function cancelLaunch(ctx: RouteContext) {
	const id = text(record(ctx.input).id, "Campaign", 100, true);
	await mutate(stores(ctx).campaigns, id, (c): Campaign => { if (!c || c.status !== "scheduled") fail("This campaign is not scheduled."); if (Object.keys(c.pendingWrites).length) fail("Publication is in progress. Please retry shortly."); return { ...c, status: "draft", launchAt: undefined, pendingContent: undefined }; });
	await ctx.cron?.cancel(`launch-${id}`);
	return {};
}
export async function saveSettings(ctx: RouteContext) {
	const v = record(ctx.input);
	const id = text(v.id, "Campaign", 100, true);
	const c = await stores(ctx).campaigns.getVersioned(id);
	if (!c || c.revision !== v.revision) fail("Campaign state changed. Refresh before saving question answers.");
	if (Object.keys(c.value.pendingWrites).length) fail("A campaign update is in progress. Retry shortly.");
	if (await stores(ctx).draws.exists(id) || (c.value.autoDraw && c.value.status === "published" && Date.now() >= Date.parse(c.value.endsAt))) fail("Question answers are locked after closing.");
	const answers = record(v.answers ?? {});
	let proposedActions = c.value.actions;
	if (c.value.contentId) {
		const doc = await ctx.content?.getVersioned?.(collection, c.value.contentId);
		if (doc) proposedActions = (await candidate(ctx, doc.item, c.value)).actions;
	}
	if (Object.keys(answers).some(key => !proposedActions.some(a => a.id === key && a.type === "question"))) fail("Unknown question answer.");
	const privateAnswers = Object.fromEntries(proposedActions.filter(a => a.type === "question").map(a => [a.id, text(answers[a.id] ?? a.answer, "Correct answer", 500)]));
	if (await stores(ctx).participants.count({ campaignId: id, entered: true }) && Object.entries(privateAnswers).some(([key, value]) => value !== c.value.actions.find(a => a.id === key)?.answer)) fail("Correct answers are locked after the first entrant.");
	const actions = c.value.status === "draft" || !c.value.contentId ? proposedActions.map(a => ({ ...a, answer: privateAnswers[a.id] ?? a.answer })) : c.value.actions;
	const saved = await stores(ctx).campaigns.compareAndSet(id, c.revision, { ...c.value, privateAnswers, actions });
	if (!saved.applied) fail("Campaign state changed. Refresh and retry.");
	return {};
}
async function announcement(ctx: PluginContext, id: string) {
	const found = await ctx.content?.list("announcements", { where: { fieldFilters: { campaign_ref: id } }, limit: 1 });
	return found?.items[0] ?? null;
}
export async function withdrawAnnouncement(ctx: PluginContext, id: string) {
	const found = await announcement(ctx, id);
	if (found?.status === "published") { const current = await ctx.content?.getVersioned?.("announcements", found.id); if (current) await ctx.content?.unpublish?.("announcements", found.id, { _rev: current._rev }); }
}
export async function syncAnnouncement(ctx: PluginContext, c: Campaign, active: boolean) {
	if (c.visibility === "private" || !c.announcement) { if (active) await withdrawAnnouncement(ctx, c.id); return; }
	const data = { campaign_ref: c.id, title: `${c.title} — ${c.prize || "Community giveaway"}`, starts_at: null, ends_at: c.endsAt || null, cta_label: "View campaign", cta_url: `/campaigns/${c.slug}`, cta_new_tab: false };
	let found = await announcement(ctx, c.id);
	if (!found) {
		// Keep the generated system slug short and unique; update display text below.
		try { found = await ctx.content?.create?.("announcements", { ...data, title: `Campaign ${c.id}` }) ?? null; }
		catch (error) { found = await announcement(ctx, c.id); if (!found) throw error; }
	}
	if (!found) fail("Announcement creation is unavailable.");
	await ctx.content?.update?.("announcements", found.id, data);
	await mutate(stores(ctx).campaigns, c.id, current => { if (!current) fail("Campaign not found."); return { ...current, announcementId: found!.id }; });
	if (active) { const current = await ctx.content?.getVersioned?.("announcements", found.id); if (current) await ctx.content?.publish?.("announcements", found.id, { _rev: current._rev }); }
}
