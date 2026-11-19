import { Checkbox, Input } from "@cloudflare/kumo";
import { useLingui } from "@lingui/react";

import { localDate, utcDate } from "./dates.js";

import "./admin.css";

interface FieldProps {
	value: unknown;
	onChange: (value: unknown) => void;
	id: string;
	label: string;
}

function AnnouncementCheckbox({ value, onChange, id }: FieldProps) {
	const { i18n } = useLingui();
	return (
		<div id={id} className="announcement-option" data-enabled={Boolean(value)}>
			<Checkbox
				label={i18n._({ id: "announcement.enabled", message: "Announcement banner" })}
				checked={Boolean(value)}
				onCheckedChange={(checked) => onChange(Boolean(checked))}
			/>
		</div>
	);
}

function AnnouncementExpiry({ value, onChange, id }: FieldProps) {
	const { i18n } = useLingui();
	return (
		<div className="announcement-expiry">
			<Input
				id={id}
				className="w-full min-w-0"
				type="date"
				label={i18n._({ id: "announcement.until", message: "Display until" })}
				value={localDate(value)}
				onChange={(event) => onChange(utcDate(event.target.value))}
				description={i18n._({
					id: "announcement.dateHelp",
					message:
						"Shown through this date in your device’s time zone. Only published posts appear.",
				})}
			/>
		</div>
	);
}

function AnnouncementText({ value, onChange, id }: FieldProps) {
	const { i18n } = useLingui();
	return (
		<div className="announcement-text">
			<Input
				id={id}
				className="w-full min-w-0"
				label={i18n._({ id: "announcement.text", message: "Banner text" })}
				value={typeof value === "string" ? value : ""}
				maxLength={500}
				onChange={(event) => onChange(event.target.value)}
				description={i18n._({
					id: "announcement.textHelp",
					message: "Leave blank to use the post title and excerpt.",
				})}
			/>
		</div>
	);
}

function AnnouncementButtonText({ value, onChange, id }: FieldProps) {
	const { i18n } = useLingui();
	return (
		<div className="announcement-button-text">
			<Input
				id={id}
				className="w-full min-w-0"
				label={i18n._({ id: "announcement.buttonText", message: "Button text" })}
				placeholder={i18n._({ id: "announcement.learnMore", message: "Learn more" })}
				value={typeof value === "string" ? value : ""}
				maxLength={80}
				onChange={(event) => onChange(event.target.value)}
			/>
		</div>
	);
}

export const fields = {
	enabled: AnnouncementCheckbox,
	expiry: AnnouncementExpiry,
	text: AnnouncementText,
	buttonText: AnnouncementButtonText,
};
