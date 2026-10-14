---
name: Techies
description: A 3rd space for devs to geek out.
colors:
  orange: "#f97316"
  orange-hover: "#ea580c"
  bg: "#0a0a0f"
  surface: "#111118"
  card: "#16161f"
  border: "#252530"
  text: "#e8e8ed"
  secondary: "#9898a8"
  control-border: "#686878"
  red: "#ef4444"
  prose-text: "#b8b8c6"
  campaign-error: "#ffb7a0"
typography:
  display:
    fontFamily: "Inter, sans-serif"
    fontSize: "clamp(40px, 5.4vw, 64px)"
    fontWeight: 800
    lineHeight: 1.12
    letterSpacing: "-0.03em"
  caption:
    fontFamily: "Inter, sans-serif"
    fontSize: "13px"
  section-support:
    fontFamily: "Inter, sans-serif"
    fontSize: "15px"
  hero-intro:
    fontFamily: "Inter, sans-serif"
    fontSize: "17px"
  local-title:
    fontFamily: "Inter, sans-serif"
    fontSize: "20px"
  event-title:
    fontFamily: "Inter, sans-serif"
    fontSize: "20px"
    lineHeight: 1.35
  post-title:
    fontFamily: "Inter, sans-serif"
    fontSize: "21px"
    lineHeight: 1.3
  campaign-prize:
    fontFamily: "Inter, sans-serif"
    fontSize: "21px"
  title:
    fontFamily: "Inter, sans-serif"
    fontSize: "23px"
    lineHeight: 1.12
    letterSpacing: "-0.025em"
  wordmark-mobile:
    fontFamily: "JetBrains Mono, monospace"
    fontSize: "24px"
    fontWeight: 600
    letterSpacing: "-0.03em"
  profile-title:
    fontFamily: "Inter, sans-serif"
    fontSize: "26px"
    fontWeight: 700
  campaign-section:
    fontFamily: "Inter, sans-serif"
    fontSize: "26px"
    fontWeight: 700
  prose-title:
    fontFamily: "Inter, sans-serif"
    fontSize: "24px"
  prose-headline:
    fontFamily: "Inter, sans-serif"
    fontSize: "32px"
    fontWeight: 700
  prose-display:
    fontFamily: "Inter, sans-serif"
    fontSize: "42px"
    fontWeight: 800
  profile-placeholder:
    fontFamily: "JetBrains Mono, monospace"
    fontSize: "44px"
  campaign-display:
    fontFamily: "Inter, sans-serif"
    fontSize: "clamp(36px, 4vw, 54px)"
    fontWeight: 800
    lineHeight: 1.12
    letterSpacing: "-0.03em"
  event-series-headline:
    fontFamily: "Inter, sans-serif"
    fontSize: "clamp(28px, 3vw, 36px)"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Inter, sans-serif"
    fontSize: "clamp(28px, 3.5vw, 40px)"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "-0.03em"
  body:
    fontFamily: "Inter, sans-serif"
    fontSize: "16px"
    lineHeight: 1.65
  reading:
    fontFamily: "Inter, sans-serif"
    fontSize: "18px"
    lineHeight: 1.7
  button:
    fontFamily: "Inter, sans-serif"
    fontSize: "14px"
    fontWeight: 600
  wordmark:
    fontFamily: "JetBrains Mono, monospace"
    fontSize: "25px"
    fontWeight: 600
    letterSpacing: "-0.03em"
rounded:
  code: "4px"
  control: "8px"
  panel: "12px"
  large: "20px"
spacing:
  compact: "12px"
  field: "16px"
  card: "24px"
  panel: "28px"
  group: "32px"
  wide: "64px"
components:
  button-primary:
    backgroundColor: "{colors.orange}"
    textColor: "{colors.bg}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "13px 20px"
  button-primary-hover:
    backgroundColor: "{colors.orange-hover}"
    textColor: "{colors.bg}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "13px 20px"
  campaign-input:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "12px"
    width: "100%"
  public-navigation:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.secondary}"
  campaign-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.panel}"
    padding: "28px"
  campaign-action:
    textColor: "{colors.text}"
    padding: "28px 0 32px"
---

# Design System: Techies

## Overview

**Creative North Star: "A technical room with human warmth"**

An extension of the established Techies visual world, not a redesign. Near-black surfaces, clear Inter typography, terminal-style JetBrains Mono details and restrained orange carry the public interface. `BRAND_GUIDE.md` remains the separate visual and voice authority; its proposed standards are not newly approved by this document.

Campaign administration belongs to EmDash/Kumo's native light/dark surfaces and controls. Public tokens below are not an admin theme. This is a source-grounded snapshot: rendered appearance, contrast in every state and stakeholder approval were not verified in this pass. The North Star is existing brand-guide language, not an invented approval.

**Key Characteristics:**
- Dark public surfaces with orange actions and off-white text.
- Inter for reading and controls; JetBrains Mono for the wordmark and code.
- Tonal layering, restrained borders and gently rounded controls.
- Native Kumo administration; explicit textual interaction and review states.

Evidence: `AGENTS.md:5–11`, `BRAND_GUIDE.md:165–241`, `PRODUCT.md:17–19`, `src/styles/theme.css:1–42`, `src/layouts/Base.astro:7,65–109`, `src/plugins/campaigns/admin.tsx:1–7`. Campaign direction remains in `.impeccable/surfaces/campaigns.md`, not a new global identity.

## Colors

### Primary
Orange is the public action, link and focus accent; orange hover is the filled-action hover. Filled actions retain near-black text.

### Neutral
Near-black is the page ground; surface and card charcoals separate sections and panels. Off-white carries primary text, secondary grey supporting text. Border grey is decorative; control-border supplies stronger interactive boundaries, not essential small text. Incident red is an event-specific exception, not another parent-brand accent.

**The Native Admin Rule.** Keep campaign admin on EmDash/Kumo semantic light/dark surfaces; do not apply the public dark/orange palette to the whole admin.

The observed prose-text colour serves paragraphs and list items in long-form reading (`src/styles/theme.css:93,95`). The local campaign-error colour serves textual alerts (`src/styles/campaigns.css:27`, `src/components/CampaignEntry.tsx:82`), not incident branding or ordinary body text. These source literals are recorded with their existing scope, not proposed as new palette options. The LinkedIn SVG inherits `currentColor`; it adds no blue or other brand accent (`src/components/LinkedInLogo.tsx:2–3`).

Evidence: `src/styles/theme.css:3–42`; `src/plugins/campaigns/admin.css:1–25` uses Kumo default, control, line, brand and danger variables. Admin token values are host-owned and have not been independently verified; no literal admin palette or invented tonal ramp is prescribed.

## Typography

Keep the required Inter and JetBrains Mono families. The frontmatter captures the global heading/body ramp and wordmark, not a replacement admin type scale. Headings are compact and balanced; mono is for short technical material, not long body copy. Reading text uses a narrow column. Campaign headings locally scale down to `clamp(36px, 4vw, 54px)`; the entry-panel title is (28px).

Evidence: `src/styles/theme.css:1,15–16,23,31–39,49,89–98`; `src/styles/campaigns.css:3–5,14`; native admin headings use (28px/600) and (21px/600), with inherited control fonts (`src/plugins/campaigns/admin.css:2–9`).

### Observed local roles

These frontmatter entries describe existing scoped usage, not an expanded menu of approved sizes. Omitted weights inherit or use browser heading defaults; no new weight is prescribed. Small caption text is recorded as evidence, not endorsed for essential labels.

| Observed size | Role and exact source |
| --- | --- |
| 13px | Prose figure captions; `src/styles/theme.css:101`. |
| 15px | Section-heading supporting paragraphs; `src/styles/theme.css:57`. |
| 17px | Homepage hero introduction, reduced to 16px at 700px; `src/pages/index.astro:100,134`. |
| 20px | Homepage pillar/audience titles; `src/pages/index.astro:111,116`. Upcoming-event titles use line height 1.35 and reduce to 18px at 600px; `src/components/UpcomingEvents.astro:53,59`. |
| 21px | Post-card titles with line height 1.3 (`src/styles/theme.css:69`); campaign prize text (`src/styles/campaigns.css:6`). Native admin h2 is separately 21px/600 (`src/plugins/campaigns/admin.css:3`), not a public heading style. |
| 23px | Global h3 and campaign action titles; `src/styles/theme.css:34`, `src/styles/campaigns.css:38`. |
| 24px | Prose h3 and mobile mono wordmark, distinct roles; `src/styles/theme.css:92,126`. |
| 26px | Profile h2 and campaign overview h2; `src/styles/theme.css:77`, `src/styles/campaigns.css:5`. |
| 32px | Prose h2; `src/styles/theme.css:91`. |
| 36px | Campaign h1 minimum and event-series h2 maximum, only as clamp endpoints; `src/styles/campaigns.css:3`, `src/pages/events.astro:76`. |
| 42px | Prose h1; `src/styles/theme.css:90`. |
| 44px | Mono profile placeholder, not body/display copy; `src/styles/theme.css:75`. |
| 54px | Campaign h1 maximum, only as a clamp endpoint; `src/styles/campaigns.css:3`. |

Schema scope: typography entries carry actual font sizes/clamps; provenance and responsive overrides live in prose and matching sidecar metadata. There is no frontmatter property for source evidence, approval status or media-query variants. Endpoint values are not separate fixed-size tokens.

## Layout

Public containers cap at (1180px), with (32px) side gutters, reduced to (20px) at (640px). Sections use (88px) vertical space, then (60px) on mobile. Card grids step from three to two columns at (900px), then one at (640px). Reading columns cap at (620px).

Campaigns use a (1.45:1) overview/entry grid with a (64px) gap, stacking at (800px) with a (32px) gap. Preserve source order: overview before entry. This is a campaign-specific composition, not a universal page template. Admin content caps at (1100px); two-column field grids stack at (640px).

Campaign admin paragraphs cap at (75ch); public action-section introductory paragraphs and direct action-row paragraphs cap at (60ch). These are scoped reading limits following the reported rendered long-line finding, not new global typography tokens. Specialized admin field grids align items to the start, preserving compact neighbouring labels (`src/plugins/campaigns/admin.css:5,14`; `src/styles/campaigns.css:42`).

Authoring and operations share one direct Content → Campaigns link, using the stock Media Library picker and Portable Text editors. The specialized date/action fields retain start-aligned grids; the former custom upload preview geometry is no longer prescribed. Private settings, review and draw views render in the central editor column on desktop and mobile, through the saved campaign's managed-reference widget. The settings sidebar contains only native publishing/metadata controls. Private settings use a button-driven fieldset rather than nesting a form inside the native editor form (`src/plugins/campaigns/admin.tsx`, `seed/campaigns.schema.json`, `.impeccable/surfaces/campaigns.md`).

Evidence: `src/styles/theme.css:37,55,62,89,116–135`; `src/styles/campaigns.css:1–2,34–50`; `src/components/CampaignEntry.tsx:66–103`; `src/plugins/campaigns/admin.css:1,5,14,34`.

## Elevation & Depth

The sampled public system uses tonal layering and thin borders rather than box shadows. Buttons and post-card borders transition over (.18s). Public reduced-motion preferences disable animations/transitions and smooth scrolling. Do not infer a shadow vocabulary for native Kumo components from the public stylesheet.

Evidence: `src/styles/theme.css:39–42,63–65,137–140`; `src/styles/campaigns.css:13,36`.

## Shapes

Use the observed radius roles: small inline code, rounded controls, standard panels and larger empty-state/hero containers. Panels use thin decorative borders; entry fields and entry panels use stronger control borders. Campaign imagery is optional, contained rather than cropped, with standard panel rounding; no new campaign raster assets were shipped. The screenshot preview raster was generated strictly for tests and removed from Media Library, per the supplied extension record; it is not campaign imagery or an asset family.

Evidence: `src/styles/theme.css:39,63,84,97–104`; `src/styles/campaigns.css:7,13,18`; `src/components/CampaignEntry.tsx:73`; raster scope supplied by the documentation brief. Preserve existing logos, supplied event artwork and natural-colour photography under `BRAND_GUIDE.md:173–241,275–283`.

## Components

- **Buttons:** filled orange primary; transparent secondary with a stronger neutral boundary. Minimum public action height (48px). Secondary hover adds card charcoal; focus uses an orange (3px) outline offset (5px). Campaign disabled controls fade to (.65) and use a not-allowed cursor.
- **Fields:** visible labels, dark fields, control borders and rounded corners. Textareas resize vertically. Campaign errors/status messages are textual alerts/statuses, not colour-only signals. Campaign inputs and textareas explicitly share an orange (3px) focus-visible outline offset (5px), as declared in `src/styles/campaigns.css:20`.
- **Navigation:** terminal-style live-text home link with orange underscore, wrapping text links and an outlined join link. Current-page and hover links brighten to off-white; keep the skip link and navigation label.
- **Panels and action rows:** entry panel is surface charcoal, padded and bordered; action rows are separated by top borders, with task, requirement or bonus weight and explicit review status. Registered entries and qualification are distinct; pending proof is not represented as a completed requirement or awarded bonus.
- **Admin:** use actual Kumo `Button`/`Input`; custom selects/textareas inherit Kumo semantic surfaces. Selected view buttons use `aria-pressed` and a Kumo-brand outline; field focus uses a (2px) outline offset (3px). Preserve text errors, notices and labels.

Evidence: `src/styles/theme.css:27,39–54,123–128`; `src/layouts/Base.astro:66–91`; `src/styles/campaigns.css:13–50`; `src/components/CampaignEntry.tsx:80–112`; `src/plugins/campaigns/admin.css:9–23`; `src/plugins/campaigns/admin.tsx:69–97`.

### Scoped campaign extension

- **Native authoring:** stock image and Portable Text fields replace the deleted custom HTML editor and upload setup form. Keep native editor/media interactions and Kumo light/dark surfaces; do not carry forward the custom toolbar, (180px) editor minimum or (240px) preview cap as system rules. Portable Text becomes public HTML; existing public wrapping, orange underlined links, lists and blockquotes remain. Evidence: `seed/campaigns.schema.json:15–17`, `src/plugins/campaigns/native.ts:30–56`, `src/styles/campaigns.css:43–48`.
- **Editor contrast:** only `html[data-theme="classic"]:has(.campaign-native-window) .tiptap` and its listed text descendants receive Kumo semantic foreground. This scoped correction prevents public prose colours washing out the native light editor; it is not a global editor/admin recolour. Preserve native dark-theme treatment. Evidence: `src/plugins/campaigns/admin.css:28–30`.
- **Entry dates:** specialized JSON widget uses a labelled fieldset and second-resolution native date/time controls. It states browser timezone and closing-after-opening, with immediate close-field `aria-invalid`, `aria-describedby`, inline alert and custom validity when both dates exist. Dates disable after the first entrant or draw, with explicit locked guidance. Do not inherit the removed setup form's Save-button disabling implementation. Evidence: `src/plugins/campaigns/fields.tsx:9–38`, `src/plugins/campaigns/native.ts:80–85`, `src/plugins/campaigns/admin.css:25–26`.
- **Entry actions:** specialized JSON widget renders labelled bordered action fieldsets, Kumo controls and existing semantic select/textarea styling. Add defaults to required LinkedIn follow; changing type prefills title/instructions, sets required/no-bonus for LinkedIn or one bonus point otherwise. LinkedIn rows hide bonus input and explain approval before closing. Correct answers are configured privately after saving, not in published action JSON. Add disables at twenty actions; all actions lock after the first entrant/draw with text guidance. Preserve the decorative (24px), aria-hidden/non-focusable `currentColor` SVG and (10px) trailing space. Evidence: `src/plugins/campaigns/fields.tsx:40–65`, `src/plugins/campaigns/native.ts:16–28`, `src/plugins/campaigns/admin.css:19–20,33`, `src/components/LinkedInLogo.tsx:1–5`.
- **Create announcement:** retain this literal checkbox label and explanatory text. Opting in creates one managed linked Announcement; activation publishes it with matching campaign dates and a campaign CTA. Private campaigns use generic wording rather than revealing prize/title. The controls panel links to the managed announcement; unpublishing/archiving withdraws it. Evidence: `seed/campaigns.schema.json:22`, `src/plugins/campaigns/fields.tsx:67–71`, `src/plugins/campaigns/admin.tsx:34`, `src/plugins/campaigns/native.ts:134–148,201–223`.
- **Saved Campaign controls:** central managed-reference widget applies to saved campaign entries and nests private settings, entries/review and draw views. New campaigns show save-first guidance. A five-second refresh follows native saved-draft revisions while preserving unsaved private settings. Action fields appear only after adding, inside named native details/summary rows; new actions open immediately and saved actions start collapsed. Private drafts stay non-public: save, configure invitations, then activate the saved version. Keep loading, error and Retry campaign controls states, plus refresh/locked guidance and busy activation disabling. Evidence: `src/plugins/campaigns/admin.tsx`, `src/plugins/campaigns/fields.tsx`, `src/plugins/campaigns/native.ts`, `src/plugins/campaigns/admin.css`.
- **Operational identity and deadline:** selected campaign title wraps and access/status remain explicit above Private settings / Entries and review / Winner draw views. Invitations/answers remain private operational storage; settings disable while busy, closed or drawn. Review buttons disable while busy, closed or not published. Draw view shows schedule, saved result, unfilled prizes, errors and a deadline/status-gated retry. The first cron tick at/after closing does not move eligibility cutoff; public registered/unqualified/closed guidance remains explicit. Evidence: `src/plugins/campaigns/admin.tsx:68–97`, `src/plugins/campaigns/admin.css:31`, `src/components/CampaignEntry.tsx:38,81–94,110–111`, `.impeccable/surfaces/campaigns.md:5–7`.

These are scoped source/component states, not new global tokens or stakeholder approval. The supplied reviewer record marks contrast, identity and retry fixes resolved; current source contains the corresponding scoped foreground, selected-title/access/status and retry paths. This pass did not rerun browser/model/backend checks or claim broad production verification. No new shipping rasters exist; all test captures are development-only, per the supplied record. Sidecar snippets are static field/state excerpts, not implementations of stock Portable Text/media pickers, Kumo React controls, activation or draw scheduling. Host Kumo variables remain required; native editor geometry is deliberately not synthesized.

## Do's and Don'ts

### Do:
- Do preserve the public near-black/orange/off-white world and required Inter/JetBrains Mono fonts.
- Do use near-black text on orange-filled actions and visible focus/control boundaries.
- Do retain native EmDash/Kumo light/dark surfaces and semantic controls in campaign admin.
- Do preserve supplied marks, established event artwork and natural-colour photography.
- Do show meaningful statuses in text and respect reduced-motion preferences.

### Don't:
- Don't treat legacy indigo or teal as parent-brand interface accents.
- Don't introduce decorative numbered sections, tiny labels, fake status indicators or hard offset shadows.
- Don't document development screenshots as campaign imagery or imply unverified design approval.
- Don't turn the campaign-specific layout into a mandatory template for every public page.

Evidence: `AGENTS.md:9–11`, `BRAND_GUIDE.md:209–241`, `.impeccable/surfaces/campaigns.md:9–15`, and the source references above. Pre-existing template prose in `AGENTS.md:55–106` describes an unstyled starting point and is superseded by its custom-design guidance and current code; it was not repaired in this documentation-only pass.
