import type { PluginContext, RouteContext, StorageCollection } from "emdash";
import {
	CampaignError, csvCell, emailAddress, fail, isOpen,
	participantView, pickWinners, publicCampaign, randomBelow, record, summary, text,
	qualifiesForDraw,
	type Campaign, type Draw, type Participant,
} from "./model.ts";

interface Challenge { campaignId: string; email: string; name: string; consentAt: string; codeHash: string; expiresAt: number; attempts: number; used: boolean }
interface Session { campaignId: string; participantId: string; expiresAt: number }
interface Rate { count: number; expiresAt: number }
export const stores = (ctx: PluginContext) => ({
	campaigns: ctx.storage.campaigns as StorageCollection<Campaign>,
	participants: ctx.storage.participants as StorageCollection<Participant>,
	challenges: ctx.storage.challenges as StorageCollection<Challenge>,
	sessions: ctx.storage.sessions as StorageCollection<Session>,
	limits: ctx.storage.limits as StorageCollection<Rate>,
	draws: ctx.storage.draws as StorageCollection<Draw>,
});
export async function hash(value: string) {
	const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
	return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join("");
}
const nowISO = () => new Date().toISOString();
const token = () => [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, "0")).join("");

export async function mutate<T>(store: StorageCollection<T>, id: string, change: (current: NoInfer<T> | null) => NoInfer<T>) {
	for (let attempt = 0; attempt < 8; attempt++) {
		const current = await store.getVersioned(id);
		const next = change(current?.value ?? null);
		const written = await store.compareAndSet(id, current?.revision ?? null, next);
		if (written.applied) return next;
		await new Promise(resolve => setTimeout(resolve, 10 + randomBelow(30)));
	}
	return fail("Another request is updating this campaign. Please try again.");
}
async function limited(ctx: PluginContext, key: string, max: number) {
	const hour = Math.floor(Date.now() / 3600000);
	await mutate(stores(ctx).limits, await hash(`${key}:${hour}`), current => {
		if ((current?.count ?? 0) >= max) fail("Too many attempts. Please try again in an hour.");
		return { count: (current?.count ?? 0) + 1, expiresAt: (hour + 2) * 3600000 };
	});
}
export function sameOrigin(ctx: RouteContext) {
	if (ctx.request.headers.get("origin") !== new URL(ctx.request.url).origin) fail("This request must come from the campaign website.");
}
export async function campaign(ctx: PluginContext, id: unknown) {
	const c = await stores(ctx).campaigns.get(text(id, "Campaign", 100, true));
	if (!c) fail("Campaign not found.");
	if (c.contentId && c.nativeManaged && c.visibility === "public" && ["published", "drawing", "drawn"].includes(c.status)) {
		const item = await ctx.content?.get("campaigns", c.contentId);
		if (!item || item.status !== "published") return { ...c, status: "draft" as const };
	}
	return c;
}
function eligible(_c: Campaign, _email: string) {
	return true;
}
function accessible(c: Campaign) {
	return ["published", "drawing", "drawn"].includes(c.status);
}

// The durable write gate freezes all entry/review changes before a draw snapshot.
// ponytail: a crashed write blocks the draw; explicit recovery after 15 minutes
// is preferable to silently drawing against a potentially changing entry pool.
async function withWrite<T>(ctx: PluginContext, id: string, run: (c: Campaign) => Promise<T>) {
	const store = stores(ctx).campaigns;
	const operation = crypto.randomUUID();
	const c = await mutate(store, id, current => {
		if (!current || current.status !== "published") fail("This campaign is not accepting changes.");
		if (current.pendingWrites["content-publication"]) fail("Campaign content is publishing. Please try again shortly.");
		return { ...current, pendingWrites: { ...current.pendingWrites, [operation]: Date.now() } };
	});
	try { return await run(c); }
	finally {
		await mutate(store, id, current => {
			if (!current) fail("Campaign not found.");
			const pendingWrites = { ...current.pendingWrites };
			delete pendingWrites[operation];
			return { ...current, pendingWrites };
		});
	}
}
export async function catalog(ctx: RouteContext) {
	const v = record(ctx.input);
	const result = await stores(ctx).campaigns.query({ where: { visibility: "public", status: { in: ["published", "drawing", "drawn"] } }, limit: 20, cursor: text(v.cursor, "Cursor", 2000) || undefined, orderBy: { updatedAt: "desc" } });
	const current = await Promise.all(result.items.map(i => campaign(ctx, i.id)));
	return { items: current.filter(c => accessible(c)).map(summary), cursor: result.cursor };
}
export async function detail(ctx: RouteContext) {
	const v = record(ctx.input);
	const result = await stores(ctx).campaigns.query({ where: { slug: text(v.slug, "Campaign URL", 100, true) }, limit: 1 });
	const c = result.items[0] ? await campaign(ctx, result.items[0].id) : null;
	if (!c || !accessible(c)) return { campaign: null };
	return { campaign: publicCampaign(c) };
}
export async function register(ctx: RouteContext) {
	sameOrigin(ctx);
	const v = record(ctx.input);
	const c = await campaign(ctx, v.campaignId);
	const email = emailAddress(v.email);
	const name = text(v.name, "Name", 100, true);
	if (v.consent !== true) fail("Agree to the use of your details to administer this campaign.");
	if (!isOpen(c)) fail("This campaign is not open for entries.");
	await limited(ctx, `register-email:${c.id}:${email}`, 5);
	await limited(ctx, `register-ip:${ctx.requestMeta.ip ?? "unknown"}`, ctx.requestMeta.ip ? 30 : 100);
	await limited(ctx, `register-campaign:${c.id}`, 300);
	const id = await hash(`${c.id}:${email}`);
	const p = await withWrite(ctx, c.id, async fresh => {
		if (!isOpen(fresh)) fail("This campaign is not open for entries.");
		if (await stores(ctx).participants.count({ campaignId: c.id }) >= 10000) fail("This campaign has reached its participant capacity. Contact the organiser.");
		return mutate(stores(ctx).participants, id, current => {
			// An unverified address must never grant access to somebody else's existing entry.
			if (current) fail("Unable to register this address. If you already registered, use your original browser session or contact the organiser.");
			return { campaignId: c.id, email, name, registeredAt: nowISO(), consentAt: "", entered: false, submissions: {}, attempts: {} };
		});
	});
	const sessionToken = token();
	await stores(ctx).sessions.put(await hash(sessionToken), { campaignId: c.id, participantId: id, expiresAt: Date.now() + 7 * 86400000 });
	return { token: sessionToken, campaign: publicCampaign(c), participant: participantView(p, c) };
}
export async function requestCode(ctx: RouteContext) {
	sameOrigin(ctx);
	const v = record(ctx.input);
	const c = await campaign(ctx, v.campaignId);
	const email = emailAddress(v.email);
	const name = text(v.name, "Name", 100, true);
	if (v.consent !== true) fail("Agree to the use of your details for campaign verification.");
	if (!accessible(c)) fail("Campaign not found.");
	await limited(ctx, `email:${c.id}:${email}`, 5);
	await limited(ctx, `ip:${ctx.requestMeta.ip ?? "unknown"}`, ctx.requestMeta.ip ? 30 : 100);
	await limited(ctx, `campaign:${c.id}`, 300);
	const generic = { message: "If your address is eligible, a verification code is on its way. Check your inbox and spam folder." };
	if (!eligible(c, email)) return generic;
	const participantId = await hash(`${c.id}:${email}`);
	if (Date.now() >= Date.parse(c.endsAt) && !await stores(ctx).participants.exists(participantId)) return generic;
	if (!ctx.email) fail("Email delivery is not configured. Please contact the organiser.");
	const code = String(randomBelow(1000000)).padStart(6, "0");
	const challenge: Challenge = { campaignId: c.id, email, name, consentAt: nowISO(), codeHash: await hash(`${participantId}:${code}`), expiresAt: Date.now() + 600000, attempts: 0, used: false };
	const store = stores(ctx).challenges;
	const saved = await mutate(store, participantId, () => challenge);
	try {
		await ctx.email.send({ to: email, subject: `Your Techies campaign verification code`, text: `Your code is ${code}.\n\nIt expires in 10 minutes and can be used once. Enter it on the Techies campaign page. If you did not request it, ignore this email.` });
	} catch {
		const current = await store.getVersioned(participantId);
		if (current?.value.codeHash === saved.codeHash) await store.compareAndDelete(participantId, current.revision);
		return fail("We could not send your code. Please try again later or contact the organiser.");
	}
	return generic;
}
export async function verify(ctx: RouteContext) {
	sameOrigin(ctx);
	const v = record(ctx.input);
	const c = await campaign(ctx, v.campaignId);
	const email = emailAddress(v.email);
	const code = text(v.code, "Verification code", 6, true);
	if (!/^\d{6}$/.test(code)) fail("Enter the six-digit code from your email.");
	await limited(ctx, `verify:${ctx.requestMeta.ip ?? "unknown"}`, 150);
	const id = await hash(`${c.id}:${email}`);
	const codeHash = await hash(`${id}:${code}`);
	let matched = false;
	const challenge = await mutate(stores(ctx).challenges, id, current => {
		if (!current || current.used || current.attempts >= 6 || current.expiresAt <= Date.now()) fail("Invalid or expired code. Request a new code.");
		matched = current.codeHash === codeHash;
		return { ...current, attempts: current.attempts + 1, used: matched };
	});
	if (!matched || !accessible(c) || !eligible(c, email)) fail("Invalid or expired code. Request a new code.");
	let p = await stores(ctx).participants.get(id);
	if (!p) {
		if (Date.now() >= Date.parse(c.endsAt)) fail("Entries have closed. New participants can no longer register.");
		p = await withWrite(ctx, c.id, async fresh => {
			if (Date.now() >= Date.parse(fresh.endsAt)) fail("Entries have closed.");
			if (!eligible(fresh, email)) fail("This address is not eligible for the campaign.");
			if (await stores(ctx).participants.count({ campaignId: c.id }) >= 10000) fail("This campaign has reached its participant capacity. Contact the organiser.");
			return mutate(stores(ctx).participants, id, current => current ?? { campaignId: c.id, email, name: challenge.name, verifiedAt: nowISO(), consentAt: "", entered: false, submissions: {}, attempts: {} });
		});
	}
	const sessionToken = token();
	await stores(ctx).sessions.put(await hash(sessionToken), { campaignId: c.id, participantId: id, expiresAt: Date.now() + 7 * 86400000 });
	const fresh = await campaign(ctx, c.id);
	if (!accessible(fresh) || !eligible(fresh, email)) fail("This address no longer has access to the campaign.");
	return { token: sessionToken, campaign: publicCampaign(fresh), participant: participantView(p, fresh) };
}
async function authenticated(ctx: RouteContext) {
	sameOrigin(ctx);
	const v = record(ctx.input);
	const sessionToken = text(v.token, "Session", 64, true);
	if (!/^[0-9a-f]{64}$/.test(sessionToken)) fail("Register for this campaign to continue.");
	const session = await stores(ctx).sessions.get(await hash(sessionToken));
	if (!session || session.expiresAt <= Date.now() || session.campaignId !== v.campaignId) fail("Your session expired. Please contact the organiser if you already registered.");
	const c = await campaign(ctx, session.campaignId);
	const p = await stores(ctx).participants.get(session.participantId);
	if (!p || !accessible(c) || !eligible(c, p.email)) fail("You do not have access to this campaign.");
	return { c, p, id: session.participantId, input: v };
}
export async function participant(ctx: RouteContext) {
	const { c, p } = await authenticated(ctx);
	return { campaign: publicCampaign(c), participant: participantView(p, c) };
}
export async function enter(ctx: RouteContext) {
	const { c, p, id, input } = await authenticated(ctx);
	if (input.consent !== true) fail("Agree to the campaign rules and eligibility before entering.");
	const result = await withWrite(ctx, c.id, async fresh => {
		if (!isOpen(fresh) || !eligible(fresh, p.email)) fail("This campaign is not open for entries.");
		const rulesHash = await hash(fresh.rules);
		await ctx.kv.compareAndSet(`rules:${fresh.id}:${rulesHash}`, null, { campaignId: fresh.id, rules: fresh.rules, recordedAt: nowISO() });
		return mutate(stores(ctx).participants, id, (current): Participant => {
			if (!current) fail("Participant not found.");
			return current.entered ? current : { ...current, entered: true, consentAt: nowISO(), rulesHash };
		});
	});
	return { participant: participantView(result, c) };
}
export async function submit(ctx: RouteContext) {
	const { c, p, id, input } = await authenticated(ctx);
	if (!p.entered) fail("Accept the campaign rules and enter before completing actions.");
	const actionId = text(input.actionId, "Action", 50, true);
	const response = text(input.response, "Answer or confirmation", 4000, true);
	let incorrect = false;
	const result = await withWrite(ctx, c.id, async fresh => {
		if (!isOpen(fresh) || !eligible(fresh, p.email)) fail("This campaign is closed for entries.");
		const action = fresh.actions.find(a => a.id === actionId);
		if (!action) fail("Entry action not found.");
		if (action.type !== "question" && response !== "confirmed") fail("Confirm that you completed this action.");
		return mutate(stores(ctx).participants, id, (current): Participant => {
			if (!current) fail("Participant not found.");
			incorrect = false;
			const previous = current.submissions[actionId];
			if (previous?.status === "approved") return current;
			const attempts = (current.attempts[actionId] ?? 0) + 1;
			if (attempts > 6) fail("This action has reached its submission limit. Contact the organiser.");
			incorrect = action.type === "question" && Boolean(action.answer) && response.trim().toLocaleLowerCase("en") !== action.answer.trim().toLocaleLowerCase("en");
			if (incorrect) return { ...current, attempts: { ...current.attempts, [actionId]: attempts } };
			return { ...current, attempts: { ...current.attempts, [actionId]: attempts }, submissions: { ...current.submissions, [actionId]: { response, status: "approved", submittedAt: nowISO() } } };
		});
	});
	if (incorrect) fail("That answer does not match. Please try again.");
	return { participant: participantView(result, c) };
}
export async function signOut(ctx: RouteContext) {
	sameOrigin(ctx);
	const v = record(ctx.input);
	await stores(ctx).sessions.delete(await hash(text(v.token, "Session", 64, true)));
	return {};
}
export async function adminList(ctx: RouteContext) {
	const v = record(ctx.input);
	const result = await stores(ctx).campaigns.query({ where: v.archived === "true" ? {} : { status: { in: ["draft", "published", "drawing", "drawn"] } }, limit: 50, cursor: text(v.cursor, "Cursor", 2000) || undefined, orderBy: { updatedAt: "desc" } });
	return result;
}
export async function adminDetail(ctx: RouteContext) {
	const v = record(ctx.input);
	const id = text(v.id, "Campaign", 100, true);
	const current = await stores(ctx).campaigns.getVersioned(id);
	if (!current) fail("Campaign not found.");
	const result = await stores(ctx).participants.query({ where: { campaignId: id }, limit: 50, cursor: text(v.cursor, "Cursor", 2000) || undefined });
	let questionActions = current.value.actions;
	if (current.value.contentId) { const doc = await ctx.content?.getVersioned?.("campaigns", current.value.contentId); if (Array.isArray(doc?.item.data.actions)) questionActions = doc.item.data.actions as Campaign["actions"]; }
	const questions = questionActions.filter(a => a.type === "question").map(a => ({ id: a.id, title: a.title, answer: current.value.privateAnswers?.[a.id] ?? current.value.actions.find(old => old.id === a.id)?.answer ?? "" }));
	return { campaign: current.value, revision: current.revision, questions, participants: result.items.map(i => ({ id: i.id, ...participantView(i.data, current.value) })), cursor: result.cursor, hasMore: result.hasMore, count: await stores(ctx).participants.count({ campaignId: id }), draw: await stores(ctx).draws.get(id) };
}
export async function ensureDrawScheduler(ctx: PluginContext) {
	if (!ctx.cron) fail("The campaign scheduler is unavailable. Configure scheduled tasks before publishing.");
	const tasks = await ctx.cron.list();
	if (!tasks.some(task => task.name === "draw-deadlines")) await ctx.cron.schedule("draw-deadlines", { schedule: "* * * * *" });
}
async function allParticipants(ctx: PluginContext, id: string) {
	const items: Array<{ id: string; data: Participant }> = [];
	let cursor: string | undefined;
	let bytes = 0;
	do {
		const page = await stores(ctx).participants.query({ where: { campaignId: id }, limit: 100, cursor });
		for (const item of page.items) bytes += new TextEncoder().encode(JSON.stringify(item.data)).byteLength;
		if (bytes > 16 * 1024 * 1024) fail("This campaign exceeds the in-memory draw/export limit. Contact the organiser for a larger-pool export or draw.");
		items.push(...page.items);
		cursor = page.cursor;
		if (items.length > 10100) fail("This campaign exceeds the draw/export capacity. Contact the organiser.");
	} while (cursor);
	return items;
}
export async function drawCampaign(ctx: PluginContext, id: string, actor: string) {
	const visible = await campaign(ctx, id);
	if (visible.contentId && visible.nativeManaged && visible.visibility === "public" && visible.status === "draft") fail("This campaign is not published.");
	const s = stores(ctx);
	const existing = await s.draws.get(id);
	if (existing) {
		await mutate(s.campaigns, id, (c): Campaign => { if (!c) fail("Campaign not found."); return c.status === "archived" ? c : { ...c, status: "drawn" }; });
		return { draw: existing };
	}
	const c = await mutate(s.campaigns, id, (current): Campaign => {
		if (current?.status === "drawn") return current;
		if (!current || !["published", "drawing"].includes(current.status)) fail("Publish and close the campaign before drawing winners.");
		if (Date.parse(current.endsAt) > Date.now()) fail("Wait until entries close before drawing winners.");
		if (Object.keys(current.pendingWrites).length) fail("An entry or review is still being updated. Retry shortly; use recovery only for interrupted requests.");
		return { ...current, status: "drawing", drawError: "" };
	});
	const committedDraw = await s.draws.get(id);
	if (committedDraw) return { draw: committedDraw };
	if (c.status === "drawn") fail("Saved draw missing. Contact the organiser; a new draw will not be performed.");
	try {
		// ponytail: load at most 10,100 entrants; use reservoir sampling for larger campaigns.
		const participants = (await allParticipants(ctx, id)).filter(p => qualifiesForDraw(c, p.data));
		const pool = participants.map(p => ({ id: p.id, name: p.data.name, email: p.data.email, entries: 1 })).sort((a, b) => a.id.localeCompare(b.id));
		const eligibility = pool.map(({ id, entries }) => ({ id, entries }));
		const result: Draw = { at: nowISO(), actor, deadline: c.endsAt, unfilledPrizes: Math.max(0, c.winnerCount - pool.length), algorithm: "crypto-uniform-without-replacement-v1", eligibilityHash: await hash(JSON.stringify(eligibility)), eligible: eligibility, winners: pickWinners(pool, Math.min(c.winnerCount, pool.length)) };
		const committed = await s.draws.compareAndSet(id, null, result);
		const saved = committed.applied ? result : await s.draws.get(id);
		if (!saved) fail("The draw could not be saved. Please retry.");
		await mutate(s.campaigns, id, (current): Campaign => { if (!current) fail("Campaign not found."); return { ...current, status: "drawn" }; });
		return { draw: saved };
	} catch (error) {
		if (error instanceof CampaignError && !await s.draws.exists(id)) {
			await mutate(s.campaigns, id, (current): Campaign => { if (!current) fail("Campaign not found."); return { ...current, status: "published" }; });
		}
		throw error;
	}
}
export async function draw(ctx: RouteContext) {
	return drawCampaign(ctx, text(record(ctx.input).id, "Campaign", 100, true), ctx.user?.id ?? "api-token");
}
export async function runDeadlineDraws(ctx: PluginContext) {
	const due = await stores(ctx).campaigns.query({ where: { autoDraw: true, status: { in: ["published", "drawing"] }, endsAt: { lte: nowISO() } }, orderBy: { updatedAt: "asc" }, limit: 10 });
	for (const item of due.items) {
		try { await drawCampaign(ctx, item.id, "scheduler"); }
		catch (error) {
			const message = error instanceof CampaignError ? error.message : "The automatic draw could not complete. It will retry on the next scheduler tick.";
			await mutate(stores(ctx).campaigns, item.id, current => { if (!current) fail("Campaign not found."); return { ...current, drawError: message, updatedAt: nowISO() }; });
			ctx.log.error("Automatic campaign draw deferred", { campaignId: item.id, reason: message });
		}
	}
}
export async function runScheduledDraw(ctx: PluginContext, id: string) {
	const c = await stores(ctx).campaigns.exists(id) ? await campaign(ctx, id) : null;
	if (c?.autoDraw && ["published", "drawing"].includes(c.status) && Date.parse(c.endsAt) <= Date.now()) await drawCampaign(ctx, id, "scheduler");
}
export async function recover(ctx: RouteContext) {
	const v = record(ctx.input);
	await mutate(stores(ctx).campaigns, text(v.id, "Campaign", 100, true), c => {
		if (!c || c.status !== "published" || Date.parse(c.endsAt) > Date.now()) fail("Recovery is only available after entries close.");
		if (Object.values(c.pendingWrites).some(at => at > Date.now() - 15 * 60000)) fail("Wait 15 minutes after the most recent interrupted write before recovery.");
		return { ...c, pendingWrites: {}, pendingContent: undefined };
	});
	ctx.log.warn("Campaign write gate recovered by organiser", { campaignId: v.id, actor: ctx.user?.id });
	return {};
}
export async function archive(ctx: RouteContext) {
	const v = record(ctx.input);
	const before = await stores(ctx).campaigns.get(text(v.id, "Campaign", 100, true));
	if (before?.contentId) {
		const doc = await ctx.content?.getVersioned?.("campaigns", before.contentId);
		if (doc?.item.status === "published") await ctx.content?.unpublish?.("campaigns", before.contentId, { _rev: doc._rev });
	}
	await mutate(stores(ctx).campaigns, text(v.id, "Campaign", 100, true), (c): Campaign => {
		if (!c) fail("Campaign not found.");
		if (c.status === "drawing" || Object.keys(c.pendingWrites).length) fail("Wait until current campaign requests finish before archiving.");
		return { ...c, status: "archived", updatedAt: nowISO() };
	});
	await ctx.cron?.cancel(`draw-${String(v.id)}`);
	if (before?.contentId) { const native = await import("./native.ts"); await native.withdrawAnnouncement(ctx, before.id); }
	return {};
}
export async function exportCsv(ctx: RouteContext) {
	const v = record(ctx.input);
	const c = await campaign(ctx, v.id);
	const kind = text(v.kind, "Export type", 20) || "participants";
	if (kind !== "participants" && kind !== "winners") fail("Choose a participants or winners export.");
	const draw = await stores(ctx).draws.get(c.id);
	let header: string[];
	let rows: Array<Array<string>>;
	if (kind === "winners") {
		if (!draw) fail("Winners are not available until the draw completes.");
		header = ["Name", "Email", "Draw date"];
		rows = draw.winners.map(w => [w.name, w.email, draw.at]);
	} else {
		const participants = await allParticipants(ctx, c.id);
		header = ["Name", "Email", "Entry status", "Actions completed", "Result"];
		rows = participants.map(({ id, data: p }) => [p.name, p.email, !p.entered ? "Registered, not entered" : qualifiesForDraw(c, p) ? "Qualified" : "Actions incomplete", `${c.actions.filter(a => p.submissions[a.id]?.status === "approved").length} / ${c.actions.length}`, draw ? draw.winners.some(w => w.id === id) ? "Winner" : draw.eligible.some(e => e.id === id) ? "Not selected" : "Not qualified" : "Awaiting draw"]);
	}
	const csv = [header, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n");
	if (new TextEncoder().encode(csv).byteLength > 8 * 1024 * 1024) fail("The CSV exceeds EmDash's 8 MiB response limit. Contact the organiser for a batched export.");
	return csv;
}
export async function cleanup(ctx: PluginContext) {
	for (const store of [stores(ctx).challenges, stores(ctx).sessions, stores(ctx).limits]) {
		let cursor: string | undefined;
		do {
			const page = await store.query({ where: { expiresAt: { lt: Date.now() } }, limit: 100, cursor });
			await store.deleteMany(page.items.map(i => i.id));
			cursor = page.cursor;
		} while (cursor);
	}
}
