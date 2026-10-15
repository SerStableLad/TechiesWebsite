import { Button, Input } from "@cloudflare/kumo";
import { useLingui } from "@lingui/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "emdash/plugin-utils";
import type { PluginAdminExports } from "emdash";
import type { ContentListColumnExtension } from "@emdash-cms/admin";
import { pluginId, type Campaign, type Draw, type ParticipantView } from "./model";
import "./admin.css";
import { fields as fieldWidgets } from "./fields";

const base = `/_emdash/api/plugins/${pluginId}/admin/`;
async function api<T>(path: string, body?: unknown): Promise<T> {
	const r = await apiFetch(base + path, body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
	const result = await r.json() as { success?: boolean; data?: T & { ok?: boolean; error?: string }; error?: { message?: string } };
	if (!r.ok || !result.success || !result.data?.ok) throw new Error(result.data?.error || result.error?.message || "Campaign request failed.");
	return result.data;
}
interface Detail { campaign: Campaign; revision: string; questions: Array<{ id: string; title: string; answer: string }>; participants: Array<ParticipantView & { id: string }>; count: number; cursor?: string; draw: Draw | null }
interface Status { campaign: Campaign; contentRevision: string; locked: boolean }
const editorUrl = (id?: string) => `/_emdash/admin/content/campaigns/${id ?? "new"}`;
function ViewCampaignLink({ slug }: { slug: string }) {
	const { i18n } = useLingui();
	return <a className="ca-view-campaign" href={`/campaigns/${encodeURIComponent(slug)}`} target="_blank" rel="noopener noreferrer" aria-label={i18n._({ id: "campaigns.view-new-tab", message: "View campaign (opens in a new tab)" })}>{i18n._({ id: "campaigns.view", message: "View campaign" })} ↗</a>;
}
export const contentListColumns: readonly ContentListColumnExtension[] = [{
	id: "view-campaign", label: "Public page", collections: ["campaigns"],
	cell: ({ item }) => item.slug ? <ViewCampaignLink slug={item.slug} /> : null,
}];

function CampaignControlsField({ value }: { value: unknown }) {
	const { i18n } = useLingui();
	const contentId = window.location.pathname.match(/\/content\/campaigns\/([^/]+)$/)?.[1];
	if (!contentId) return null;
	if (contentId === "new" || !value) return <section className="campaign-admin campaign-results-panel" aria-label="Post campaign details"><h2>{i18n._({ id: "campaigns.post-details", message: "Post campaign details" })}</h2><p>{i18n._({ id: "campaigns.save-first", message: "Save this campaign to view participants, winners and data exports." })}</p></section>;
	return <CampaignPanel key={contentId} contentId={contentId} />;
}
export const fields = { ...fieldWidgets, "managed-reference": CampaignControlsField };

function CampaignPanel({ contentId }: { contentId: string }) {
	const { i18n } = useLingui(); const t = (message: string) => i18n._({ id: `campaigns.${message}`, message });
	const [status, setStatus] = useState<Status>(); const [error, setError] = useState(""); const [refreshKey, setRefreshKey] = useState(0);
	const [publishingActions, setPublishingActions] = useState<Element | null>(null);
	useEffect(() => { setPublishingActions(document.querySelector(".campaign-editor-publishing > div:last-child")); }, []);
	async function refresh() { try { setStatus(await api<Status>(`content-status?contentId=${encodeURIComponent(contentId)}`)); setError(""); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }
	useEffect(() => { void refresh(); const timer = setInterval(() => void refresh(), 5000); return () => clearInterval(timer); }, [contentId]);
	return <section className="campaign-admin campaign-results-panel" aria-label={t("Post campaign details")}>
		<div className="ca-results-heading"><h2>{t("Post campaign details")}</h2><Button type="button" onClick={() => { setRefreshKey(key => key + 1); void refresh(); }}>{t("Refresh data")}</Button></div>
		{status?.campaign.slug && publishingActions && createPortal(<ViewCampaignLink slug={status.campaign.slug} />, publishingActions)}
		{error && <p role="alert">{error}</p>}
		{status ? <>
			<CampaignOperations key={status.campaign.id} campaignId={status.campaign.id} updatedAt={`${status.contentRevision}:${status.campaign.updatedAt}:${status.campaign.status}:${refreshKey}`} onChanged={refresh} />
		</> : error ? <Button type="button" onClick={() => void refresh()}>{t("Retry loading data")}</Button> : <p role="status">{t("Loading campaign data…")}</p>}
	</section>;
}

function CampaignOperations({ campaignId, updatedAt, onChanged }: { campaignId: string; updatedAt: string; onChanged: () => Promise<void> }) {
	const { i18n } = useLingui(); const t = (message: string) => i18n._({ id: `campaigns.${message}`, message });
	const [detail, setDetail] = useState<Detail>(); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
	const [answers, setAnswers] = useState<Record<string, string>>({});
	const [dirty, setDirty] = useState(false);
	useEffect(() => {
		const guard = (event: Event) => { if (dirty || busy) { event.preventDefault(); setError(t("Save question answers and wait for current updates before publishing.")); } };
		window.addEventListener("campaigns:before-publish", guard);
		return () => window.removeEventListener("campaigns:before-publish", guard);
	}, [dirty, busy, i18n]);
	useEffect(() => { if (!dirty) return; const guard = (e: BeforeUnloadEvent) => e.preventDefault(); window.addEventListener("beforeunload", guard); return () => window.removeEventListener("beforeunload", guard); }, [dirty]);
	async function run(work: () => Promise<void>) { setBusy(true); setError(""); setNotice(""); try { await work(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } }
	async function select(id: string, reset = true) {
		const result = await api<Detail>(`detail?id=${encodeURIComponent(id)}`); setDetail(result);
		if (reset) { setAnswers(Object.fromEntries(result.questions.map(a => [a.id, a.answer]))); setDirty(false); }
	}
	useEffect(() => {
		setBusy(true);
		void select(campaignId, !dirty).then(() => setError("")).catch(e => setError(e.message)).finally(() => setBusy(false));
	}, [campaignId, updatedAt]);
	const c = detail?.campaign;
	const closed = Boolean(c?.autoDraw && Date.now() >= Date.parse(c.endsAt));
	async function download(kind: "participants" | "winners") {
		if (!c) return;
		const r = await apiFetch(base + `export?id=${encodeURIComponent(c.id)}&kind=${kind}`);
		if (!r.ok) throw new Error(t("Could not export campaign data. Please try again."));
		const url = URL.createObjectURL(await r.blob()); const a = document.createElement("a"); a.href = url; a.download = `${c.slug}-${kind}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
	}
	return <section className="campaign-admin">
		{error && <p className="ca-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
		{detail && c && <>
			<p className="ca-table-help">{t("Scroll the table horizontally to see all columns.")}</p>
			<section aria-label={t("Participants")}>
				<div className="ca-results-heading"><h3>{t("Participants")} ({detail.count})</h3><Button type="button" disabled={busy || !detail.count} onClick={() => void run(() => download("participants"))}>{t("Export participants CSV")}</Button><Button type="button" disabled={busy || !detail.draw?.winners.length} onClick={() => void run(() => download("winners"))}>{t("Export winners CSV")}</Button></div>
				{detail.draw ? <p>{t("Winners")}: {detail.draw.winners.length} · {t("Draw date")}: {new Date(detail.draw.at).toLocaleString()}</p> : <p>{t("Winners will be marked after the campaign closes and the draw completes.")}</p>}
				<div className="ca-table-scroll" role="region" aria-label={t("Participants data table")} tabIndex={0}><table className="ca-data-table" aria-label={t("Participants")}><thead><tr>{["Name", "Email", "Entry status", "Actions completed", "Result"].map(label => <th scope="col" key={label}>{t(label)}</th>)}</tr></thead><tbody>
					{!detail.participants.length && <tr><td colSpan={5}>{t("No participants yet.")}</td></tr>}
					{detail.participants.map(p => <tr key={p.id}><th scope="row">{p.name}</th><td>{p.email}</td><td>{t(!p.entered ? "Registered, not entered" : p.qualified ? "Qualified" : "Actions incomplete")}</td><td>{c.actions.filter(a => p.submissions[a.id]?.status === "approved").length} / {c.actions.length}</td><td>{t(detail.draw ? detail.draw.winners.some(w => w.id === p.id) ? "Winner" : detail.draw.eligible.some(e => e.id === p.id) ? "Not selected" : "Not qualified" : "Awaiting draw")}</td></tr>)}
				</tbody></table></div>
				{detail.cursor && <Button type="button" disabled={busy} onClick={() => void run(async () => { const next = await api<Detail>(`detail?id=${encodeURIComponent(c.id)}&cursor=${encodeURIComponent(detail.cursor!)}`); setDetail({ ...next, participants: [...detail.participants, ...next.participants] }); })}>{t("Load more participants")}</Button>}
				{detail.cursor && <p>{t("Showing")} {detail.participants.length} {t("of")} {detail.count}. {t("The export includes all participants.")}</p>}
				{Boolean(detail.draw?.unfilledPrizes) && <p>{detail.draw!.unfilledPrizes} {t("prizes unfilled because too few participants qualified.")}</p>}
			</section>
			{detail.questions.length > 0 && <details className="ca-management"><summary>{t("Question answers")}</summary><fieldset disabled={busy || closed || Boolean(detail.draw)}>
				<p>{t("Answers stay private and are never included in published content or content revisions.")}</p>
				{detail.questions.map(a => <label key={a.id}>{t("Correct answer for")}: {a.title}<Input value={answers[a.id] ?? ""} maxLength={500} onChange={e => { setDirty(true); setAnswers(old => ({ ...old, [a.id]: e.target.value })); }} /><span>{t("Leave blank to accept any non-empty answer. Answers apply when campaign content is next published or activated.")}</span></label>)}
				{detail.questions.length > 0 && <Button type="button" onClick={() => void run(async () => { await api("settings", { id: c.id, revision: detail.revision, answers }); await select(c.id); await onChanged(); setNotice(t("Question answers saved.")); })}>{t("Save question answers")}</Button>}
			</fieldset></details>}
		</>}
		{busy && <p role="status">{t("Working…")}</p>}
	</section>;
}
function LegacyCampaignPage() {
	const [error, setError] = useState("");
	useEffect(() => {
		const id = new URL(window.location.href).searchParams.get("id");
		if (!id) { window.location.replace("/_emdash/admin/content/campaigns"); return; }
		void api<Detail>(`detail?id=${encodeURIComponent(id)}`).then(value => {
			window.location.replace(value.campaign.contentId ? editorUrl(value.campaign.contentId) : "/_emdash/admin/content/campaigns");
		}).catch(e => setError(e.message));
	}, []);
	return <p role={error ? "alert" : "status"}>{error || "Opening campaign…"}</p>;
}
export const pages: PluginAdminExports["pages"] = { "/campaigns": LegacyCampaignPage };
