const eventSlug = /^[a-zA-Z0-9_-]+$/;
const scheduledStatus = /\/Event(?:Scheduled|Rescheduled)$/;
const eventPath = /^\/([a-zA-Z0-9_-]+)\/?$/;

export interface CalendarEvent {
	name: string;
	url: string;
	start_at: string;
	end_at: string;
	timezone?: string;
	cover_url?: string;
	location_type?: string;
	geo_address_visibility?: string;
	geo_address_info?: { address?: string; city?: string };
}

export function parseCalendar(data: unknown): CalendarEvent[] {
	if (!data || typeof data !== "object" || !("entries" in data) || !Array.isArray(data.entries))
		throw new Error("Invalid Luma calendar response");
	return data.entries
		.flatMap((entry) => {
			const event = entry?.event;
			if (
				!event ||
				typeof event.name !== "string" ||
				typeof event.url !== "string" ||
				!eventSlug.test(event.url) ||
				typeof event.start_at !== "string" ||
				typeof event.end_at !== "string" ||
				!Number.isFinite(Date.parse(event.start_at)) ||
				!Number.isFinite(Date.parse(event.end_at)) ||
				Date.parse(event.end_at) <= Date.parse(event.start_at)
			)
				return [];
			return [event];
		})
		.toSorted((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at));
}

export function futureEvents(events: CalendarEvent[], now = Date.now()) {
	return events.filter((event) => Date.parse(event.start_at) > now);
}

const calendarUrl = "https://luma.com/APACtechies";
const isRecord = (value: unknown): value is Record<string, unknown> =>
	Boolean(value && typeof value === "object" && !Array.isArray(value));

export function parseCalendarPage(html: string): CalendarEvent[] {
	const entries: { event: CalendarEvent }[] = [];
	let found = false;
	for (const [, json] of html.matchAll(
		/<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi,
	)) {
		let data: unknown;
		try {
			data = JSON.parse(json);
		} catch {
			continue;
		}
		for (const list of Array.isArray(data) ? data : [data]) {
			if (
				!isRecord(list) ||
				list["@type"] !== "ItemList" ||
				list.url !== calendarUrl ||
				!Array.isArray(list.itemListElement)
			)
				continue;
			found = true;
			for (const entry of list.itemListElement) {
				const item = isRecord(entry) ? entry.item : undefined;
				if (
					!isRecord(item) ||
					item["@type"] !== "Event" ||
					typeof item.name !== "string" ||
					typeof item.url !== "string" ||
					typeof item.startDate !== "string" ||
					typeof item.endDate !== "string"
				)
					continue;
				if (
					item.eventStatus !== undefined &&
					(typeof item.eventStatus !== "string" || !scheduledStatus.test(item.eventStatus))
				)
					continue;
				let url: URL;
				try {
					url = new URL(item.url);
				} catch {
					continue;
				}
				const slug = eventPath.exec(url.pathname)?.[1];
				if (url.origin !== "https://luma.com" || url.username || url.password || !slug) continue;
				const location = isRecord(item.location) ? item.location : undefined;
				const address = isRecord(location?.address) ? location.address : undefined;
				const venue =
					typeof location?.name === "string"
						? location.name
						: typeof address?.streetAddress === "string"
							? address.streetAddress
							: undefined;
				const cover = Array.isArray(item.image)
					? item.image.find((image) => typeof image === "string")
					: item.image;
				entries.push({
					event: {
						name: item.name,
						url: slug,
						start_at: item.startDate,
						end_at: item.endDate,
						...(typeof cover === "string" && cover.startsWith("https://images.lumacdn.com/")
							? { cover_url: cover }
							: {}),
						location_type:
							item.eventAttendanceMode === "https://schema.org/OnlineEventAttendanceMode"
								? "online"
								: "offline",
						...(venue
							? { geo_address_visibility: "public", geo_address_info: { address: venue } }
							: {}),
					},
				});
			}
		}
	}
	if (!found) throw new Error("Luma calendar structured data was not found");
	return parseCalendar({ entries });
}

let cache:
	| { events: CalendarEvent[]; unavailable: boolean; expires: number; staleUntil: number }
	| undefined;
let pending: Promise<NonNullable<typeof cache>> | undefined;

export async function getCalendar() {
	if (!cache || cache.expires <= Date.now()) {
		pending ??= (async () => {
			try {
				// shortcut: reads Luma's public JSON-LD; update the parser if its calendar markup changes.
				const response = await fetch(calendarUrl, {
					headers: { Accept: "text/html" },
					signal: AbortSignal.timeout(6000),
				});
				if (!response.ok) throw new Error(`Luma returned ${response.status}`);
				return {
					events: parseCalendarPage(await response.text()),
					unavailable: false,
					expires: Date.now() + 300_000,
					staleUntil: Date.now() + 3_600_000,
				};
			} catch (error) {
				console.warn("Upcoming events unavailable:", error);
				return {
					events: cache && cache.staleUntil > Date.now() ? cache.events : [],
					unavailable: true,
					expires: Date.now() + 60_000,
					staleUntil: cache?.staleUntil ?? 0,
				};
			}
		})();
		try {
			cache = await pending;
		} finally {
			pending = undefined;
		}
	}
	return { events: futureEvents(cache.events), unavailable: cache.unavailable };
}

export function eventVenue(event: CalendarEvent) {
	if (event.location_type === "online") return "Online";
	return event.geo_address_visibility === "public" &&
		typeof event.geo_address_info?.address === "string"
		? event.geo_address_info.address
		: "Venue details on Luma";
}

export function eventTimezone(event: CalendarEvent) {
	try {
		new Intl.DateTimeFormat("en", { timeZone: event.timezone }).format();
		return event.timezone || "Asia/Singapore";
	} catch {
		return "Asia/Singapore";
	}
}
