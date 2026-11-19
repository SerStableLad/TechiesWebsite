# Partnership announcement template

Use this when Techies supports a conference, community or organisation. It covers the image, the fields and the four blocks the post is made of. The two live examples are SINCON 2026 (`community-partner-sincon-2026`) and AI Coding Summit Asia 2027 (`community-partner-ai-coding-summit-2027`).

## 1. Image

Dark canvas, our mark, a hairline rule, the partner's mark. 1200×630, ready for the featured image and the share card.

```sh
node scripts/partnership-lockup.mjs --partner ~/partner-logo.png --out public/brand/partnership-<slug>.png
```

- Pass a light-on-dark version of the partner's logo. A dark-ink or white-background file renders as a box on the navy canvas; ask the partner for the white/transparent variant.
- `--width` (default 380) sets the partner mark's maximum width. Wide wordmarks need more: SINCON used `--width 470`.
- Transparent padding is trimmed automatically, so marks with different internal margins still sit optically centered.
- The script prints the ink coverage and fails if the partner's mark is invisible or the size is wrong.

Alt text: `Techies and <Partner> partnership lockup`.

## 2. Fields

| Field | Value |
| --- | --- |
| Title | `Community Partner for <Event> <Year>` |
| Slug | `community-partner-<partner>-<year>` |
| Category | `Partnership Announcement` |
| Excerpt | One sentence, the same as the first paragraph's opening line |
| Featured image | The lockup from step 1 |

The category drives everything else: the post appears at `/category/partnership-announcement` and its back link reads "← Partnership Announcement". No other linking is needed.

## 3. Body

Four blocks. Nothing else.

**Block 1 — the facts.** Who runs it, what it is, dates, venue, format. Every claim checkable on the partner's own site.

> Techies is a community partner for SINCON 2026, the cybersecurity conference run by Infosec In the City. It lands at voco Orchard Singapore on 15–16 October 2026, during Singapore International Cyber Week: keynotes, technical talks, hands-on workshops and the Kampungs, where you actually get your hands on the thing you came to learn about.

**Block 2 — the belief.** Our own view of the craft, in first person, with concrete behaviour rather than adjectives.

> At Techies, we're strong believers that security is a craft you learn in the open. You break something on purpose, read what the logs actually say, and argue about the tradeoffs with people who have done the same. The people who get good at it aren't the ones who read the most advisories. They're the ones who put the work on the table and let the room push back.

**Block 3 — why here.** The Singapore line. Why supporting this grows engineering culture locally, and what comes back to the community.

> That's the culture we want to grow in Singapore, which is why we're proud to support SINCON. More of our builders in the room, learning from practitioners who do this daily, and bringing it back to the community here.

**Block 4 — one call to action.** An `h2` plus one line and one link.

With a confirmed discount:

> ### What the community gets
>
> The Techies community gets 10% off conference tickets. Use promo code TECHIES at checkout, or book through the link below.
>
> [Get AI Coding Summit 2027 tickets with 10% off](https://ti.to/gitnation/ai-coding-summit-asia-2027/discount/TECHIES)

Without one:

> ### Tickets
>
> Passes, the full schedule and the Kampungs are on the SINCON site.
>
> [See SINCON 2026 tickets and programme](https://www.infosec-city.com/sin-26)

## 4. Rules

- No comparisons to other countries, regions or events. Nothing about how other conferences are worse or more superficial.
- Align at the organisation and intent level. Describe what the partner is as an organisation and why that matches how we work — never claim a shared agenda with this specific event.
- One link. No "and while you're here, check out our next session". If it is not about this partner's event, it does not belong in the CTA.
- A promo code only when the partner has confirmed it. A discount URL returning `200` proves nothing — most ticketing platforms render the page for any code.
- UK spelling, matching the rest of the site: `organisers`, `programme`, `organisation`.
- Sentence case in the `h2`. No bold, no lists, no pull quotes.

## 5. Before you publish

1. Re-read dates, venue, organiser and any "first ever" claim on the partner's site.
2. `curl -o /dev/null -w '%{http_code}' <cta-url>` returns `200`.
3. Confirm the promo code with the partner, if the post has one.
4. Publish, not just save — a saved change sits in a draft revision and the public page keeps the old content.
5. Check the post, its `og:image`, and the card on `/category/partnership-announcement`.
6. If the post is part of the demo seed, mirror the content into `seed/seed.json`. Featured images stay database-only: the seed importer requires absolute media URLs.
