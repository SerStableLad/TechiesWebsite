export function editorHtml(value: string, format?: string) {
	if (format === "html") return value;
	if (!value) return "";
	const escaped = value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
	return escaped.split(/\n\s*\n/).map(part => `<p>${part.replaceAll("\n", "<br>")}</p>`).join("");
}
