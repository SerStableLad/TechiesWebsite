import type { Page, PageLayoutBlock } from "../../emdash-env";
import { pageFormat } from "./page-format.ts";

const createBlock = <T extends PageLayoutBlock["_type"]>(type: T, key: string) => ({
	_type: type,
	_version: 1 as const,
	_key: key,
});

// Keep legacy pages readable until their section migration is reviewed and published.
export function homeSections(home: Partial<Page>): PageLayoutBlock[] {
	return [
		{
			...createBlock("page_hero", "hero"),
			heading: home.title || "A 3rd space for devs to geek out.",
			intro: home.intro,
			link_label: "See upcoming events",
			link_url: "#upcoming",
			secondary_label: "Get to know us",
			secondary_url: "#about",
			note: "Depth is the conversation. Not a credential at the door.",
			code_title: "community.ts",
			code: 'const techies = {\n  audience: [\n    "devs",\n    "technical founders",\n    "developer curious"\n  ]\n};',
		},
		{
			...createBlock("page_cta", "programmes"),
			anchor: "events",
			heading: "Find your conversation.",
			intro:
				"Different formats. The same curiosity about how things work, why decisions were made, and what could be better.",
			link_label: "Explore our event series",
			link_url: "/events",
			surface: true,
		},
		{
			...createBlock("page_items", "about"),
			anchor: "about",
			heading: "There’s more than\none way to geek out.",
			intro:
				"Developers, solo builders, product people and the technically curious. You don’t need a particular title to join the conversation.",
			layout: "columns",
			items: [
				{
					title: "Show the work.\nTalk through the choices.",
					description: "The working reality, including the parts you’re still figuring out.",
				},
				{
					title: "Get into the how.\nAlways ask why.",
					description: "Architecture, constraints, and the decisions behind the demo.",
				},
				{
					title: "Challenge the decision.",
					description: "Curious questions. Technical debate. Be kind to the person.",
				},
				{
					title: "Keep the conversation going.",
					description: "Pull up a chair. Supper is part of the culture.",
				},
			],
		},
		{
			...createBlock("page_images", "supper"),
			heading: "Come for the event.\nStay for the company.",
			intro: "The agenda ends.\nThe conversation doesn’t.",
			layout: "collage",
			surface: true,
			link_label: "Meet the community",
			link_url: "/members",
			images: [
				...(home.supper_photo ? [{ image: home.supper_photo }] : []),
				...(home.supper_photo_two ? [{ image: home.supper_photo_two }] : []),
				{
					image: {
						id: "01M4W903A834QZ0AVM2HJVPXPC",
						src: "/_emdash/api/media/file/01M4W903A7WXGZMMD32ZPYWH46.01M4W903C135X14N6THYA9FY2K.jpg",
						alt: "Techies members chatting around tables at a post-event hangout",
						width: 1280,
						height: 960,
					},
				},
				{
					image: {
						id: "01M4W903A8MB40GRN0062VPDRQ",
						src: "/_emdash/api/media/file/01M4W903A8GWB4H3NP354Y1ASC.01M4W903C1CY8RC1335N2M1GVZ.jpeg",
						alt: "Techies members gathered along restaurant tables for supper after an event",
						width: 1280,
						height: 960,
					},
				},
			],
		},
		{
			...createBlock("page_posts", "summaries"),
			anchor: "summaries",
			heading: "From the room",
			category: "event-summaries",
			count: 3,
			link_label: "All articles",
			link_url: "/category/event-summaries",
		},
		{
			...createBlock("page_items", "audience"),
			anchor: "audience",
			heading: "Who should attend Techies?",
			intro:
				"Different roles. Shared curiosity about how things are built. You don’t need a particular title to join the conversation.",
			layout: "columns",
			items: [
				{
					title: "Developers & technical leads",
					description:
						"Compare architecture choices, unpack production problems, and test your thinking with people who build and run software.",
				},
				{
					title: "Solo builders & founders",
					description:
						"Bring the project you’re working on. Talk through product and stack decisions, constraints, and the parts you’re still figuring out.",
				},
				{
					title: "Dev-adjacents",
					description:
						"For product managers, designers, and others who work with engineers and want to understand the decisions behind the build.",
				},
				{
					title: "Technically curious people",
					description:
						"You don’t need a technical job title. Bring your questions and a willingness to get into how things work.",
				},
			],
			link_label: "Meet the community",
			link_url: "/members",
		},
		{
			...createBlock("page_cta", "podcast"),
			anchor: "podcast",
			heading: "Do You Even Build",
			note: "Season 1 complete",
			intro: home.podcast_copy,
			link_label: "Listen to Season 1",
			link_url: home.podcast_url || "https://open.spotify.com/show/3JhNpERWFXWIjGcmXDvu3f",
			layout: "split",
		},
		{
			...createBlock("page_cta", "closing"),
			anchor: "closing",
			heading: "Join us at the next event!",
			intro: "Find the next Techies session on Luma.",
			link_label: "Explore upcoming events",
			link_url: "https://luma.com/APACtechies",
		},
	];
}

export function pageSections(page: Partial<Page>, isHome = false): PageLayoutBlock[] | undefined {
	if (pageFormat(page, isHome) === "rich_text") return undefined;
	if (page.page_format === "sections") return page.layout ?? [];
	// An explicitly empty layout is intentional, not a reason to resurrect old content.
	return page.use_sections || page.layout?.length
		? (page.layout ?? [])
		: isHome
			? homeSections(page)
			: undefined;
}

export function repairPageImageReferences(layout: PageLayoutBlock[]): PageLayoutBlock[] {
	const mediaIds: Record<string, string> = {
		"01M4W903A7WXGZMMD32ZPYWH46": "01M4W903A834QZ0AVM2HJVPXPC",
		"01M4W903A8GWB4H3NP354Y1ASC": "01M4W903A8MB40GRN0062VPDRQ",
	};
	return layout.map((block) =>
		block._type === "page_images"
			? {
					...block,
					images: block.images?.map((item) =>
						mediaIds[item.image.id]
							? { ...item, image: { ...item.image, id: mediaIds[item.image.id] } }
							: item,
					),
				}
			: block,
	);
}
