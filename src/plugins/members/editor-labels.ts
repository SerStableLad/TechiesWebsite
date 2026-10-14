import type { useLingui } from "@lingui/react";

/** Scope shared admin translations to the mounted Members editor. */
export function memberEditorLabels(i18n: ReturnType<typeof useLingui>["i18n"]) {
  const locale = i18n.locale;
  const previous = {
    oDAEQq: i18n.messages.oDAEQq ?? "Ownership",
    VbeIOx: i18n.messages.VbeIOx ?? "Author",
  };
  const labels = { oDAEQq: "Approved by", VbeIOx: "Approved by" };
  const apply = () => {
    if (i18n.locale === locale && Object.entries(labels).some(([id, label]) => i18n.messages[id] !== label)) i18n.load(locale, labels);
  };
  const unsubscribe = i18n.on("change", apply);
  apply();
  return () => {
    unsubscribe();
    i18n.load(locale, previous);
  };
}
