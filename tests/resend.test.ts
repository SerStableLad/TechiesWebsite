import { beforeEach, describe, expect, it, vi } from "vitest";
import { deliverResendEmail } from "../src/plugins/resend/index.js";

describe("Resend transport", () => {
	const values = new Map<string, unknown>();
	const settings = { get: async <T>(key: string) => (values.get(key) as T | undefined) ?? null };
	const event = {
		source: "system",
		message: {
			to: "member@example.com",
			subject: "Sign in",
			text: "https://example.com/verify?token=private-token",
			html: '<a href="https://example.com/verify?token=private-token">Sign in</a>',
		},
	};
	const apiKey = "re_test_private_key";
	const fetch = vi.fn<typeof globalThis.fetch>();

	beforeEach(() => {
		values.set("apiKey", apiKey);
		values.set("fromEmail", "login@example.com");
		fetch.mockReset().mockResolvedValue(Response.json({ id: "message-id" }));
	});

	it("delivers auth content intact without following redirects", async () => {
		await deliverResendEmail(event, { settings, http: { fetch } });
		const [url, request] = fetch.mock.calls[0]!;
		expect(url).toBe("https://api.resend.com/emails");
		expect(request!.redirect).toBe("error");
		expect(request!.headers).toMatchObject({ Authorization: `Bearer ${apiKey}` });
		expect(await new Response(request!.body).json()).toEqual({
			from: "login@example.com",
			to: [event.message.to],
			subject: event.message.subject,
			text: event.message.text,
			html: event.message.html,
		});
	});

	it.each([
		"victim@example.com,attacker@example.com",
		"victim@example.com\r\nBcc: attacker@example.com",
		"invalid",
	])("rejects unsafe recipient %j before making a request", async (to) => {
		await expect(
			deliverResendEmail(
				{ ...event, message: { ...event.message, to } },
				{ settings, http: { fetch } },
			),
		).rejects.toThrow("valid email address");
		expect(fetch).not.toHaveBeenCalled();
	});

	it("preserves validated CC and reply-to addresses", async () => {
		await deliverResendEmail(
			{
				...event,
				message: { ...event.message, cc: ["copy@example.com"], replyTo: "reply@example.com" },
			},
			{ settings, http: { fetch } },
		);
		expect(await new Response(fetch.mock.calls[0]![1]!.body).json()).toMatchObject({
			cc: ["copy@example.com"],
			reply_to: "reply@example.com",
		});
	});

	it("rejects missing credentials and injected subjects without sending", async () => {
		await expect(
			deliverResendEmail(
				{ ...event, message: { ...event.message, subject: "Hi\r\nBcc: attacker@example.com" } },
				{ settings, http: { fetch } },
			),
		).rejects.toThrow("subject");
		values.delete("apiKey");
		await expect(deliverResendEmail(event, { settings, http: { fetch } })).rejects.toThrow(
			"Configure a Resend API key",
		);
		expect(fetch).not.toHaveBeenCalled();
	});

	it("does not expose provider error bodies or retry failed requests", async () => {
		fetch.mockResolvedValue(new Response(`${apiKey} ${event.message.text}`, { status: 429 }));
		await expect(deliverResendEmail(event, { settings, http: { fetch } })).rejects.toThrow(
			"Resend rejected the email (HTTP 429).",
		);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("sanitizes network errors", async () => {
		fetch.mockImplementation(async (_url, request) => {
			expect(request!.signal).toBeInstanceOf(AbortSignal);
			throw new Error(`${apiKey} ${event.message.text}`);
		});
		await expect(deliverResendEmail(event, { settings, http: { fetch } })).rejects.toThrow(
			"Resend delivery failed or timed out. Check provider delivery status before retrying.",
		);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("aborts a stalled request after ten seconds without retrying", async () => {
		fetch.mockImplementation(
			(_url, request) =>
				new Promise((_resolve, reject) => {
					request!.signal!.addEventListener("abort", () => reject(request!.signal!.reason), {
						once: true,
					});
				}),
		);
		await expect(deliverResendEmail(event, { settings, http: { fetch } })).rejects.toThrow(
			"Resend delivery failed or timed out",
		);
		expect(fetch).toHaveBeenCalledTimes(1);
	}, 15_000);
});
