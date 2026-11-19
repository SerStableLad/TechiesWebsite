# Techies Resend transport

This site-local native plugin is derived from the Resend transport in [EmDash SMTP](https://github.com/masonjames/emdash-smtp/blob/288b84db6d59c5b2a995f0359ec6298451522c02/packages/core/src/providers.ts#L771-L797), commit `288b84db6d59c5b2a995f0359ec6298451522c02`. The upstream MIT license is retained in `LICENSE`.

The fork keeps only Resend HTTPS delivery. It uses EmDash's encrypted secret settings, accepts single email addresses rather than recipient-list strings, restricts HTTP access to `api.resend.com`, rejects redirects, and times out requests after ten seconds. It preserves text and HTML content, CC, and reply-to addresses. It does not store email bodies, provider response bodies, or delivery logs, and it does not retry ambiguous delivery failures.

SMTP, sendmail, Nodemailer, OAuth providers, fallback routing, and the upstream custom admin interface are omitted. The plugin uses EmDash's built-in settings interface. It runs with the site's authority, not in a sandbox.

Setup instructions are in the [site README](../../../README.md#resend-magic-link-email).
