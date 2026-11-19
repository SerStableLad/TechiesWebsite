import type { PortableTextBlock } from "emdash";

export interface RecapTitle {
	title: string;
	dateLabel?: string;
	city?: string;
}

export interface RecapSpeaker {
	name: string;
	href: string;
}

export interface RecapHeading {
	id: string;
	text: string;
}

type TextBlock = {
	style?: string;
	children?: { text?: string }[];
	markDefs?: { _type?: string; _key?: string; href?: unknown }[];
	listItem?: string;
};

const TITLE_PATTERN = /^(.*?)\s*·\s*([A-Za-z]+ \d{1,2}, \d{4})\s*·\s*(.+)$/;
const percentagePattern = /^(.+?)\s+(\d+(?:\.\d+)?)%$/;
const chartTitles = ["Organisation type", "Seniority", "Role type"];
const speakerLabel = /^Speaker\s*\d+$/i;
const importedKey = /^roast-\d+-\d+$/;
const numericLabel = /^\d{2}$/;

function asTextBlock(block?: PortableTextBlock): TextBlock | undefined {
	if (!block || block._type !== "block") return undefined;
	return {
		style: typeof block.style === "string" ? block.style : undefined,
		children: Array.isArray(block.children) ? block.children : undefined,
		markDefs: Array.isArray(block.markDefs) ? block.markDefs : undefined,
		listItem: typeof block.listItem === "string" ? block.listItem : undefined,
	};
}

export function recapTitle(title: string): RecapTitle {
	const match = title.match(TITLE_PATTERN);
	if (!match) return { title };
	return { title: match[1].trim(), dateLabel: match[2], city: match[3].trim() };
}

export function blockText(block: PortableTextBlock): string {
	return (asTextBlock(block)?.children ?? [])
		.map((child) => child.text ?? "")
		.join("")
		.trim();
}

export function recapSpeakers(content: PortableTextBlock[] = []): RecapSpeaker[] {
	const speakers = new Map<string, string>();
	for (const block of content) {
		const textBlock = asTextBlock(block);
		if (textBlock?.style !== "h2") continue;
		const href = textBlock.markDefs?.find(
			(mark) =>
				mark._type === "link" && typeof mark.href === "string" && mark.href.startsWith("/members#"),
		)?.href;
		if (typeof href !== "string") continue;
		const name = blockText(block);
		if (name) speakers.set(name, href);
	}
	return Array.from(speakers, ([name, href]) => ({ name, href }));
}

export function recapOutline(content: PortableTextBlock[] = []): RecapHeading[] {
	return content.flatMap((block) => {
		if (block._type === "credits") return [{ id: block._key, text: "Community credits" }];
		if (asTextBlock(block)?.style !== "h2") return [];
		const text = blockText(block);
		return text ? [{ id: block._key, text: recapHeadingLabel(text) }] : [];
	});
}

export function recapHeadingLabel(text: string) {
	return text === "Demographic breakdown"
		? "Who was in the room"
		: text === "Venue sponsor"
			? "Community credits"
			: text;
}

// Imported recaps put the photo and project before the speaker heading.
export function recapContent(content: PortableTextBlock[] = []): PortableTextBlock[] {
	const ordered: PortableTextBlock[] = [];
	for (const block of content) {
		if (
			asTextBlock(block)?.style === "h2" &&
			recapSpeakers([block]).length &&
			ordered.at(-2)?._type === "image" &&
			asTextBlock(ordered.at(-1)!)?.style === "normal"
		) {
			const [photo, project] = ordered.splice(-2);
			const heading = {
				...block,
				children: [
					...(asTextBlock(block)?.children ?? []),
					{ _type: "span", _key: `${block._key}-project`, text: ` · ${blockText(project)}` },
				],
			} as PortableTextBlock;
			ordered.push(heading, { ...photo, caption: photo.alt || photo.caption });
		} else {
			ordered.push(block);
		}
	}
	return recapCredits(recapCharts(ordered));
}

export interface AudienceChart {
	title: string;
	items: { label: string; value: number }[];
}

function demographicBounds(content: PortableTextBlock[]) {
	const heading = content.findIndex(
		(block) => asTextBlock(block)?.style === "h2" && blockText(block) === "Demographic breakdown",
	);
	if (heading < 0) return undefined;
	const previous = content[heading - 1];
	const start =
		asTextBlock(previous)?.style === "normal" && blockText(previous) === "Who was in the room"
			? heading - 1
			: heading;
	const nextH2 = content.findIndex(
		(block, index) => index > heading && asTextBlock(block)?.style === "h2",
	);
	return { heading, start, end: nextH2 < 0 ? content.length : nextH2 };
}

// Convert any recognised imported percentage groups; with no usable demographic data, omit the section.
export function recapCharts(content: PortableTextBlock[]): PortableTextBlock[] {
	const bounds = demographicBounds(content);
	const start = content.findIndex((block) => chartTitles.includes(blockText(block)));
	const removeSection = () =>
		bounds ? [...content.slice(0, bounds.start), ...content.slice(bounds.end)] : content;
	if (start < 0) return removeSection();
	const charts: AudienceChart[] = [];
	let end = start;
	for (; end < content.length; end++) {
		const block = content[end];
		if (asTextBlock(block)?.style !== "normal") break;
		const text = blockText(block);
		if (chartTitles.includes(text)) {
			charts.push({ title: text, items: [] });
			continue;
		}
		const match = text.match(percentagePattern);
		if (!match || !charts.length) break;
		const value = Number(match[2]);
		if (value < 0 || value > 100) return removeSection();
		charts.at(-1)!.items.push({ label: match[1], value });
	}
	if (
		!charts.length ||
		new Set(charts.map((chart) => chart.title)).size !== charts.length ||
		charts.some((chart) => !chart.items.some((item) => item.value > 0))
	)
		return removeSection();
	if (bounds) {
		return [
			...content.slice(0, bounds.start),
			content[bounds.heading],
			...content.slice(bounds.heading + 1, start),
			{ _type: "audienceCharts", _key: `${content[start]._key}-charts`, charts },
			...content.slice(end),
		];
	}
	return [
		...content.slice(0, start),
		{ _type: "audienceCharts", _key: `${content[start]._key}-charts`, charts },
		...content.slice(end),
	];
}

function linkHref(block: PortableTextBlock | undefined): string | undefined {
	if (!block) return undefined;
	const href = asTextBlock(block)?.markDefs?.find(
		(mark) => mark._type === "link" && typeof mark.href === "string",
	)?.href;
	return typeof href === "string" ? href : undefined;
}

function emojiOnly(block: PortableTextBlock | undefined): boolean {
	const textBlock = block ? asTextBlock(block) : undefined;
	if (!block || textBlock?.style !== "normal" || textBlock.listItem) return false;
	const text = blockText(block);
	return text.length > 0 && !/[A-Za-z0-9]/.test(text);
}

export function recapCredits(content: PortableTextBlock[] = []): PortableTextBlock[] {
	const start = content.findIndex(
		(block) => asTextBlock(block)?.style === "h2" && recapHeadingLabel(blockText(block)) === "Community credits",
	);
	if (start < 0) return content;

	const image = content[start + 1];
	const venueHeading = content[start + 2];
	const venueText = venueHeading ? blockText(venueHeading) : "";
	if (image?._type !== "image" || asTextBlock(venueHeading)?.style !== "h3" || !venueText)
		return content;

	const picBlock = content[start + 3];
	const picText = picBlock ? blockText(picBlock) : "";
	if (asTextBlock(picBlock)?.style !== "normal" || !/^PIC\s*:/i.test(picText)) return content;
	const coordinatorName = picText.replace(/^PIC\s*:\s*/i, "").trim() || undefined;
	const coordinatorHref = linkHref(picBlock);

	let i = start + 4;
	const intro = content[i];
	if (/^(event ops volunteers|special shoutouts)$/i.test(intro ? blockText(intro) : "")) i++;

	const people: { role: string; name: string; href?: string }[] = [];
	while (true) {
		const before = i;
		if (emojiOnly(content[i])) i++;
		const roleBlock = content[i];
		const role = roleBlock && asTextBlock(roleBlock)?.style === "h3" ? blockText(roleBlock) : "";
		if (!role) {
			i = before;
			break;
		}
		i++;
		const nameBlock = content[i];
		const name = nameBlock && asTextBlock(nameBlock)?.style === "normal" ? blockText(nameBlock) : "";
		if (!name) {
			i = before;
			break;
		}
		i++;
		let href: string | undefined;
		const linkBlock = content[i];
		if (asTextBlock(linkBlock)?.style === "normal" && /^LinkedIn$/i.test(blockText(linkBlock))) {
			href = linkHref(linkBlock);
			i++;
		}
		people.push({ role, name, href });
	}
	if (!people.length) return content;

	return [
		...content.slice(0, start),
		{
			_type: "credits",
			_key: `${content[start]._key}-credits`,
			venueName: venueText,
			venueImage: image,
			coordinatorName,
			coordinatorHref,
			people,
		},
		...content.slice(i),
	];
}

export function isDecorativeLabel(block: PortableTextBlock): boolean {
	const textBlock = asTextBlock(block);
	if (textBlock?.style !== "normal" || textBlock.listItem) return false;
	const text = blockText(block);
	return speakerLabel.test(text) || (importedKey.test(block._key) && numericLabel.test(text));
}
