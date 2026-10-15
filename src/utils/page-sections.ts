import type { Page, PageLayoutBlock } from "../../emdash-env";
import { pageFormat } from "./page-format.ts";

// Keep legacy pages readable until their section migration is reviewed and published.
export function homeSections(home: Partial<Page>): PageLayoutBlock[] {
  const block = <T extends PageLayoutBlock["_type"]>(type: T, key: string) => ({ _type: type, _version: 1 as const, _key: key });
  return [
    { ...block("page_hero", "hero"), heading: home.title || "A 3rd space for devs to geek out.", intro: home.intro,
      link_label: "See upcoming events", link_url: "#upcoming", secondary_label: "Get to know us", secondary_url: "#about",
      note: "Depth is the conversation. Not a credential at the door.", code_title: "community.ts",
      code: 'const techies = {\n  people: "curious builders",\n  bring: [\n    "your stack",\n    "your constraints",\n    "better questions"\n  ],\n  salesPitch: false,\n  supperAfter: true\n};' },
    { ...block("page_items", "about"), anchor: "about", heading: "Go deep.\nFeel at home.", intro: home.about_intro, layout: "rows", items: [
      { title: "Real conversations", description: "The working reality, not the polished pitch. Share what you tried, the awkward parts, and the decisions still keeping you up." },
      { title: "Deep technical", description: "Architecture, bottlenecks, costs, and trade-offs. We get beyond what a product does and into how—and why—it works." },
      { title: "High intensity", description: "Probing questions, engaged discussion, and cheeky energy. Challenge the decision. Be kind to the person who made it." },
    ] },
    { ...block("page_items", "audience"), anchor: "audience", heading: "Who’s in the room?", intro: "Different roles. Shared curiosity about how things are built. You don’t need a particular title to join the conversation.", layout: "columns", items: [
      { title: "Developers & technical leads", description: "Architecture, bottlenecks, production complexity, and engineering trade-offs." },
      { title: "Solo builders & founders", description: "Product and stack decisions under real constraints, including AI-assisted building." },
      { title: "Dev-adjacents", description: "Product managers, designers, and others whose work intersects with engineering." },
      { title: "Technically curious people", description: "Anyone willing to get into the details, whatever their title or experience." },
    ], link_label: "Meet the community", link_url: "/members" },
    { ...block("page_cta", "programmes"), anchor: "events", heading: "Find your conversation.", intro: "Explore Roast My TechStack, Prod is DOWN!!!, and product workshops like Starting Right. Each format gets into a different part of building.", link_label: "Explore our event series", link_url: "/events", surface: true },
    { ...block("page_posts", "summaries"), anchor: "summaries", heading: "From the room", category: "event-summaries", count: 3, link_label: "All posts & event summaries", link_url: "/posts" },
    { ...block("page_images", "supper"), heading: "Come for the event.\nStay for the company.", intro: home.supper_copy, layout: "collage", surface: true, link_label: "Meet the community", link_url: "/members", images: [
      ...(home.supper_photo ? [{ image: home.supper_photo }] : []),
      ...(home.supper_photo_two ? [{ image: home.supper_photo_two }] : []),
      { image: { id: "01M4W903A834QZ0AVM2HJVPXPC", src: "/_emdash/api/media/file/01M4W903A7WXGZMMD32ZPYWH46.01M4W903C135X14N6THYA9FY2K.jpg", alt: "Techies members chatting around tables at a post-event hangout", width: 1280, height: 960 } },
      { image: { id: "01M4W903A8MB40GRN0062VPDRQ", src: "/_emdash/api/media/file/01M4W903A8GWB4H3NP354Y1ASC.01M4W903C1CY8RC1335N2M1GVZ.jpeg", alt: "Techies members gathered along restaurant tables for supper after an event", width: 1280, height: 960 } },
    ] },
    { ...block("page_events", "upcoming"), anchor: "upcoming", heading: "What’s next?", intro: "The live calendar updates when a session is published.", link_label: "Open the Luma calendar", link_url: "https://luma.com/APACtechies", note: "Registration and any approval requirements are shown on each event’s Luma page." },
    { ...block("page_cta", "podcast"), anchor: "podcast", heading: "Do You Even Build", note: "On pause · Season 1 complete", intro: home.podcast_copy, link_label: "Listen to Season 1", link_url: home.podcast_url || "https://open.spotify.com/show/3JhNpERWFXWIjGcmXDvu3f", layout: "split" },
  ];
}

export function pageSections(page: Partial<Page>, isHome = false): PageLayoutBlock[] | undefined {
  if (pageFormat(page, isHome) === "rich_text") return undefined;
  if (page.page_format === "sections") return page.layout ?? [];
  // An explicitly empty layout is intentional, not a reason to resurrect old content.
  return page.use_sections || page.layout?.length ? page.layout ?? [] : isHome ? homeSections(page) : undefined;
}

export function repairPageImageReferences(layout: PageLayoutBlock[]): PageLayoutBlock[] {
  const mediaIds: Record<string, string> = {
    "01M4W903A7WXGZMMD32ZPYWH46": "01M4W903A834QZ0AVM2HJVPXPC",
    "01M4W903A8GWB4H3NP354Y1ASC": "01M4W903A8MB40GRN0062VPDRQ",
  };
  return layout.map(block => block._type === "page_images" ? {
    ...block,
    images: block.images?.map(item => mediaIds[item.image.id] ? { ...item, image: { ...item.image, id: mediaIds[item.image.id] } } : item),
  } : block);
}
