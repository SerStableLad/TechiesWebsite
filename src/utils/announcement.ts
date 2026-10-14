export function isAnnouncementActive(
	data: { title?: string; starts_at?: string | null; ends_at?: string | null },
	now = Date.now(),
) {
	const start = data.starts_at ? Date.parse(data.starts_at) : -Infinity;
	const end = data.ends_at ? Date.parse(data.ends_at) : Infinity;
	return Boolean(data.title?.trim()) && start <= now && now < end;
}

export function announcementLink(value?: string | null) {
	const href = value?.trim();
	if (!href || !/^(https?:\/\/|\/(?!\/))/i.test(href)) return null;
	try {
		const url = new URL(href, "https://techies.invalid");
		return ["http:", "https:"].includes(url.protocol) ? href : null;
	} catch {
		return null;
	}
}
