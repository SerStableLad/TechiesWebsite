export const pluginId = "techies-campaigns";
export const actionTypes = ["question", "linkedin_follow", "linkedin_like"] as const;
export type ActionType = typeof actionTypes[number];
export interface CampaignAction {
	id: string;
	type: ActionType;
	title: string;
	instructions: string;
	url: string;
	points?: number; // Historical records only; never used for chances.
	answer: string;
	required?: boolean;
}
export interface Submission {
	response: string;
	status: "pending" | "approved" | "rejected";
	points?: number;
	submittedAt: string;
	reviewedAt?: string;
	reviewer?: string;
	note?: string;
}
export interface Participant {
	campaignId: string;
	email: string;
	name: string;
	verifiedAt?: string;
	registeredAt?: string;
	consentAt: string;
	entered: boolean;
	rulesHash?: string;
	submissions: Record<string, Submission>;
	attempts: Record<string, number>;
}
export interface Draw {
	at: string;
	actor: string;
	algorithm: "crypto-weighted-without-replacement-v1" | "crypto-uniform-without-replacement-v1";
	eligibilityHash: string;
	eligible: Array<{ id: string; entries: number }>;
	winners: Array<{ id: string; name: string; email: string; entries: number }>;
	deadline?: string;
	unfilledPrizes?: number;
}
export interface Campaign {
	id: string;
	contentId?: string;
	nativeManaged?: boolean;
	nativeRevision?: string;
	announcement?: boolean;
	announcementId?: string;
	privateAnswers?: Record<string, string>;
	pendingContent?: Campaign;
	slug: string;
	title: string;
	description: string;
	prize: string;
	image: string;
	imageId?: string;
	contentFormat?: "html";
	autoDraw?: boolean;
	drawError?: string;
	rules: string;
	startsAt: string;
	endsAt: string;
	visibility: "public" | "private";
	status: "draft" | "scheduled" | "published" | "drawing" | "drawn" | "archived";
	launchAt?: string;
	invites: string[];
	actions: CampaignAction[];
	winnerCount: number;
	updatedAt: string;
	pendingWrites: Record<string, number>;
}
export type PublicCampaign = Omit<Campaign, "invites" | "privateAnswers" | "pendingWrites" | "actions" | "drawError" | "contentId" | "nativeManaged" | "nativeRevision" | "announcementId" | "pendingContent"> & {
	actions: Array<Omit<CampaignAction, "answer">>;
};
export interface CampaignSummary {
	id: string;
	slug: string;
	visibility: Campaign["visibility"];
	status: Campaign["status"];
	title?: string;
	description?: string;
	prize?: string;
	image?: string;
	startsAt?: string;
	endsAt?: string;
}
export interface ParticipantView {
	email: string;
	name: string;
	entries: number;
	entered: boolean;
	qualified?: boolean;
	submissions: Record<string, Submission>;
}
export class CampaignError extends Error {}
export function campaignSlug(title: string) {
	return title.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
		.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100).replace(/-$/, "");
}
export function isLinkedIn(type: string) { return type === "linkedin_follow" || type === "linkedin_like"; }
export function actionPreset(type: ActionType) {
	if (type === "linkedin_follow") return { title: "Follow the LinkedIn page", instructions: "Open the page, click Follow, then confirm you have completed this action." };
	if (type === "linkedin_like") return { title: "Like the LinkedIn post", instructions: "Open the post, click Like, then confirm you have completed this action." };
	return { title: "Answer a question", instructions: "" };
}
export function campaignDateError(startsAt: string, endsAt: string) {
	if (!Number.isFinite(Date.parse(startsAt)) || !Number.isFinite(Date.parse(endsAt))) return "Choose valid start and end dates.";
	return Date.parse(endsAt) <= Date.parse(startsAt) ? "The end date must be after the start date." : "";
}
export function fail(message: string): never { throw new CampaignError(message); }
export function record(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) fail("Invalid request.");
	return value as Record<string, unknown>;
}
export function text(value: unknown, name: string, max: number, required = false) {
	if (value === undefined || value === null) value = "";
	if (typeof value !== "string") fail(`${name} must be text.`);
	const result = value.trim();
	if (result.length > max || (required && !result)) fail(`${name} must contain ${required ? "1–" : "at most "}${max} characters.`);
	return result;
}
export function emailAddress(value: unknown) {
	const result = text(value, "Email", 254, true).toLowerCase();
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) fail("Enter a valid email address.");
	return result;
}
export function integer(value: unknown, name: string, min: number, max: number) {
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) fail(`${name} must be a whole number from ${min} to ${max}.`);
	return value;
}
export function safeUrl(value: unknown) {
	const href = text(value, "Link", 2000);
	if (!href) return "";
	try {
		const parsed = new URL(href, "https://techies.invalid");
		if (/^(https?:\/\/|\/(?![\/\\]))/i.test(href) && ["http:", "https:"].includes(parsed.protocol)) return href;
	} catch {}
	return fail("Links must be HTTP/HTTPS URLs or site paths such as /events.");
}
export function parseCampaign(value: unknown, id: string): Campaign {
	const v = record(value);
	const slug = text(v.slug, "Campaign URL", 100, true);
	if (!/^[\p{L}\p{N}][\p{L}\p{N}\p{M}]*(?:-[\p{L}\p{N}][\p{L}\p{N}\p{M}]*)*$/u.test(slug)) fail("Use letters, numbers and hyphens for the campaign URL.");
	const startsAt = text(v.startsAt, "Start date", 40, true);
	const endsAt = text(v.endsAt, "End date", 40, true);
	const dateError = campaignDateError(startsAt, endsAt);
	if (dateError) fail(dateError);
	if (v.visibility !== "public" && v.visibility !== "private") fail("Choose public or private / unlisted.");
	if (!["draft", "published", "archived"].includes(String(v.status))) fail("Choose draft, published or archived.");
	const invites = [...new Set(text(v.invites, "Invited emails", 150000).split(/[\s,;]+/).filter(Boolean).map(emailAddress))];
	if (invites.length > 5000) fail("Use at most 5,000 invited email addresses.");
	if (!Array.isArray(v.actions) || v.actions.length > 20) fail("Use at most 20 actions.");
	const actions = v.actions.map((item): CampaignAction => {
		const a = record(item);
		if (!actionTypes.includes(a.type as ActionType)) fail("Unknown entry action.");
		const actionId = text(a.id, "Action ID", 50) || crypto.randomUUID();
		if (!/^[a-zA-Z0-9-]+$/.test(actionId) || Object.hasOwn(Object.prototype, actionId)) fail("Invalid action ID.");
		const url = safeUrl(a.url);
		if (String(a.type).startsWith("linkedin_")) {
			let host = "";
			try { host = new URL(url).hostname; } catch {}
			if (host !== "linkedin.com" && !host.endsWith(".linkedin.com") && host !== "lnkd.in") fail("LinkedIn actions need a linkedin.com or lnkd.in URL.");
		}
		return { id: actionId, type: a.type as ActionType, title: text(a.title, "Action title", 160, true), instructions: actionPreset(a.type as ActionType).instructions, url, required: true, answer: a.type === "question" ? text(a.answer, "Correct answer", 500) : "" };
	});
	if (new Set(actions.map(a => a.id)).size !== actions.length) fail("Action IDs must be unique.");
	if (v.status === "published" && !actions.length) fail("Add at least one entry action before publishing.");
	if (v.contentFormat !== undefined && v.contentFormat !== "html") fail("Invalid campaign content format.");
	return { id, slug, title: text(v.title, "Title", 160, true), description: text(v.description, "Description", v.contentFormat === "html" ? 30000 : 6000, true), prize: text(v.prize, "Prize", 500, true), image: safeUrl(v.image), imageId: text(v.imageId, "Image ID", 100), ...(v.contentFormat === "html" ? { contentFormat: "html" as const } : {}), autoDraw: true, rules: text(v.rules, "Rules and eligibility", v.contentFormat === "html" ? 60000 : 12000, true), startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(), visibility: v.visibility, status: v.status as Campaign["status"], invites, actions, winnerCount: integer(v.winnerCount, "Number of winners", 1, 20), updatedAt: new Date().toISOString(), pendingWrites: {} };
}
export function isOpen(c: Campaign | PublicCampaign, now = Date.now()) {
	return c.status === "published" && Date.parse(c.startsAt) <= now && now < Date.parse(c.endsAt);
}
export function publicCampaign(c: Campaign): PublicCampaign {
	const { invites, privateAnswers, pendingWrites, drawError, contentId, nativeManaged, nativeRevision, announcementId, pendingContent, actions, ...rest } = c;
	return { ...rest, actions: actions.map(({ answer, ...action }) => action) };
}
export function summary(c: Campaign): CampaignSummary {
	return { id: c.id, slug: c.slug, status: c.status, visibility: c.visibility, title: c.title, description: c.description, prize: c.prize, image: c.image, startsAt: c.startsAt, endsAt: c.endsAt };
}
export function entryCount(p: Participant) {
	return p.entered ? 1 : 0;
}
export function qualifiesForDraw(c: Campaign | PublicCampaign, p: Participant, deadline = Date.parse(c.endsAt)) {
	return p.entered && Date.parse(p.registeredAt ?? p.verifiedAt ?? "") < deadline && Date.parse(p.consentAt) < deadline
		&& c.actions.every(a => {
			const s = p.submissions[a.id];
			return s?.status === "approved" && Date.parse(s.submittedAt) < deadline && Date.parse(s.reviewedAt ?? s.submittedAt) < deadline;
		});
}
export function participantView(p: Participant, c?: Campaign): ParticipantView {
	return { email: p.email, name: p.name, entered: p.entered, entries: entryCount(p), ...(c ? { qualified: qualifiesForDraw(c, p) } : {}), submissions: p.submissions };
}
export function randomBelow(max: number) {
	if (!Number.isSafeInteger(max) || max < 1 || max > 0xffffffff) fail("The entry pool is too large to draw safely.");
	const limit = Math.floor(0x100000000 / max) * max;
	const bytes = new Uint32Array(1);
	do { crypto.getRandomValues(bytes); } while (bytes[0] >= limit);
	return bytes[0] % max;
}
export function pickWinners<T extends { entries: number }>(pool: T[], count: number, random = randomBelow) {
	const remaining = [...pool];
	if (remaining.length < count) fail("There are fewer eligible participants than prizes.");
	const winners: T[] = [];
	for (let i = 0; i < count; i++) {
		const index = random(remaining.length);
		if (index < 0) fail("Unable to select a winner.");
		winners.push(remaining.splice(index, 1)[0]);
	}
	return winners;
}
export function csvCell(value: unknown) {
	let s = String(value ?? "");
	if (/^[\s]*[=+\-@]/.test(s)) s = "'" + s;
	return '"' + s.replaceAll('"', '""') + '"';
}
