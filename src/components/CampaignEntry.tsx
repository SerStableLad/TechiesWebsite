import { useEffect, useRef, useState } from "react";
import { isOpen, pluginId, type CampaignSummary, type ParticipantView, type PublicCampaign } from "../plugins/campaigns/model";
import "../styles/campaigns.css";
import LinkedInLogo from "./LinkedInLogo";

const base = `/_emdash/api/plugins/${pluginId}/`;
async function api<T>(route: string, body: unknown): Promise<T> {
	const response = await fetch(base + route, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });
	const result = await response.json() as { success?: boolean; data?: T & { ok?: boolean; error?: string }; error?: { message?: string } };
	if (!response.ok || !result.success || !result.data?.ok) throw new Error(result.data?.error || result.error?.message || "Could not complete that request. Please try again.");
	return result.data;
}
function countdown(c: PublicCampaign, now: number) {
	if (["drawn", "drawing"].includes(c.status) || now >= Date.parse(c.endsAt)) return "Entries closed";
	const opening = now < Date.parse(c.startsAt);
	const seconds = Math.max(0, Math.floor((Date.parse(opening ? c.startsAt : c.endsAt) - now) / 1000));
	return `${opening ? "Opens" : "Closes"} in ${Math.floor(seconds / 86400)}d ${Math.floor(seconds / 3600) % 24}h ${Math.floor(seconds / 60) % 60}m ${seconds % 60}s`;
}
const formatDate = (value: string) => new Intl.DateTimeFormat("en-SG", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Singapore" }).format(new Date(value));

export default function CampaignEntry({ initial }: { initial: CampaignSummary | PublicCampaign }) {
	const [campaign, setCampaign] = useState<PublicCampaign | null>("actions" in initial ? initial : null);
	const [participant, setParticipant] = useState<ParticipantView>();
	const [token, setToken] = useState("");
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [consent, setConsent] = useState(false);
	const [rulesConsent, setRulesConsent] = useState(false);
	const [responses, setResponses] = useState<Record<string, string>>({});
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");
	const [now, setNow] = useState(Date.now());
	const registrationForm = useRef<HTMLFormElement>(null);
	const key = `techies:campaign:${initial.id}`;
	const open = campaign ? isOpen(campaign, now) : false;
	const closed = Boolean(campaign && (now >= Date.parse(campaign.endsAt) || ["drawing", "drawn"].includes(campaign.status)));
	function forget() { setToken(""); setParticipant(undefined); try { sessionStorage.removeItem(key); } catch {} }
	useEffect(() => {
		const interval = setInterval(() => setNow(Date.now()), 1000);
		let saved: string | null = null;
		try { saved = sessionStorage.getItem(key); } catch {}
		if (saved) {
			setBusy(true);
			void api<{ campaign: PublicCampaign; participant: ParticipantView }>("participant", { campaignId: initial.id, token: saved }).then(result => { setToken(saved!); setCampaign(result.campaign); setParticipant(result.participant); }).catch(() => { forget(); setError("Your session expired or access changed. Please contact the organiser if you already registered."); }).finally(() => setBusy(false));
		}
		return () => clearInterval(interval);
	}, [key]);
	async function run(fn: () => Promise<void>) {
		setBusy(true); setError(""); setNotice("");
		try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Please try again."); }
		finally { setBusy(false); }
	}
	async function register() {
		const result = await api<{ token: string; campaign: PublicCampaign; participant: ParticipantView }>("register", { campaignId: initial.id, email, name, consent });
		setToken(result.token); setCampaign(result.campaign); setParticipant(result.participant);
		try { sessionStorage.setItem(key, result.token); } catch {}
		return result.token;
	}
	async function completeAction(actionId: string, type: string) {
		if (!participant && !registrationForm.current?.reportValidity()) return;
		if (participant && !participant.entered && !rulesConsent) { setError("Agree to the campaign rules and eligibility before completing an action."); return; }
		await run(async () => {
			const sessionToken = participant ? token : await register();
			if (!participant?.entered) {
				const result = await api<{ participant: ParticipantView }>("enter", { campaignId: initial.id, token: sessionToken, consent: participant ? rulesConsent : consent });
				setParticipant(result.participant);
			}
			const result = await api<{ participant: ParticipantView }>("submit", { campaignId: initial.id, token: sessionToken, actionId, response: type === "question" ? responses[actionId] ?? "" : "confirmed" });
			setParticipant(result.participant); setNotice("Action completed. Your qualification status is updated.");
		});
	}
	return <div className="campaign-page container">
		<div className="campaign-layout">
			<section className="campaign-overview">
				<a className="back-link" href="/campaigns">All public campaigns</a>
				<h1>{campaign?.title ?? "Campaign"}</h1>
				{campaign ? <>
					<dl className="campaign-facts"><div><dt>The prize</dt><dd>{campaign.prize}</dd></div><div><dt>Entries open</dt><dd>{formatDate(campaign.startsAt)} SGT</dd></div><div><dt>Entries close</dt><dd>{formatDate(campaign.endsAt)} SGT</dd></div></dl>
					{campaign.contentFormat === "html" ? <div className="campaign-description campaign-rich-text" dangerouslySetInnerHTML={{ __html: campaign.description }} /> : <p className="campaign-description">{campaign.description}</p>}
					<section className="campaign-terms" aria-labelledby="campaign-rules"><h2 id="campaign-rules">Rules and eligibility</h2>{campaign.contentFormat === "html" ? <div className="campaign-rules campaign-rich-text" dangerouslySetInnerHTML={{ __html: campaign.rules }} /> : <p className="campaign-rules">{campaign.rules}</p>}</section>
				</> : <p className="campaign-description">Campaign details are unavailable. Please refresh the page.</p>}
			</section>
			<div className="campaign-widget">
				{campaign && <>
					<p className="campaign-clock" role="timer" aria-label="Campaign countdown" suppressHydrationWarning>{countdown(campaign, now)}</p>
					<div className="campaign-widget-prize"><h2>{campaign.title}</h2>{campaign.image && <img className="campaign-image" src={campaign.image} alt={campaign.prize} fetchPriority="high" />}<p>{campaign.prize}</p></div>
				</>}
			<section className="campaign-entry" aria-labelledby="entry-heading">
				<h2 id="entry-heading">{participant ? participant.entered ? closed ? "Entries closed" : participant.qualified === false ? "Complete required actions" : "You’re entered" : "Ready to enter?" : "Enter this giveaway"}</h2>
				{error && <p role="alert" className="campaign-error">{error}</p>}
				{notice && <p role="status" className="campaign-notice">{notice}</p>}
				{participant ? <>
					<p>{participant.name} · {participant.email}</p>
					{participant.entered ? <><p>One entry per person. Every qualified participant has an equal chance.</p><p>{participant.qualified === false ? closed ? "Not all actions were completed before the deadline. Entries are now closed." : "Complete every action before entries close to qualify for the draw." : closed ? "Your entry qualified at the closing deadline. The automatic draw result is managed by the organiser." : "Your actions are complete. You qualify for the draw."}</p><button className="button secondary" disabled={busy} type="button" onClick={() => void run(async () => { const result = await api<{ campaign: PublicCampaign; participant: ParticipantView }>("participant", { campaignId: initial.id, token }); setCampaign(result.campaign); setParticipant(result.participant); setNotice("Your entry status is up to date."); })}>Refresh entry status</button></> : <>
						<p>Read the <a href="#campaign-rules">rules and eligibility</a>. Register your entry, then complete any required actions to qualify.</p>
						<label className="campaign-checkbox"><input type="checkbox" checked={rulesConsent} onChange={e => setRulesConsent(e.target.checked)} disabled={busy || !open} />I agree to the campaign rules and confirm that I meet the eligibility requirements.</label>
						<button className="button" type="button" disabled={busy || !open || !rulesConsent} onClick={() => void run(async () => { const result = await api<{ participant: ParticipantView }>("enter", { campaignId: initial.id, token, consent: rulesConsent }); setParticipant(result.participant); setNotice("Entry registered. Complete the required actions below before the deadline."); })}>Enter campaign</button>
						{!open && <p>Entries are not currently open.</p>}
					</>}
					<button className="campaign-sign-out" type="button" disabled={busy} onClick={() => void run(async () => { await api("sign-out", { token }); forget(); setNotice("Signed out of this campaign."); })}>Sign out</button>
				</> : <>
					{!open && <p>Entries are not currently open. Existing participants can check their entry in the browser they registered with.</p>}
					<form ref={registrationForm} onSubmit={e => e.preventDefault()}>
						<fieldset disabled={busy || !open}><label>Your name<input name="name" autoComplete="name" required maxLength={100} value={name} onChange={e => setName(e.target.value)} /></label><label>Email address<input name="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} /></label><label className="campaign-checkbox"><input type="checkbox" required checked={consent} onChange={e => setConsent(e.target.checked)} />I agree to the campaign rules and eligibility and the use of my name and email to administer this campaign.</label></fieldset>
					</form>
				</>}
				{busy && <p role="status">Working…</p>}
				<noscript>Enable JavaScript to enter this campaign.</noscript>
			</section>
		{campaign && <section className="campaign-actions" aria-label="Entry actions">
			{campaign.actions.map(action => {
				const submission = participant?.submissions[action.id];
				const complete = submission?.status === "approved";
				return <article className="campaign-action" key={action.id}><div className="campaign-action-heading"><h3 className="campaign-action-title">{action.type.startsWith("linkedin_") ? <LinkedInLogo /> : <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M5 4h14v13H9l-4 3V4Z" /><path d="M9 8h6M9 12h4" /></svg>}{action.title}</h3><span className="campaign-action-state">{complete ? "Completed" : "Required"}</span></div><div className="campaign-action-body">
					{action.url && <a className="campaign-action-link" href={action.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${action.title} link (opens in new tab)`}>{action.type === "linkedin_follow" ? "Open LinkedIn page" : action.type === "linkedin_like" ? "Open LinkedIn post" : "Open action link"}</a>}
					{complete && <p className="campaign-action-status">This action is complete.</p>}
					{action.type.startsWith("linkedin_") && !complete && <p>Open the link, complete the action on LinkedIn, then confirm below. No screenshot needed.</p>}
					{!complete && <form onSubmit={e => { e.preventDefault(); void completeAction(action.id, action.type); }}><fieldset disabled={busy || !open}>{action.type === "question" && <><label htmlFor={`action-${action.id}`}>Your answer</label><textarea id={`action-${action.id}`} rows={3} required maxLength={4000} value={responses[action.id] ?? ""} onChange={e => setResponses(values => ({ ...values, [action.id]: e.target.value }))} /></>}<button className="button secondary" type="submit">{action.type === "question" ? "Submit answer" : "I’ve completed this action"}</button></fieldset></form>}
				</div></article>;
			})}
		</section>}
			</div>
		</div>
	</div>;
}
