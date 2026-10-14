import { useEffect, useRef, useState } from "react";
import { Button, Input } from "@cloudflare/kumo";
import { useLingui } from "@lingui/react";
import { apiFetch } from "emdash/plugin-utils";
import { actionPreset, actionTypes, campaignDateError, isLinkedIn, pluginId, type CampaignAction } from "./model";
import LinkedInLogo from "../../components/LinkedInLogo";

interface Props { value: unknown; onChange: (value: unknown) => void; label: string; id: string }
function useLock() {
	const [locked, setLocked] = useState(false);
	useEffect(() => {
		const id = window.location.pathname.match(/\/content\/campaigns\/([^/]+)$/)?.[1];
		if (!id || id === "new") return;
		let current = true;
		void apiFetch(`/_emdash/api/plugins/${pluginId}/admin/content-status?contentId=${encodeURIComponent(id)}`).then(r => r.json() as Promise<{ data?: { ok?: boolean; locked: boolean } }>).then(body => { if (current && body.data?.ok) setLocked(body.data.locked); }).catch(() => {});
		return () => { current = false; };
	}, []);
	return locked;
}
const local = (value: string) => {
	if (!value || !Number.isFinite(Date.parse(value))) return "";
	const d = new Date(value); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
};
function EntryWindow({ value, onChange, label, id }: Props) {
	const { i18n } = useLingui(); const t = (message: string) => i18n._({ id: `campaign-fields.${message}`, message });
	const windowValue = value && typeof value === "object" ? value as Record<string, string> : {};
	const locked = useLock();
	const end = useRef<HTMLInputElement>(null);
	const error = windowValue.startsAt && windowValue.endsAt ? campaignDateError(windowValue.startsAt, windowValue.endsAt) : "";
	useEffect(() => { end.current?.setCustomValidity(error); }, [error]);
	function change(key: string, input: string) { onChange({ ...windowValue, [key]: input ? new Date(input).toISOString() : "" }); }
	return <fieldset className="campaign-admin campaign-native-window" disabled={locked} aria-labelledby={`${id}-label`}>
		<legend id={`${id}-label`}>{label}</legend>
		<div className="ca-grid"><label>{t("Entries open")}<Input id={id} type="datetime-local" step={1} value={local(windowValue.startsAt)} onChange={e => change("startsAt", e.target.value)} /></label><label>{t("Entries close")}<Input ref={end} type="datetime-local" step={1} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} value={local(windowValue.endsAt)} onChange={e => change("endsAt", e.target.value)} /></label></div>
		{error && <p id={`${id}-error`} className="ca-error" role="alert">{t(error)}</p>}
		<p>{t("The closing date must be after opening. Your browser timezone is")} {Intl.DateTimeFormat().resolvedOptions().timeZone}.</p>
		{locked && <p>{t("Entry dates are locked after the first entrant or draw.")}</p>}
	</fieldset>;
}
function EntryActions({ value, onChange, label, id }: Props) {
	const { i18n } = useLingui(); const t = (message: string) => i18n._({ id: `campaign-fields.${message}`, message });
	const actions = Array.isArray(value) ? value as Array<Omit<CampaignAction, "answer">> : [];
	const locked = useLock();
	const [expanded, setExpanded] = useState<string>();
	function patch(key: string, field: string, input: unknown) {
		onChange(actions.map(a => {
			if (a.id !== key) return a;
			const next = { ...a, [field]: input };
			if (field === "type") { const defaults = actionPreset(next.type); next.title = defaults.title; next.instructions = defaults.instructions; next.required = true; }
			return next;
		}));
	}
	const typeName = (type: string) => ({ question: "Answer a question", linkedin_follow: "Follow a LinkedIn page", linkedin_like: "Like a LinkedIn post" })[type] ?? type;
	return <fieldset className="campaign-admin campaign-native-actions" disabled={locked} aria-labelledby={`${id}-label`}>
		<legend id={`${id}-label`}>{label}</legend>
		<p>{t("Every action is required. Each qualified participant gets one equal chance in the draw.")}</p>
		{actions.map(a => <details className="ca-action" name={id} key={a.id} open={expanded === a.id} onToggle={e => { if (e.currentTarget.open) setExpanded(a.id); else setExpanded(current => current === a.id ? undefined : current); }}><summary>{isLinkedIn(a.type) && <LinkedInLogo />}{a.title || t("New action")}</summary><fieldset>
			<div className="ca-grid"><label>{t("Action type")}<select aria-label={t("Action type")} value={a.type} onChange={e => patch(a.id, "type", e.target.value)}>{actionTypes.map(type => <option value={type} key={type}>{t(typeName(type))}</option>)}</select></label><label>{t("Action title")}<Input required value={a.title} maxLength={160} onChange={e => patch(a.id, "title", e.target.value)} /></label></div>
			<label>{t(a.type === "question" ? "URL (optional)" : "URL")}<Input required={isLinkedIn(a.type)} placeholder="https://" value={a.url} onChange={e => patch(a.id, "url", e.target.value)} /></label>
			{a.type === "question" && <p>{t("Set a correct answer, if needed, under Question answers after saving.")}</p>}
			<Button type="button" onClick={() => onChange(actions.filter(old => old.id !== a.id))}>{t("Remove action")}</Button>
		</fieldset></details>)}
		<Button type="button" id={id} disabled={locked || actions.length >= 20} onClick={() => { const key = crypto.randomUUID(); onChange([...actions, { id: key, type: "linkedin_follow", ...actionPreset("linkedin_follow"), url: "", required: true }]); setExpanded(key); }}>{t("Add action")}</Button>
		{locked && <p>{t("Actions are locked after the first entrant or draw.")}</p>}
	</fieldset>;
}
function CampaignAccess({ value, onChange, label, id }: Props) {
	const { i18n } = useLingui(); const t = (message: string) => i18n._({ id: `campaign-fields.${message}`, message });
	return <div className="campaign-admin"><label htmlFor={id}>{label}</label><select id={id} value={value === "private" ? "private" : "public"} onChange={e => onChange(e.target.value)}><option value="public">{t("Public")}</option><option value="private">{t("Private / unlisted")}</option></select><p>{t(value === "private" ? "Only discoverable through its URL. No public listing, announcement or search indexing. Anyone with the link can enter." : "Listed publicly. An announcement and SEO / social-sharing tags are generated from your campaign details.")}</p></div>;
}
function Publishing({ value, onChange, id }: Props) {
	const { i18n } = useLingui(); const t = (message: string) => i18n._({ id: `campaign-fields.${message}`, message });
	const v = value && typeof value === "object" ? value as { mode?: string; at?: string } : {};
	return <div className="campaign-admin"><label htmlFor={id}>{t("Go live")}</label><select id={id} value={v.mode ?? "now"} onChange={e => onChange({ ...v, mode: e.target.value })}><option value="now">{t("Publish immediately")}</option><option value="schedule">{t("Schedule go-live")}</option></select>{v.mode === "schedule" && <label>{t("Go-live date")}<Input type="datetime-local" required step={1} value={local(v.at ?? "")} onChange={e => onChange({ ...v, at: e.target.value ? new Date(e.target.value).toISOString() : "" })} /></label>}<p>{t("Timezone")}: {Intl.DateTimeFormat().resolvedOptions().timeZone}. {t("Go-live is separate from entry dates.")}</p></div>;
}
export const fields = { "managed-reference": () => null, "entry-window": EntryWindow, "entry-actions": EntryActions, "campaign-access": CampaignAccess, "campaign-publishing": Publishing, "announcement-checkbox": () => null };
