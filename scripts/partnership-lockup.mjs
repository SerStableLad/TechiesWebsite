// node scripts/partnership-lockup.mjs --partner logo.png --out public/brand/partnership-x.png
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";

import { chromium } from "@playwright/test";

const MARK = new URL("../public/images/reference/techies.svg", import.meta.url);

const MIME = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".webp": "image/webp",
	".gif": "image/gif",
	".svg": "image/svg+xml",
};

const args = process.argv.slice(2);
function flag(name) {
	const index = args.indexOf(`--${name}`);
	return index === -1 ? undefined : args[index + 1];
}
const partnerPath = flag("partner");
const outPath = flag("out");
const partnerWidth = Number(flag("width") ?? 380);
if (!partnerPath || !outPath) {
	console.error(
		"Usage: node scripts/partnership-lockup.mjs --partner <logo.png|svg> --out <image.png> [--width 380]",
	);
	process.exit(1);
}

const partnerFile = resolve(partnerPath);
const partnerMime = MIME[extname(partnerFile).toLowerCase()];
assert.ok(partnerMime, `${partnerPath}: unsupported file type`);
const partnerBytes = await readFile(partnerFile).catch(() => {
	console.error(`Cannot read ${partnerPath}`);
	process.exit(1);
});
const partnerUrl = `data:${partnerMime};base64,${partnerBytes.toString("base64")}`;
const markUrl = `data:image/svg+xml;base64,${(await readFile(MARK)).toString("base64")}`;

const browser = await chromium.launch();
try {
	const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });

	// Trim transparent padding so partner marks with different internal margins still sit optically centered.
	const trimmed = await page.evaluate(async (src) => {
		const image = new Image();
		image.src = src;
		await image.decode();
		const canvas = document.createElement("canvas");
		canvas.width = image.naturalWidth;
		canvas.height = image.naturalHeight;
		const context = canvas.getContext("2d");
		context.drawImage(image, 0, 0);
		const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
		let [left, top, right, bottom] = [width, height, -1, -1];
		let transparent = 0;
		for (let y = 0; y < height; y += 1) {
			for (let x = 0; x < width; x += 1) {
				const alpha = data[(y * width + x) * 4 + 3];
				if (alpha < 250) transparent += 1;
				if (alpha < 8) continue;
				left = Math.min(left, x);
				top = Math.min(top, y);
				right = Math.max(right, x);
				bottom = Math.max(bottom, y);
			}
		}
		if (right < left) return { src, background: null };
		const cropped = document.createElement("canvas");
		cropped.width = right - left + 1;
		cropped.height = bottom - top + 1;
		cropped
			.getContext("2d")
			.drawImage(canvas, left, top, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height);
		return {
			src: cropped.toDataURL("image/png"),
			background: transparent ? null : data.slice(0, 3),
		};
	}, partnerUrl);
	if (
		trimmed.background &&
		Math.abs(trimmed.background[0] - 3) +
			Math.abs(trimmed.background[1] - 8) +
			Math.abs(trimmed.background[2] - 20) >
			18
	)
		console.warn(
			`warning: ${partnerPath} has no transparent margin — its own background will show as a box`,
		);

	await page.setContent(`<!doctype html>
<html>
<body style="margin:0;width:1200px;height:630px;background:#030814;display:flex;align-items:center;justify-content:center;gap:85px">
	<img src="${markUrl}" alt="" style="display:block;height:260px;width:auto">
	<div style="width:2px;height:220px;background:rgba(255,255,255,0.25)"></div>
	<img id="partner" src="${trimmed.src}" alt="" style="display:block;max-width:${partnerWidth}px;max-height:220px;width:auto;height:auto">
</body>
</html>`);
	await page.waitForFunction(() =>
		[...document.images].every((image) => image.complete && image.naturalWidth > 0),
	);

	// Render at 2x and downsample, so the edges stay clean at the 1200x630 delivery size.
	const shot = await page.screenshot({ type: "png" });
	await page.evaluate(() => {
		document.getElementById("partner").style.visibility = "hidden";
	});
	const withoutPartner = await page.screenshot({ type: "png" });

	const result = await page.evaluate(
		async ({ withUrl, withoutUrl }) => {
			// oxlint-disable-next-line unicorn/consistent-function-scoping -- runs inside the page
			const ink = async (src) => {
				const image = new Image();
				image.src = src;
				await image.decode();
				const canvas = document.createElement("canvas");
				canvas.width = 1200;
				canvas.height = 630;
				const context = canvas.getContext("2d");
				context.imageSmoothingQuality = "high";
				context.drawImage(image, 0, 0, 1200, 630);
				const { data } = context.getImageData(0, 0, 1200, 630);
				let count = 0;
				for (let index = 0; index < data.length; index += 4) {
					if (data[index] > 12 || data[index + 1] > 17 || data[index + 2] > 29) count += 1;
				}
				return { canvas, share: count / (1200 * 630) };
			};
			const full = await ink(withUrl);
			const markOnly = await ink(withoutUrl);
			return {
				png: full.canvas.toDataURL("image/png"),
				percent: full.share,
				partner: full.share - markOnly.share,
			};
		},
		{
			withUrl: `data:image/png;base64,${shot.toString("base64")}`,
			withoutUrl: `data:image/png;base64,${withoutPartner.toString("base64")}`,
		},
	);

	const output = Buffer.from(result.png.slice(result.png.indexOf(",") + 1), "base64");
	assert.equal(output.readUInt32BE(16), 1200, "Output width");
	assert.equal(output.readUInt32BE(20), 630, "Output height");
	assert.ok(
		result.partner > 0.003,
		`The partner mark is not visible (${(result.partner * 100).toFixed(2)}% of the canvas); pass a light-on-dark logo`,
	);
	await mkdir(dirname(resolve(outPath)), { recursive: true });
	await writeFile(outPath, output);
	console.log(`${outPath}: 1200x630, ${(result.percent * 100).toFixed(1)}% ink`);
} finally {
	await browser.close();
}
