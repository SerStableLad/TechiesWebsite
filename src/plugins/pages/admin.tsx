import { useEffect, useState } from "react";
import { useLingui } from "@lingui/react";
import { apiFetch } from "emdash/plugin-utils";
import { pageFormat, type PageFormatData } from "../../utils/page-format";
import "./admin.css";

function PageFormat({ value, onChange, id, label }: { value: unknown; onChange: (value: unknown) => void; id: string; label: string }) {
  const { i18n } = useLingui();
  const t = (message: string) => i18n._({ id: `pages.${message}`, message });
  const [existing, setExisting] = useState<string>();
  const [error, setError] = useState("");
  const mode = value === "sections" || value === "rich_text" ? value : existing;
  useEffect(() => {
    if (value === "sections" || value === "rich_text") return;
    const contentId = window.location.pathname.match(/\/content\/pages\/([^/]+)$/)?.[1];
    if (!contentId || contentId === "new") return;
    const controller = new AbortController();
    void apiFetch(`/_emdash/api/content/pages/${encodeURIComponent(contentId)}`, { signal: controller.signal })
      .then(async response => {
        const result = await response.json() as { success?: boolean; data?: { item: { slug: string; data: PageFormatData } } };
        if (!response.ok || !result.success || !result.data?.item) throw new Error("Could not load the existing page format. Choose a format below; your saved content is retained.");
        if (!controller.signal.aborted) setExisting(pageFormat(result.data.item.data, result.data.item.slug === "home"));
      }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [value]);
  return <fieldset id={id} className="page-format" data-mode={mode}>
    <legend>{label}</legend>
    {error && <p role="alert">{t(error)}</p>}
    <div className="page-format-options">
      {([['sections', 'Page builder', 'Arrange reusable sections with their own text, images and links.'], ['rich_text', 'Rich-text page', 'Write a simple page with one rich-text body.']] as const).map(([format, title, description]) =>
        <label key={format}><input type="radio" name={id} value={format} checked={mode === format} onChange={() => onChange(format)} /><span><strong>{t(title)}</strong><span>{t(description)}</span></span></label>)}
    </div>
    <p>{t(mode === "sections" ? "Add blocks below. Drag to reorder, or duplicate a block to reuse its layout. A first Hero supplies the page heading; otherwise the page title is used." : "Switching formats keeps both your blocks and rich text. Only the selected format is shown on the site.")}</p>
  </fieldset>;
}

export const fields = { format: PageFormat, retained: () => null };
