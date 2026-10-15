export interface PageFormatData {
  page_format?: string | null;
  use_sections?: boolean;
  layout?: unknown[];
}

export function pageFormat(page: PageFormatData, isHome = false): "sections" | "rich_text" {
  if (page.page_format === "sections" || page.page_format === "rich_text") return page.page_format;
  return page.use_sections || page.layout?.length || isHome ? "sections" : "rich_text";
}
