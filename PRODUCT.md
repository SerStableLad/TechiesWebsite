# Techies

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users and purpose

Techies is a community site for developers, dev-adjacents and technically curious people. Organisers manage its content in EmDash. Visitors discover events, read recaps and enter community giveaways.

## Campaign requirements

Own the campaign system inside EmDash; do not use Gleam. Every entry action is required and each qualified participant gets one equal chance. Support questions, LinkedIn follows and LinkedIn likes. LinkedIn actions use participant confirmation, not evidence collection or automatic platform verification. Participants verify their email before entering.

Action creation asks only for type, title and URL; a question URL is optional. Prize images use the native media picker; descriptions and rules use rich-text editors. End dates must be after start dates, validated immediately. Winner draws are automatic at closing and require every action completed by the deadline; cron timing may delay execution without moving the cutoff. Existing saved draws remain immutable.

## Campaign authoring workflow

Campaign authoring lives under Content → Campaigns, grouped into Campaign details (title, slug, dates, description, rules), Prize and access (image, name, winners, access), and Entry actions. Publishing occupies a right-hand column and stacks below the form on mobile: save as draft, publish immediately, or schedule a separate go-live date. Public campaigns automatically create a linked announcement and SEO/social-sharing tags. Private / unlisted campaigns are readable by URL by anyone with the link, with no invited-email restriction, public listing, announcement or search indexing. The operational engine keeps correct answers, participants, sessions and draws private. Post campaign details shows one participants table with winners marked in the Result column, a winner count and draw date, and separate CSV exports; participant exports include every page and winners come from the saved draw. Question answers are collapsed below the table. Engine status, campaign/announcement links, campaign management and the archive button are absent from this section.

## Existing authority

Post campaign details belongs in the central editor column on desktop and mobile, not the publishing sidebar. Tables scroll within their own regions on small screens. Action fields appear only after Add action, nested in collapsible rows; new actions open immediately and saved actions start collapsed.

`BRAND_GUIDE.md` governs the public site's identity and voice. Preserve the existing Techies site and its Inter/JetBrains Mono fonts. Campaign management belongs in the existing EmDash admin.
