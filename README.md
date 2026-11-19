# Techies site

The Techies homepage, member directory, and blog run on Astro and EmDash. Local development uses SQLite (`data.db`) and a local media directory (`uploads/`). The Cloudflare preview uses separate D1, KV and R2 resources.

## Run locally

Install dependencies and start the local site from the repository root.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open [the local site](http://localhost:4322/). On first launch, open [development setup](http://localhost:4322/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin) to load the sample content and sign in as the local development administrator. Sample images download from their source URLs; this step requires internet access.

## Cloudflare preview

Run `pnpm deploy` to build and deploy this branch to `techies-emdash-preview`. Set `PREVIEW_PASSWORD` with `pnpm exec wrangler secret put PREVIEW_PASSWORD` and use an ASCII password. The preview refuses requests until this secret is set. Sign in at the browser prompt as `techies`, then visit `/_emdash/admin/setup` to register the first admin passkey. Select the bundled content if the site has not already been seeded.

The preview uses `seed/seed.json`; it does not copy the local database, uploaded files, or secrets.

## Edit content

Use [the admin panel](http://localhost:4322/_emdash/admin) to manage these features:

- **Pages:** edit the `home` entry or create pages. Choose the page builder or rich-text format. Switching formats retains both sets of content. Published pages use `/{slug}`, with `/pages/{slug}` also supported.
- **Members:** manage profiles separately from blog posts. The public directory is at `/members`.
- **Posts:** assign **Event summaries** or **Partnership Announcement** in Categories. Their archives are `/category/event-summaries` and `/category/partnership-announcement`.
- **Menus:** edit `reference_navigation` for the header, `footer_social` for footer column 3, and `footer_explore` for footer column 4. Use **Add Heading** in either footer menu to insert text without a link.

New installations get both footer menus from the seed. On an existing site, create menus named `footer_social` and `footer_explore` in **Menus** and add their links; until each menu exists, that column keeps its original links. The logo, description, and copyright are still defined in `src/layouts/Base.astro`.

## Partnership announcements

New partner posts follow [docs/partnership-announcement.md](docs/partnership-announcement.md): the fields to set, the four body blocks, the voice rules, and the checks before publishing. Generate the 1200×630 lockup image with:

```sh
pnpm lockup -- --partner ~/partner-logo.png --out public/brand/partnership-<slug>.png
```

Pass the partner's light-on-dark logo, and `--width 470` for wide wordmarks.

## Presenter registration

The public `/present` page embeds the Roast My TechStack Airtable form. A link appears on the Events page. Airtable stores submissions and controls the form fields and availability.

## Announcement banners

In a post’s editor settings sidebar, check **Announcement banner**, enter **Banner text** and **Button text**, and choose **Display until**. The banner stays visible through that date in your device’s time zone. Leave the banner text blank to use the post title and excerpt, or the button text blank to use “Learn more”. Publish the post or publish its saved changes to apply the banner. The strip appears below the navigation with a link to the post.

Visitors can dismiss the banner. Their browser remembers that dismissal until the announcement’s text, button label, or end date changes, or a different post becomes the announcement. Dismissal does not carry across browsers or devices.

Only published, enabled, unexpired posts qualify. When several qualify, the most recently published post appears. Expiry hides the banner, including on already-open pages, without unpublishing the post. Banner rendering checks the clock on each page request and disables route caching so an expired banner is not served from the route cache.

Fresh installations receive the fields from the seed. For an existing local database, run this additive setup once; it keeps existing posts and Pages content.

```sh
pnpm setup:announcements
```

## Resend magic-link email

The local `techies-resend` transport is registered in `astro.config.mjs`. EmDash creates and verifies magic links; this plugin delivers the email. No email is sent just by starting the site.

1. Generate an encryption key with `pnpm exec emdash secrets generate`. Store it as `EMDASH_ENCRYPTION_KEY` in your deployment's runtime environment before configuring the plugin. Keep a secure backup separate from the database. Losing it makes saved credentials unreadable. Do not put the key in `astro.config.mjs` or commit it.
2. Create a Resend API key with sending-only access restricted to your verified sender domain.
3. In the admin, open **Plugins**, then the settings for **techies-resend**. Enter the API key and a bare verified sender address, such as `login@your-domain.com`. Saving the key requires the encryption key; EmDash encrypts it in the database and does not return it to the admin client.
4. Open **Settings → Email** and select **techies-resend** if another transport is selected. Use **Send test email** to verify delivery, then try magic-link login for an existing user.

An enabled but unconfigured transport cannot deliver magic links or invitations. Configure it before relying on email login; keep your passkey available. If a send times out, check Resend's delivery history before retrying because the provider may have accepted the first request.

This is a [Resend-only fork](src/plugins/resend/README.md) of EmDash SMTP, not an installation of its full npm package. There is no SMTP or Nodemailer dependency. It does not import settings from an existing EmDash SMTP installation.

Run the offline transport regression tests with:

```sh
pnpm test:resend
```

## Verify

With the local server running and sample content loaded, run the app checks from the repository root. The CMS and announcement-site checks create temporary content and move only their test entries to trash. Browser checks require `pnpm exec playwright install chromium` and save screenshots in `.emdash/screenshots/`.

```sh
pnpm test
pnpm test:cms
pnpm test:browser
pnpm test:announcements
pnpm test:announcement-site
pnpm typecheck
pnpm build
```
