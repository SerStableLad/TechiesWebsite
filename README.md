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
