# Campaigns

Extension of the existing Techies site. Public pages support reading prize/rules and entering a giveaway; the admin supports campaign setup and review.

Current extension: native media picker, rich-text editors, immediate date validation, required LinkedIn/question actions, participant confirmation, and equal-chance automatic deadline draws. Registered-but-unqualified and closed states must be explicit; the deadline is an eligibility cutoff even if cron executes later.

Authoring and operations share Content → Campaigns. The form groups Campaign details, Prize and access, and Entry actions. Publishing is a sticky right-hand column on desktop and follows the form on mobile. Post campaign details contains participant and winner tables with separate CSV exports. Question answers are collapsed below them; there are no engine status, campaign/announcement links, campaign management section or archive button. Public campaigns announce automatically and generate SEO tags; private / unlisted campaigns are accessible by URL, without public discovery, announcement or indexing. Native editor text retains Kumo light/dark contrast.

## Direction contract

Campaign slug sits below the title. The right-hand publishing column offers draft, immediate publication and a separate scheduled go-live date; it stacks after the form on mobile. Actions ask only for type, title and URL. Added actions use named details/summary disclosures; only one is expanded, new actions open immediately and saved actions start collapsed. Correct answers use the latest saved draft actions and remain private. All actions must be completed by the deadline, with one equal chance per qualified participant. LinkedIn completion is self-confirmed.

THESIS: Make campaign setup readable in three sections, with publication decisions always distinct from entry dates.

OWN-WORLD: Inherit Techies' near-black, orange and off-white, Inter typography, restrained borders, rounded controls and existing base layout. Admin controls inherit EmDash/Kumo.

STORY: Read the prize and rules, verify your email, enter, complete every action, and see qualification status. Unlisted campaigns expose details to anyone with their URL.

FIRST VIEWPORT: Admin details on the left, publishing on the right. Public prize and dates on the left, email entry on the right. Mobile uses a single column. Action rows show the task and completion status; no decorative numbers or gamified counters.

FORM: User-pinned Gleam-like action workflow inside the established Techies world; code-led local extension, no identity replacement.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
