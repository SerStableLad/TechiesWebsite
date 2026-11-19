const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function localDate(value: unknown): string {
	if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return "";
	// Expiry is exclusive: midnight ends the preceding display day.
	const date = new Date(Date.parse(value) - 1);
	return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export function utcDate(value: string): string | null {
	if (!DATE_PATTERN.test(value)) return null;
	const date = new Date(`${value}T00:00:00`);
	const [year, month, day] = value.split("-").map(Number);
	if (date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day)
		return null;
	date.setDate(date.getDate() + 1);
	return date.toISOString();
}
