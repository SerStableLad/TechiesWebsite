import { Button, Input } from "@cloudflare/kumo";
import { useEffect, useState } from "react";
import { apiFetch } from "emdash/plugin-utils";
import type { PluginAdminExports } from "emdash";
import { pluginId, themeOptions, type PresenterForm, type PresenterSubmission } from "./model";
import "./admin.css";

async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await apiFetch(`/_emdash/api/plugins/${pluginId}/admin/${path}`, body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json() as { success?: boolean; data?: T & { ok?: boolean; error?: string }; error?: { message?: string } };
  if (!response.ok || !result.success || !result.data?.ok) throw new Error(result.data?.error || result.error?.message || "Could not load presenter interest. Please retry.");
  return result.data;
}
type Settings = { form: PresenterForm; revision: string | null };
type Submissions = { items: Array<{ id: string; data: PresenterSubmission }>; count: number; cursor?: string };
const labels: Record<keyof Omit<PresenterForm, "open">, string> = {
  title: "Page heading", intro: "Introduction", contactLabel: "Contact question", nameLabel: "Name label", whatsappLabel: "WhatsApp label", projectLabel: "Project question", projectHelp: "Project helper text", themeLabel: "Theme question", themes: "Themes — one per line", unsureLabel: "Not-sure option", guidelinesTitle: "Guidelines heading", guidelines: "Presentation guidelines — one per line", consent: "Agreement checkbox", buttonLabel: "Submit button", note: "Privacy and slot note", successTitle: "Confirmation heading", successMessage: "Confirmation message", closedMessage: "Closed-form message",
};
const multiline = new Set(["intro", "projectHelp", "themes", "guidelines", "consent", "note", "successMessage", "closedMessage"]);
const blocks = {
  intro: { label: "Form header", type: "Title & description", fields: ["title", "intro"] },
  contact: { label: "Contact details", type: "Name & phone", fields: ["contactLabel", "nameLabel", "whatsappLabel"] },
  project: { label: "Project", type: "Long answer", fields: ["projectLabel", "projectHelp"] },
  theme: { label: "Theme", type: "Dropdown", fields: ["themeLabel", "unsureLabel"] },
  guidelines: { label: "Presentation guidelines", type: "Information", fields: ["guidelinesTitle", "guidelines"] },
  consent: { label: "Agreement", type: "Required checkbox", fields: ["consent"] },
  submit: { label: "Submit button", type: "Button & note", fields: ["buttonLabel", "note"] },
} as const;
type Block = keyof typeof blocks;
const tabs = ["Questions", "Responses", "Settings"] as const;
type Tab = typeof tabs[number];
function PresenterAdmin() {
  const [settings, setSettings] = useState<Settings>();
  const [submissions, setSubmissions] = useState<Submissions>();
  const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false); const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<Tab>("Questions");
  const [selected, setSelected] = useState<Block>("intro");
  useEffect(() => { void Promise.all([api<Settings>("form"), api<Submissions>("submissions")]).then(([s, entries]) => { setSettings(s); setSubmissions(entries); }).catch(e => setError(e.message)); }, []);
  useEffect(() => { if (!dirty) return; const guard = (event: BeforeUnloadEvent) => event.preventDefault(); window.addEventListener("beforeunload", guard); return () => window.removeEventListener("beforeunload", guard); }, [dirty]);
  async function run(work: () => Promise<void>) { setBusy(true); setError(""); setNotice(""); try { await work(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } }
  function change<K extends keyof PresenterForm>(field: K, value: PresenterForm[K]) {
    setSettings(current => current ? { ...current, form: { ...current.form, [field]: value } } : current); setDirty(true); setNotice("");
  }
  function select(block: Block) {
    setSelected(block);
    if (window.matchMedia("(max-width: 700px)").matches) requestAnimationFrame(() => document.getElementById("pb-properties")?.scrollIntoView({ block: "start" }));
  }
  function field(key: keyof typeof labels) {
    if (!settings) return null;
    const id = `presenter-setting-${key}`;
    return <div className="pb-field" key={key}><label htmlFor={id}>{labels[key]}</label>{multiline.has(key)
      ? <textarea id={id} required rows={key === "guidelines" ? 10 : 3} maxLength={5000} value={settings.form[key]} onChange={e => change(key, e.target.value)} />
      : <Input id={id} required maxLength={5000} value={settings.form[key]} onChange={e => change(key, e.target.value)} />}</div>;
  }
  const form = settings?.form;
  function preview(block: Block) {
    if (!form) return null;
    switch (block) {
      case "intro": return <><strong className="pb-preview-title">{form.title}</strong><span className="pb-preview-description">{form.intro}</span></>;
      case "contact": return <><strong>{form.contactLabel}<span className="pb-required"> *</span></strong><span className="pb-contact-preview"><span>{form.nameLabel}<span className="pb-answer-line">Short answer</span></span><span>{form.whatsappLabel}<span className="pb-answer-line">+65 8123 4567</span></span></span></>;
      case "project": return <><strong>{form.projectLabel}<span className="pb-required"> *</span></strong><span className="pb-preview-description">{form.projectHelp}</span><span className="pb-answer-line">Long answer</span></>;
      case "theme": return <><strong>{form.themeLabel}<span className="pb-required"> *</span></strong><span className="pb-select-preview">Choose a theme <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg></span><span className="pb-preview-description">{themeOptions(form).join(" · ")}</span></>;
      case "guidelines": return <><strong>{form.guidelinesTitle}</strong><span className="pb-preview-description pb-lines">{form.guidelines}</span></>;
      case "consent": return <span className="pb-check-preview"><span className="pb-checkbox" />{form.consent}<span className="pb-required">*</span></span>;
      case "submit": return <><span className="pb-submit-preview">{form.buttonLabel}</span><span className="pb-preview-description">{form.note}</span></>;
    }
  }
  return <div className="presenter-admin">
    <header className="pb-toolbar"><div><h1>Presenter interest</h1><p>{dirty ? "Unsaved changes" : "All changes saved"}</p></div><div className="pb-toolbar-actions"><a href="/present" target="_blank" rel="noreferrer">Preview form ↗</a><Button type="submit" form="presenter-builder" disabled={busy || !dirty}>{busy ? "Saving…" : "Save form"}</Button></div></header>
    <div className="pb-tabs" role="tablist" aria-label="Form builder" onKeyDown={event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const index = event.key === "Home" ? 0 : event.key === "End" ? 2 : (tabs.indexOf(tab) + (event.key === "ArrowRight" ? 1 : 2)) % 3;
      setTab(tabs[index]); document.getElementById(`pb-tab-${tabs[index]}`)?.focus();
    }}>{tabs.map(value => <button key={value} type="button" role="tab" id={`pb-tab-${value}`} aria-controls={`pb-panel-${value}`} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} onClick={() => setTab(value)}>{value}{value === "Responses" && submissions && <span className="pb-count">{submissions.count}</span>}</button>)}</div>
    {error && <p className="pb-message" role="alert">{error}</p>}{notice && <p className="pb-message" role="status">{notice}</p>}
    {!settings && !error && <p role="status">Loading form…</p>}
    {!settings && error && <Button onClick={() => window.location.reload()}>Retry loading</Button>}
    {settings && form && <form id="presenter-builder" noValidate onSubmit={event => { event.preventDefault(); void run(async () => { setSettings(await api<Settings>("save", settings)); setDirty(false); setNotice("Form saved. The public page now uses these settings."); }); }}>
      <fieldset disabled={busy} className="pb-workspace" role="tabpanel" id="pb-panel-Questions" aria-labelledby="pb-tab-Questions" hidden={tab !== "Questions"}>
        <legend className="pb-sr-only">Questions</legend>
        <div className="pb-canvas"><p className="pb-canvas-hint">Click any part of the form to edit it.</p>
          {(Object.keys(blocks) as Block[]).map(block => <button className="pb-block" type="button" key={block} aria-label={`Edit ${blocks[block].label}`} aria-pressed={selected === block} aria-controls="pb-properties" onClick={() => select(block)}>{preview(block)}</button>)}
        </div>
        <aside id="pb-properties" className="pb-properties" aria-label="Field properties">
          <header><h2>{blocks[selected].label}</h2><p>{blocks[selected].type}</p></header>
          {blocks[selected].fields.map(field)}
          {selected === "theme" && <div className="pb-field"><h3>Dropdown options</h3><p>Choose the themes presenters can select.</p>
            {form.themes.split("\n").map((value, index, options) => <div className="pb-option" key={index}>
              <Input aria-label={`Theme ${index + 1}`} placeholder="e.g. AI in production" maxLength={200} value={value} onChange={event => change("themes", options.map((option, i) => i === index ? event.target.value : option).join("\n"))} />
              <Button type="button" aria-label={`Remove theme ${index + 1}`} onClick={() => change("themes", options.filter((_, i) => i !== index).join("\n"))}><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg></Button>
            </div>)}<Button type="button" onClick={() => change("themes", form.themes + "\n")}>Add option</Button>
          </div>}
          {["contact", "project", "theme", "consent"].includes(selected) && <p className="pb-field-note">Required · keeps the form to three question groups and an agreement.</p>}
        </aside>
      </fieldset>
      <fieldset disabled={busy} className="pb-settings" role="tabpanel" id="pb-panel-Settings" aria-labelledby="pb-tab-Settings" hidden={tab !== "Settings"}>
        <legend className="pb-sr-only">Settings</legend>
        <section><h2>Collect responses</h2><label className="presenter-toggle"><input type="checkbox" checked={form.open} onChange={e => change("open", e.target.checked)} />Accept presenter interest</label>{field("closedMessage")}</section>
        <section><h2>After submission</h2><p>What presenters see once their interest has been saved.</p>{field("successTitle")}{field("successMessage")}</section>
      </fieldset>
    </form>}
    <section className="pb-responses" role="tabpanel" id="pb-panel-Responses" aria-labelledby="pb-tab-Responses" hidden={tab !== "Responses"}><header><h2>Expressions of interest{submissions ? ` (${submissions.count})` : ""}</h2><Button disabled={busy} onClick={() => void run(async () => setSubmissions(await api<Submissions>("submissions")))}>Refresh submissions</Button></header>
      <p>Private to administrators. WhatsApp links open a chat; they do not send a message.</p>
      {submissions?.items.length === 0 && <p>No expressions of interest yet.</p>}
      {submissions?.items.map(({ id, data }) => <article key={id}>
        <header><h3>{data.name}</h3><time dateTime={data.createdAt}>{new Date(data.createdAt).toLocaleString()}</time></header>
        <a href={`https://wa.me/${data.whatsapp.slice(1)}`} target="_blank" rel="noreferrer">{data.whatsapp} · Open WhatsApp ↗</a>
        <p className="presenter-answer">{data.project}</p><p><strong>Theme:</strong> {data.theme}</p>
        <p className="presenter-answer"><strong>Agreed guidelines:</strong>{"\n"}{data.guidelines}{"\n\n"}{data.consent}</p>
      </article>)}
      {submissions?.cursor && <Button disabled={busy} onClick={() => void run(async () => { const next = await api<Submissions>(`submissions?cursor=${encodeURIComponent(submissions.cursor!)}`); setSubmissions({ ...next, items: [...submissions.items, ...next.items] }); })}>Load more submissions</Button>}
    </section>
  </div>;
}
export const pages: PluginAdminExports["pages"] = { "/presenters": PresenterAdmin };
