import { definePlugin } from "emdash";

export function validateAnnouncement(data: Record<string, unknown>) {
	if (!data.announcement_banner) return;
	if (
		typeof data.announcement_until !== "string" ||
		!Number.isFinite(Date.parse(data.announcement_until))
	) {
		throw new Error("Choose a valid display-until date for the announcement banner.");
	}
	return { ...data, announcement_until: new Date(data.announcement_until).toISOString() };
}

export function createPlugin(options: { adminEntry: string }) {
	return definePlugin({
		id: "techies-announcements",
		version: "0.1.0",
		capabilities: ["content:write"],
		admin: { entry: options.adminEntry },
		hooks: {
			"content:beforeSave": {
				errorPolicy: "abort",
				handler: async (event) => {
					if (event.collection === "posts") return validateAnnouncement(event.content);
				},
			},
		},
	});
}
