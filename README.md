# Techies · EmDash

The Techies community website, refreshed from `BRAND_GUIDE.md`. Astro server-rendered pages, EmDash content, Cloudflare D1 database and R2 media storage.

## Develop

```sh
pnpm install
pnpm dev
```

Site: <http://localhost:4321/> · Admin: <http://localhost:4321/_emdash/admin>

Complete EmDash setup with the bundled content enabled. In local development, you can also open `/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin` to initialise the seed and sign in. This endpoint is development-only. Reapplying through this endpoint skips existing entries; it does not overwrite your edits.

## Edit content

| Admin collection | Public destination | What to edit |
| --- | --- | --- |
| Pages → `home` | `/` | Hero, introduction, supper copy/photos, podcast copy/link |
| Programmes | Homepage events | Titles, descriptions, cover images, Luma links, accent, display order |
| Posts | `/posts` and `/posts/:slug` | Event summaries and other community posts |
| Exco profiles | `/exco` | The original five profiles, roles, portraits, biographies and links |
| Members | `/members` | Organiser-curated member profiles, current builds, interests and links |

Create member profiles as drafts, add real details, then publish. Published profiles appear in the showcase automatically; lower display-order numbers appear first. No member profiles are invented or seeded. The page shows a welcoming empty state until the first profile is published.

Posts support categories, tags, rich text, images, event date, source link and SEO. All six original Roast summaries (#2–#7) are imported as editable posts under the **Event summaries** category. The homepage lists the three most recent event dates. The Posts archive uses publication order.

Manage primary navigation in **Menus** and the site identity in **Settings**. Upcoming events stay live via the original Luma calendar. Podcast status remains **On pause · Season 1 complete**.

### Announcement strip

In **Announcements**, create an entry with **Announcement text**, optional **Show from** and **Hide at** dates, then publish it. The strip appears above navigation across the site. No start date means immediately; no end date means until unpublished. Start is inclusive and end is exclusive. If published announcements overlap, the most recently published active entry wins. Keep the message short; text wraps on phones.

The text and CTA are centred together. To add a button, fill in both **CTA text** (e.g. “See events”) and **CTA link** (an HTTP/HTTPS URL or a site path such as `/events`). Check **Open CTA in new tab** to open a new tab; unchecked opens in the current tab. Leave either field empty to show text only; invalid or unsafe links are not rendered.

Dismissal is remembered across navigation and reloads in the current tab using session storage; a fresh browser session shows the announcement again. If browser storage is unavailable, the dismiss button still hides it on the current page. Open pages hide the strip when its end date arrives; newly starting announcements appear on the next page load.

The local development CMS already has this collection. Fresh sites get it from the seed. For an existing deployment, add it before deploying the template:

```sh
pnpm exec emdash schema create announcements --label Announcements --label-singular Announcement --url https://your-site.example
pnpm exec emdash schema add-field announcements title --type text --label "Announcement text" --required --url https://your-site.example
pnpm exec emdash schema add-field announcements starts_at --type datetime --label "Show from (optional)" --url https://your-site.example
pnpm exec emdash schema add-field announcements ends_at --type datetime --label "Hide at (optional)" --url https://your-site.example
pnpm exec emdash schema add-field announcements cta_label --type string --label "CTA text (optional)" --url https://your-site.example
pnpm exec emdash schema add-field announcements cta_url --type string --label "CTA link (https://… or /path)" --url https://your-site.example
pnpm exec emdash schema add-field announcements cta_new_tab --type boolean --label "Open CTA in new tab" --url https://your-site.example
node scripts/check-announcement.mjs
# Against a running local dev server (temporary entries are cleaned up):
node scripts/check-announcement.mjs --cms-check
```

## Giveaway campaigns

Campaigns are native EmDash content entries under **Content → Campaigns**. Open a saved campaign to edit its details and manage private settings, participants, proof review and winners in **Campaign controls**, in the central editor column on desktop and mobile. The site-local **Techies Campaigns** plugin supplies the operational engine, editor fields and saved-entry controls; it has no Gleam account or subscription.

The native collection is the only campaign navigation entry. A saved campaign's **Campaign controls** panel contains its operational controls and links to its announcement. Old operational-page URLs redirect to the matching campaign editor.

Entry actions start with **Add action**. Each added action nests its type, title, link, instructions and weight inside a collapsible row. A new action opens immediately; saved actions start collapsed. Controls refresh saved content every five seconds so newly saved questions become available in Private settings.

### Create and run a campaign

1. Open **Content → Campaigns → Add New**. Use the native title/slug, Media Library image picker and Portable Text editors for description/rules. The date field validates closing-after-opening immediately; public pages show Singapore time and a live countdown. Incomplete drafts can be saved; full campaign validation runs before activation.
2. Set access to **public** or **private**. Configure invited addresses and optional correct answers in the saved entry's **Campaign controls → Private settings** view. Save those settings before activating. These secrets stay out of content fields, revisions and public queries. Private links alone do not grant access; visitors must verify an invited address.
3. Add **Answer a question**, **Submit proof**, **LinkedIn follow**, or **Like a LinkedIn post** actions. Choosing LinkedIn fills an editable mandatory title and self-explanatory instructions and displays its logo. LinkedIn actions are required to qualify and award **zero bonus entries**; proof must be manually approved before closing. Questions/proof can award 1–100 optional bonus entries. Questions support a case-insensitive correct answer; leave it empty to accept any non-empty response. LinkedIn verification is explicitly manual proof review, not API verification.
4. For public campaigns, use native **Publish now / Publish changes**. For invite-only campaigns, save the draft and use **Activate saved private draft** in Campaign controls. Private entries deliberately remain non-public CMS drafts so ordinary published-content queries cannot expose their prize/rules. Autosaves never replace an active campaign snapshot; publish/activate the saved version to apply changes. Draft/paused and archived campaigns are not publicly accessible, and activation never overrides the date window.
5. Participants verify their address with a six-digit emailed code, read the rules, and consent to register one base entry. Registration alone does not qualify a participant whose required actions are incomplete. Approval of every required action before closing qualifies the entry; LinkedIn approval adds no points. Optional approved actions add their configured weights once. Pending/rejected proof earns nothing. Rejected submissions can be retried while entries are open, up to six attempts per action.
6. In **Entries and review**, approve or reject proofs, leave a note, refresh statuses or download a CSV. Email/name/proof data and winner identities stay in the private admin. CSV values are escaped against spreadsheet formula injection.
7. Review proof **before** entries close. Publishing registers a one-shot draw at the deadline plus a minute-by-minute recovery sweep. Node executes through its native scheduler; Cloudflare executes on the first configured cron tick at or after the deadline. Eligibility is always evaluated at the closing instant: pending/rejected/late required proof is excluded, and late approvals are blocked. The **Winner draw** tab refreshes automatically and offers a recovery retry after closing. Crypto-random weighted selection picks distinct qualified people; if too few qualify, the record explicitly reports unfilled prizes. A persisted draw cannot be rerolled. Its audit records the deadline, actor, eligible weights, algorithm and eligibility SHA-256. Winners are not automatically emailed or publicly announced.
8. Archive a finished campaign to hide it publicly while retaining entries and draw history. Its saved content entry remains accessible through **Content → Campaigns**, with the archived engine status in Campaign controls.

### Linked announcement

Check **Create announcement** in the content editor to create one managed entry under **Announcements**. Repeated saves update the same entry rather than duplicating it. It stays a draft until the campaign is published/activated, then follows the campaign's opening/closing dates and links to `/campaigns/<slug>`. Unchecking and publishing/activating withdraws it; pausing, archiving or trashing the campaign also withdraws it. Invite-only campaigns generate generic invitation-only text, not their private title/prize. Unrelated announcements are never changed.

### Existing-site migration

Fresh installations get the Campaigns schema from the seed. For an existing site, run the idempotent migration after deploying the plugin code:

```sh
node scripts/migrate-campaign-content.mjs
# A remote target requires a suitably scoped EMDASH_TOKEN:
node scripts/migrate-campaign-content.mjs --url https://your-site.example
```

This adds native fields and links existing engine records through a managed campaign reference. Existing engine IDs, public slugs, invitations, participants, sessions, proofs and saved draws remain intact. Legacy HTML is converted to Portable Text. The script creates no duplicate content on rerun and does not delete engine data.

Actions, URL, dates and winner count lock after the first person enters. Removing an invited address revokes access and excludes it from the draw. An automatic campaign's eligibility settings also lock at closing. A saved draw is immutable even after archiving. Do not change already-agreed rules materially; create a new campaign instead. Stored consent times, rules hashes and immutable rules snapshots record the accepted terms. Existing drafts receive the new defaults when saved; historical entry terms and saved draws are not rewritten.

### Email and operation

Production needs an active email provider under **Settings → Email**. The plugin fails closed if delivery is unavailable; it never accepts an unverified address. Development uses EmDash's console provider; codes are logged and available to authenticated admins at `/_emdash/api/dev/emails`. See [EmDash Email Setup](https://docs.emdashcms.com/guides/email/) for Cloudflare Email Sending or SMTP options.

Codes expire after ten minutes, allow six attempts and are single-use. Campaign sessions expire after seven days and are kept in the current tab's session storage. Sign out revokes that session. Request-code throttles are five per address/campaign/hour, thirty per known client IP/hour (one hundred for the shared unknown-IP bucket), and three hundred per campaign/hour. Expired codes, sessions and throttle buckets are cleaned hourly by EmDash's scheduler. Campaign and participant data persist with the database; archiving does not erase them.

This version supports twenty actions, twenty winners and approximately ten thousand verified participants per campaign. Draw/export loads that bounded pool into memory, with a 16 MiB participant-data ceiling and EmDash's 8 MiB CSV response ceiling; larger campaigns need streaming/batched processing. A durable in-flight write gate prevents a draw racing with submissions or reviews. If a process crashes while holding the gate, the admin exposes **Interrupted request recovery** after closing; wait fifteen minutes after the latest write and confirm no requests are still running before recovering.

```sh
node scripts/check-campaigns.mjs
node scripts/check-campaign-scheduler.mjs
node scripts/check-native-campaigns.mjs
# Development-only: exercises email/invite/entry/review/draw boundaries.
# Creates labelled verification campaigns, then archives them with audit history.
node scripts/check-campaigns.mjs --cms-check
```

## Legacy URLs

Permanent redirects preserve `/index.html`, `/exco.html`, and `/roast-2.html` through `/roast-7.html`. Summaries redirect to `/posts/roast-N`.

## Migration source and checks

`seed/source/` archives the original Exco and recap HTML. `scripts/import_legacy.py` converts these snapshots into `seed/seed.json`, preserving paragraph text, formatting, links, images, lists, credits and demo links. It generates the seed only; it does not mutate a running CMS. EmDash imports referenced photos and artwork into its media storage during setup. The standalone wordmark is archived in `public/brand/`.

```sh
python3 scripts/import_legacy.py --check
python3 scripts/import_legacy.py
pnpm exec emdash seed seed/seed.json --validate
pnpm typecheck
pnpm build

# Against a dev server running at 127.0.0.1:4321:
node scripts/check-site.mjs
node scripts/check-site.mjs --cms-check
```

The CMS check creates a temporary member, verifies draft privacy, editing and publishing, then deletes only that temporary profile. On macOS, use `/usr/bin/python3` if your separately installed Python lacks system CA certificates.

Seed changes do not overwrite an existing database. Apply subsequent content changes through the admin UI or the EmDash CLI. Regenerate types with `pnpm exec emdash types` after changing schema.

## Design quality

Impeccable is installed project-locally for OpenCode in `.opencode/skills/impeccable/`. Restart OpenCode to discover `/impeccable`. The brand guide remains the visual authority; the detector records a specific exception for Inter, the required brand font, without disabling typography checks for other fonts.

```sh
pnpm design:check
pnpm design:check:site
# Check the rendered mobile layout with the dev server running:
.opencode/skills/impeccable/scripts/impeccable detect --viewport 390x844 http://127.0.0.1:4321/ http://127.0.0.1:4321/posts http://127.0.0.1:4321/exco http://127.0.0.1:4321/members http://127.0.0.1:4321/posts/roast-7
```

Source and browser scans complement visual inspection. A clean scan means no reportable detector findings, not a guarantee of design quality.

## Docker

```sh
docker compose up --build -d
```

Site: <http://localhost:8080/> · Admin/setup: <http://localhost:8080/_emdash/admin>

Complete the production setup wizard and enable bundled content to import the homepage, programmes, six summaries and Exco profiles. Development auth bypasses are disabled in the image. This is a separate CMS database from the Cloudflare dev server.

The multi-stage image builds the Node standalone server, runs as the non-root `node` user, and includes a health check. The `techies-data` volume persists `/data/techies.db`, `/data/uploads` and `/data/sessions` across restarts and image rebuilds. EmDash's Node scheduler runs scheduled publishing and maintenance without a separate cron container.

```sh
docker compose logs -f web
docker compose down                  # Keeps the persistent volume
docker compose up --build -d         # Rebuild without losing CMS data
CHECK_SITE_URL=http://localhost:8080 node scripts/check-site.mjs
```

Set `TECHIES_PORT` to change the published port, and set `EMDASH_SITE_URL` to the URL users will actually visit. For example:

```sh
TECHIES_PORT=8081 EMDASH_SITE_URL=http://localhost:8081 docker compose up -d
```

For a public site, put a TLS reverse proxy in front of the localhost-bound port and set `EMDASH_SITE_URL=https://your-domain.example`. Pass `EMDASH_ENCRYPTION_KEY` at runtime if using plugins that store encrypted secrets; generate it with `pnpm exec emdash secrets generate`. Environment files and existing CMS data are excluded from the Docker build context.

Back up the database, uploads and any configured encryption key together. `docker compose down -v` removes the CMS volume and its contents. To move an already-edited site between runtimes, use EmDash's site export/import tools rather than copying Cloudflare's local D1 files.

## Cloudflare deployment

```sh
pnpm wrangler login
pnpm deploy
```

Configure the production D1 database and R2 bucket in `wrangler.jsonc` and complete EmDash setup on that deployment. The local content database is not shipped by `pnpm build`; the seed is bundled for setup on a fresh installation. CMS images use Astro’s passthrough image service; switch to Cloudflare image optimisation after provisioning an `IMAGES` binding.
