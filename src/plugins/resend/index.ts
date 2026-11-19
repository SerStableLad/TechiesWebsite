import { definePlugin } from "emdash";
import type { PluginContext, SettingField } from "emdash";
import type { EmailDeliverEvent } from "emdash/plugin";

export const settingsSchema: Record<string, SettingField> = {
	apiKey: { type: "secret", label: "Resend API key" },
	fromEmail: { type: "email", label: "Verified sender email" },
};

const CONTROL_CHARACTERS = /\p{Cc}/u;
const EMAIL_ADDRESS = /^[^\s<>,;:"\\@]+@[^\s<>,;:"\\@]+\.[^\s<>,;:"\\@]+$/;
const API_KEY = /^[\x21-\x7e]+$/;

function emailAddress(value: unknown): string {
	if (
		typeof value !== "string" ||
		value.length > 254 ||
		CONTROL_CHARACTERS.test(value) ||
		!EMAIL_ADDRESS.test(value)
	) {
		throw new Error("Resend requires a single valid email address per recipient or sender.");
	}
	return value;
}

export async function deliverResendEmail(
	{ message }: EmailDeliverEvent,
	ctx: Pick<PluginContext, "http"> & { settings: Pick<PluginContext["settings"], "get"> },
): Promise<void> {
	const apiKey = await ctx.settings.get<string>("apiKey");
	if (!apiKey || apiKey.length > 1024 || !API_KEY.test(apiKey)) {
		throw new Error("Configure a Resend API key in the plugin settings before sending email.");
	}
	const from = emailAddress(await ctx.settings.get<string>("fromEmail"));
	const to = emailAddress(message.to);
	const cc = message.cc?.map(emailAddress);
	if ((cc?.length ?? 0) > 49) {
		throw new Error("Resend supports at most 50 recipients per email.");
	}
	const replyTo = message.replyTo === undefined ? undefined : emailAddress(message.replyTo);
	if (typeof message.subject !== "string" || CONTROL_CHARACTERS.test(message.subject)) {
		throw new Error("Resend requires a subject without header control characters.");
	}
	if (!ctx.http) throw new Error("Resend requires network access.");

	let response: Response;
	try {
		response = await ctx.http.fetch("https://api.resend.com/emails", {
			method: "POST",
			redirect: "error",
			signal: AbortSignal.timeout(10_000),
			headers: {
				accept: "application/json",
				"content-type": "application/json",
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				from,
				to: [to],
				subject: message.subject,
				text: message.text,
				...(message.html ? { html: message.html } : {}),
				...(cc?.length ? { cc } : {}),
				...(replyTo ? { reply_to: replyTo } : {}),
			}),
		});
	} catch {
		throw new Error(
			"Resend delivery failed or timed out. Check provider delivery status before retrying.",
		);
	}
	if (!response.ok) {
		throw new Error(`Resend rejected the email (HTTP ${response.status}).`);
	}
}

export function createPlugin() {
	return definePlugin({
		id: "techies-resend",
		version: "0.1.0",
		capabilities: ["hooks.email-transport:register", "network:request"],
		allowedHosts: ["api.resend.com"],
		admin: { settingsSchema },
		hooks: {
			"email:deliver": { exclusive: true, handler: deliverResendEmail },
		},
	});
}
