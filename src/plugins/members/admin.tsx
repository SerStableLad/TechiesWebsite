import { Button, Input } from "@cloudflare/kumo";
import { useLingui } from "@lingui/react";
import { useEffect, useState } from "react";
import { apiFetch } from "emdash/plugin-utils";
import type { PluginAdminExports } from "emdash";
import { memberEditorLabels } from "./editor-labels";

interface FieldProps {
  value: unknown;
  onChange: (value: unknown) => void;
  label: string;
  id: string;
  options?: Record<string, unknown> | Array<{ value: string; label: string }>;
}

function InterestTags({ value, onChange, label, id, options }: FieldProps) {
  const [input, setInput] = useState("");
  const tags = typeof value === "string" ? value.split(" · ").map(tag => tag.trim()).filter(Boolean) : [];
  const suggestions = !Array.isArray(options) && Array.isArray(options?.suggestions) ? options.suggestions.filter((tag): tag is string => typeof tag === "string") : [];
  function addTag() {
    const tag = input.trim();
    if (tag && !tags.some(existing => existing.toLowerCase() === tag.toLowerCase())) onChange([...tags, tag].join(" · "));
    setInput("");
  }
  return <div className="grid gap-3">
    <Input id={id} label={label} value={input} placeholder="Add an interest" list={`${id}-suggestions`} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addTag(); } }} />
    <datalist id={`${id}-suggestions`}>{suggestions.filter(tag => !tags.includes(tag)).map(tag => <option key={tag} value={tag} />)}</datalist>
    <div className="flex flex-wrap gap-2" aria-label="Selected technical interests">{tags.map(tag => <Button key={tag} type="button" variant="secondary" size="sm" aria-label={`Remove ${tag}`} onClick={() => onChange(tags.filter(t => t !== tag).join(" · "))}>{tag} ×</Button>)}</div>
    <div><Button type="button" variant="secondary" size="sm" disabled={!input.trim()} onClick={addTag}>Add tag</Button></div>
  </div>;
}

function AutoRecaps({ value, label, id }: FieldProps) {
  const { i18n } = useLingui();
  useEffect(() => memberEditorLabels(i18n), [i18n, i18n.locale]);
  const [recaps, setRecaps] = useState(Array.isArray(value) ? value : []);
  const [error, setError] = useState("");
  useEffect(() => {
    const memberId = /^\/_emdash\/admin\/content\/members\/([^/]+)\/?$/.exec(window.location.pathname)?.[1];
    if (!memberId || memberId === "new") return;
    let active = true;
    void apiFetch(`/_emdash/api/plugins/techies-members/recaps?memberId=${encodeURIComponent(memberId)}`).then(async response => {
      const result = await response.json() as { success?: boolean; data?: { recaps?: unknown } };
      if (!response.ok || !result.success || !Array.isArray(result.data?.recaps)) throw new Error("Could not load event recaps.");
      if (active) setRecaps(result.data.recaps);
    }).catch(() => { if (active) setError("Could not refresh event recaps. Reload the editor to try again."); });
    return () => { active = false; };
  }, []);
  return <div id={id} className="grid gap-2">
    <p className="text-sm font-medium">{label}</p>
    <p className="text-sm text-kumo-subtle">Filled automatically from published summaries that link to this member. Updated when you save.</p>
    {error && <p role="alert" className="text-sm text-kumo-danger">{error}</p>}
    <ul className="grid gap-2">{recaps.map(block => {
      const href = block?.markDefs?.find((mark: { href?: string }) => typeof mark.href === "string" && mark.href.startsWith("/posts/"))?.href;
      return href ? <li key={href}><a className="underline underline-offset-4" href={href} target="_blank" rel="noopener noreferrer">{block.children?.map((span: { text?: string }) => span.text || "").join("")}</a></li> : null;
    })}</ul>
    {!recaps.length && <p className="text-sm text-kumo-subtle">No published speaker appearances yet.</p>}
  </div>;
}

function ExcoTag({ id }: FieldProps) {
  const [admin, setAdmin] = useState(false);
  const [tag, setTag] = useState<{ enabled: boolean; revision: string | null }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const memberId = /^\/_emdash\/admin\/content\/members\/([^/]+)\/?$/.exec(window.location.pathname)?.[1];
  const saved = memberId && memberId !== "new";
  async function request(enabled?: boolean) {
    const response = await apiFetch(`/_emdash/api/plugins/techies-members/${enabled === undefined ? `exco?memberId=${encodeURIComponent(memberId!)}` : "exco-update"}`, enabled === undefined ? undefined : {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memberId, enabled, revision: tag?.revision }),
    });
    const result = await response.json() as { success?: boolean; data?: { enabled: boolean; revision: string | null }; error?: { message?: string } };
    if (!response.ok || !result.success || !result.data) throw new Error(result.error?.message || "Could not load or save the Exco tag. Reload and try again.");
    return result.data;
  }
  useEffect(() => {
    let active = true;
    void apiFetch("/_emdash/api/auth/me").then(response => response.json() as Promise<{ data?: { role?: number } }>).then(async result => {
      if (result.data?.role !== 50 || !active) return;
      setAdmin(true);
      if (saved) { const value = await request(); if (active) setTag(value); }
    }).catch(() => { if (active) setError("Could not load the Exco tag. Reload and try again."); });
    return () => { active = false; };
  }, [memberId]);
  if (!admin) return null;
  async function toggle() {
    setBusy(true); setError("");
    try { setTag(await request(!tag!.enabled)); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not save the Exco tag."); }
    finally { setBusy(false); }
  }
  return <div id={id} className="grid gap-2">
    <p className="text-sm font-medium">Exco</p>
    {saved ? <Button type="button" variant="secondary" role="switch" aria-checked={tag?.enabled ?? false} disabled={!tag || busy} onClick={toggle}>{busy ? "Saving…" : tag?.enabled ? "Exco: on" : "Exco: off"}</Button> : <p>Save this member before setting their Exco tag.</p>}
    <p className="text-sm text-kumo-subtle">Visible only to administrators. Changes save immediately.</p>
    {error && <p role="alert" className="text-sm text-kumo-danger">{error}</p>}
  </div>;
}

export const fields: PluginAdminExports["fields"] = {
  hidden: () => null,
  interests: InterestTags,
  recaps: AutoRecaps,
  exco: ExcoTag,
};
