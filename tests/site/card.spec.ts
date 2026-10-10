import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, type Frame, type Page, test } from "@playwright/test";

type HoloState = {
	auto: boolean;
	flipped: boolean;
	finish: string;
	zoom: number;
};
type HoloWindow = Window & {
	__holo: {
		ready: boolean;
		getState: () => HoloState;
		uniforms: Record<string, { value: number }>;
		root: { rotation: { x: number; y: number } };
	};
};

async function waitForShell(page: Page) {
	await page.waitForFunction(() =>
		document.documentElement.style
			.getPropertyValue("--mc-primary")
			.trim()
			.startsWith("#"),
	);
	await page.waitForFunction(() =>
		[...document.querySelectorAll<HTMLElement>(".onload-animation")].every(
			(element) =>
				element.offsetParent === null ||
				getComputedStyle(element).opacity === "1",
		),
	);
}

async function waitForViewer(page: Page): Promise<Frame> {
	await expect(page.locator("shirone-card-viewer")).toBeVisible();
	const iframe = page.locator("[data-card-frame]");
	await expect(iframe).toHaveAttribute("src", "/card/klee/index.html?embed=1");
	await expect(iframe).toHaveAttribute("title", /.+/);
	const handle = await iframe.elementHandle();
	const frame = await handle?.contentFrame();
	if (!frame) throw new Error("Card frame is unavailable");
	await frame.waitForFunction(
		() => (window as HoloWindow).__holo?.ready === true,
		null,
		{ polling: 100 },
	);
	await expect(iframe).toBeVisible();
	await expect(page.locator("[data-card-status]")).toBeHidden();
	await expect(page.locator("[data-card-error]")).toBeHidden();
	await expect(frame.locator("#stage canvas")).toBeVisible();
	return frame;
}

async function waitForCabinet(page: Page) {
	const cabinet = page.locator("shirone-card-cabinet");
	await expect(cabinet).toBeVisible();
	await expect(cabinet).toHaveAttribute("data-preview-state", "ready");
	await expect(cabinet.locator("[data-cabinet-canvas]")).toHaveCount(1);
	await expect(cabinet.locator("[data-cabinet-preview]")).toHaveCount(1);
	await waitForShell(page);
	return cabinet;
}

async function openCabinet(page: Page, theme = "light") {
	await page.addInitScript(
		(value) => localStorage.setItem("theme", value),
		theme,
	);
	await page.goto("/card/", { waitUntil: "domcontentloaded" });
	await waitForShell(page);
	return waitForCabinet(page);
}

async function holdPreview(page: Page) {
	let release!: () => void;
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route("**/card/klee/assets/preview.webp", async (route) => {
		await held;
		await new Promise((resolve) => setTimeout(resolve, 2000));
		await route.continue();
	});
	await page.addInitScript(() => localStorage.setItem("theme", "light"));
	await page.goto("/card/", { waitUntil: "domcontentloaded" });
	await waitForShell(page);
	const card = page.locator(".collection-card");
	await expect(card).toHaveAttribute("data-preview-state", "loading");
	return { card, release };
}

async function selectCard(page: Page) {
	await page.locator(".collection-card").click();
	await expect(page).toHaveURL(/\/card\/view\/klee\/$/);
	await waitForShell(page);
	return waitForViewer(page);
}

async function openCard(page: Page, theme = "light") {
	await openCabinet(page, theme);
	return selectCard(page);
}

async function assertTheme(page: Page, frame: Frame, dark: boolean) {
	await expect
		.poll(() =>
			page
				.locator("html")
				.evaluate((element) => element.classList.contains("dark")),
		)
		.toBe(dark);
	await expect(frame.locator("html")).toHaveAttribute(
		"data-theme",
		dark ? "dark" : "light",
	);
	const parentTokens = await page.evaluate(() => {
		const style = getComputedStyle(document.documentElement);
		return {
			paper: style.getPropertyValue("--card-bg").trim(),
			ink: style.getPropertyValue("--on-surface").trim(),
			accent: style.getPropertyValue("--primary").trim(),
			font: getComputedStyle(document.body).fontFamily,
		};
	});
	await expect
		.poll(() =>
			frame.evaluate(() => {
				const style = getComputedStyle(document.documentElement);
				return {
					paper: style.getPropertyValue("--paper").trim(),
					ink: style.getPropertyValue("--ink").trim(),
					accent: style.getPropertyValue("--accent").trim(),
					font: style.getPropertyValue("--font").trim(),
				};
			}),
		)
		.toEqual(parentTokens);
}

async function assertCanvasPixels(frame: Frame) {
	const pixels = await frame.evaluate(() => {
		const canvas = document.querySelector<HTMLCanvasElement>("#stage canvas");
		if (!canvas) throw new Error("Card canvas is unavailable");
		const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
		if (!gl) throw new Error("WebGL canvas is unavailable");
		const rgba = new Uint8Array(canvas.width * canvas.height * 4);
		gl.readPixels(
			0,
			0,
			canvas.width,
			canvas.height,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			rgba,
		);
		const colors = new Set<string>();
		let varied = 0;
		for (let y = 0; y < canvas.height; y += 8) {
			for (let x = 0; x < canvas.width; x += 8) {
				const offset = (y * canvas.width + x) * 4;
				const red = rgba[offset];
				const green = rgba[offset + 1];
				const blue = rgba[offset + 2];
				colors.add(`${red},${green},${blue}`);
				if (
					Math.abs(red - rgba[0]) +
						Math.abs(green - rgba[1]) +
						Math.abs(blue - rgba[2]) >
					40
				)
					varied += 1;
			}
		}
		return {
			width: canvas.width,
			height: canvas.height,
			colors: colors.size,
			varied,
		};
	});
	expect(pixels.width).toBeGreaterThan(200);
	expect(pixels.height).toBeGreaterThan(200);
	expect(pixels.colors).toBeGreaterThan(100);
	expect(pixels.varied).toBeGreaterThan(300);
}

async function saveScreenshot(page: Page, filename: string) {
	const directory = resolve(process.cwd(), "artifacts/card");
	await mkdir(directory, { recursive: true });
	await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
	await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
	await page.screenshot({ path: resolve(directory, filename), fullPage: true });
}

async function clickNav(page: Page, key: string) {
	const link = page.locator(`#navbar a[data-nav-key="${key}"]`);
	if (!(await link.isVisible())) {
		await link
			.locator("xpath=ancestor::*[@data-nav-group]")
			.locator(":scope > button")
			.click();
	}
	await link.click();
}

test.describe("Card collection", () => {
	test("the cabinet reserves six slots and opens the editor only after selection", async ({
		page,
	}) => {
		const viewerRequests: string[] = [];
		page.on("request", (request) => {
			if (/\/card\/klee\/(?:index\.html|app\.bundle\.js)/.test(request.url()))
				viewerRequests.push(request.url());
		});
		const cabinet = await openCabinet(page);
		await expect(cabinet.locator(".display-slot")).toHaveCount(6);
		await expect(
			cabinet.locator(".display-slot:has(.collection-card)"),
		).toHaveCount(1);
		await expect(
			cabinet.locator(".display-slot:not(:has(.collection-card))"),
		).toHaveCount(5);
		await expect(page.locator("iframe")).toHaveCount(0);
		expect(viewerRequests).toEqual([]);
		const card = cabinet.locator(".collection-card");
		await expect(card).toHaveAttribute("href", "/card/view/klee/");
		expect(await card.getAttribute("target")).not.toBe("_blank");
		await selectCard(page);
		expect(
			viewerRequests.some((request) => request.includes("app.bundle.js")),
		).toBe(true);
		const back = page.locator("[data-card-back]");
		await expect(back).toHaveAttribute("href", "/card/");
		await back.click();
		await expect(page).toHaveURL(/\/card\/$/);
		await waitForCabinet(page);
		await expect(page.locator("[data-card-frame]")).toHaveCount(0);
		await saveScreenshot(page, "cabinet-desktop.png");
	});

	test("hover rotates the preview slowly and leaving settles it back to the front", async ({
		page,
	}) => {
		const cabinet = await openCabinet(page);
		const card = cabinet.locator(".collection-card");
		await card.hover();
		await expect
			.poll(async () =>
				Math.abs(Number(await card.getAttribute("data-rotation"))),
			)
			.toBeGreaterThan(0.05);
		await expect(page.locator("[data-card-frame]")).toHaveCount(0);
		await page.mouse.move(0, 0);
		await expect
			.poll(async () =>
				Math.abs(Number(await card.getAttribute("data-rotation"))),
			)
			.toBeLessThan(0.005);
	});

	test("hover before the delayed preview loads starts rotation when ready", async ({
		page,
	}) => {
		const { card, release } = await holdPreview(page);
		await card.hover();
		await expect(card).toHaveAttribute("data-rotation", "0");
		release();
		await expect(card).toHaveAttribute("data-preview-state", "ready");
		await expect
			.poll(async () => Number(await card.getAttribute("data-rotation")))
			.toBeGreaterThan(0.05);
		const rotations = await card.evaluate(async (element) => {
			const values: number[] = [];
			for (let frame = 0; frame < 12; frame += 1) {
				await new Promise<void>((resolve) =>
					requestAnimationFrame(() => resolve()),
				);
				values.push(Number((element as HTMLElement).dataset.rotation));
			}
			return values;
		});
		expect(
			rotations.every((value, index) => index === 0 || value >= rotations[index - 1]),
		).toBe(true);
		expect(rotations.at(-1)! - rotations[0]).toBeGreaterThan(0);
		await expect(page.locator("[data-card-frame]")).toHaveCount(0);
	});

	test("leaving before the delayed preview loads keeps the ready card still", async ({
		page,
	}) => {
		const { card, release } = await holdPreview(page);
		await card.hover();
		await page.mouse.move(0, 0);
		release();
		await expect(card).toHaveAttribute("data-preview-state", "ready");
		const rotations = await card.evaluate(async (element) => {
			const values: number[] = [];
			for (let frame = 0; frame < 24; frame += 1) {
				await new Promise<void>((resolve) =>
					requestAnimationFrame(() => resolve()),
				);
				values.push(Number((element as HTMLElement).dataset.rotation));
			}
			return values;
		});
		expect(rotations.every((rotation) => rotation === 0)).toBe(true);
	});

	test("selecting a card preserves material, view, slider and export controls", async ({
		page,
	}) => {
		const frame = await openCard(page);
		await expect(page.locator("#swup-container")).toHaveAttribute(
			"data-current-page",
			"card",
		);
		await expect(
			page.getByRole("heading", { name: /闪卡|Cards/ }),
		).toBeVisible();
		await expect(
			page.locator('#navbar a[data-nav-key="card"]'),
		).toHaveAttribute("aria-current", "page");
		await assertTheme(page, frame, false);
		await frame.locator("#front").click();
		await expect(frame.locator("#auto")).toHaveAttribute(
			"aria-pressed",
			"false",
		);
		for (const finish of ["pearl", "silver", "gold", "original"]) {
			await frame.locator(`.swatch[data-finish="${finish}"]`).click();
			await expect(
				frame.locator(`.swatch[data-finish="${finish}"]`),
			).toHaveAttribute("aria-pressed", "true");
			expect(
				await frame.evaluate(
					() => (window as HoloWindow).__holo.getState().finish,
				),
			).toBe(finish);
		}
		await expect(frame.locator("#foil")).toBeDisabled();
		await frame.locator('.swatch[data-finish="gold"]').click();
		await frame.locator("#foil").evaluate((element) => {
			(element as HTMLInputElement).value = "0.8";
			element.dispatchEvent(new Event("input", { bubbles: true }));
		});
		await expect(frame.locator("#foil-value")).toHaveText("80%");
		await expect
			.poll(() =>
				frame.evaluate(
					() => (window as HoloWindow).__holo.uniforms.uFoil.value,
				),
			)
			.toBe(0.8);
		await frame.locator("#back").click();
		await expect(frame.locator("#back")).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		expect(
			await frame.evaluate(
				() => (window as HoloWindow).__holo.getState().flipped,
			),
		).toBe(true);
		await frame.locator("#front").click();
		await expect(frame.locator("#front")).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		await frame.locator("#auto").click();
		await expect(frame.locator("#auto")).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		await frame.locator("#reset").click();
		await expect(frame.locator("#auto")).toHaveAttribute(
			"aria-pressed",
			"false",
		);
		await assertCanvasPixels(frame);
		await page.locator("[data-card-frame]").evaluate((element) => {
			window.scrollBy({
				top: element.getBoundingClientRect().top - 100,
				behavior: "instant",
			});
		});
		const downloadPromise = page.waitForEvent("download");
		await frame.locator("#save").click();
		const download = await downloadPromise;
		expect(download.suggestedFilename()).toMatch(/-front\.png$/);
		const stream = await download.createReadStream();
		const chunks: Buffer[] = [];
		if (!stream) throw new Error("Export download is unavailable");
		for await (const chunk of stream) chunks.push(Buffer.from(chunk));
		const png = Buffer.concat(chunks);
		expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
		expect(png.readUInt32BE(16)).toBe(1400);
		expect(png.readUInt32BE(20)).toBe(1800);
		await expect(frame.locator("#notice")).toBeHidden();
		await saveScreenshot(page, "desktop.png");
	});

	test("persistent navigation restores the cabinet and a fresh viewer after leaving and returning", async ({
		page,
	}) => {
		await page.addInitScript(() => localStorage.setItem("theme", "light"));
		await page.goto("/about/", { waitUntil: "domcontentloaded" });
		await waitForShell(page);
		await page.waitForFunction(() => Boolean(window.swup?.navigate));
		await page
			.locator("#navbar")
			.evaluate((element) =>
				element.setAttribute("data-card-test-shell", "persistent"),
			);
		for (let visit = 0; visit < 2; visit += 1) {
			await clickNav(page, "card");
			await expect(page).toHaveURL(/\/card\/$/);
			await expect(page.locator("#swup-container")).toHaveAttribute(
				"data-current-page",
				"card",
			);
			await waitForCabinet(page);
			await expect(page.locator("[data-card-frame]")).toHaveCount(0);
			const frame = await selectCard(page);
			await assertTheme(page, frame, false);
			await expect(
				page.locator('#navbar a[data-nav-key="card"]'),
			).toHaveAttribute("aria-current", "page");
			await expect(page.locator("#navbar")).toHaveAttribute(
				"data-card-test-shell",
				"persistent",
			);
			await page.locator("[data-card-back]").click();
			await expect(page).toHaveURL(/\/card\/$/);
			await waitForCabinet(page);
			if (visit === 0) {
				await clickNav(page, "about");
				await expect(page).toHaveURL(/\/about\/$/);
				await expect(page.locator("#swup-container")).toHaveAttribute(
					"data-current-page",
					"about",
				);
				await expect(page.locator("[data-card-frame]")).toHaveCount(0);
			}
		}
	});

	test("dark theme initializes and switching back updates the embedded viewer", async ({
		page,
	}) => {
		const frame = await openCard(page, "dark");
		await assertTheme(page, frame, true);
		await frame.locator("#front").click();
		await assertCanvasPixels(frame);
		await saveScreenshot(page, "dark.png");
		await page.locator("#scheme-switch").click();
		await page.getByRole("button", { name: /^(亮色|Light)$/ }).click();
		await assertTheme(page, frame, false);
		await assertCanvasPixels(frame);
	});

	test("mobile layouts fit the cabinet and viewer while reduced motion stops rotation", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.emulateMedia({ reducedMotion: "reduce" });
		const cabinet = await openCabinet(page);
		await expect(cabinet.locator(".display-slot")).toHaveCount(6);
		await expect(page.locator("[data-card-frame]")).toHaveCount(0);
		await expect
			.poll(() =>
				page.evaluate(
					() => document.documentElement.scrollWidth <= window.innerWidth,
				),
			)
			.toBe(true);
		const card = cabinet.locator(".collection-card");
		await card.hover();
		const rotations = await card.evaluate(async (element) => {
			const values: number[] = [];
			for (let frame = 0; frame < 24; frame += 1) {
				await new Promise<void>((resolve) =>
					requestAnimationFrame(() => resolve()),
				);
				values.push(Number((element as HTMLElement).dataset.rotation));
			}
			return values;
		});
		expect(rotations.every((rotation) => rotation === 0)).toBe(true);
		await saveScreenshot(page, "cabinet-mobile.png");
		const frame = await selectCard(page);
		await expect(page.locator("#live2d-widget")).toBeHidden();
		await expect(page.locator("#floating-controls")).toBeHidden();
		await expect(frame.locator("#auto")).toHaveAttribute(
			"aria-pressed",
			"false",
		);
		await expect
			.poll(() =>
				frame.evaluate(
					() => (window as HoloWindow).__holo.uniforms.uTime.value,
				),
			)
			.toBe(0);
		await expect
			.poll(() =>
				page.evaluate(
					() => document.documentElement.scrollWidth <= window.innerWidth,
				),
			)
			.toBe(true);
		await expect
			.poll(() =>
				frame.evaluate(
					() => document.documentElement.scrollWidth <= window.innerWidth,
				),
			)
			.toBe(true);
		await expect
			.poll(() =>
				page.locator("[data-card-frame]").evaluate((element) => {
					const iframe = element as HTMLIFrameElement;
					if (!iframe.contentDocument) return false;
					return (
						iframe.clientHeight >=
						iframe.contentDocument.documentElement.scrollHeight
					);
				}),
			)
			.toBe(true);
		await assertTheme(page, frame, false);
		await frame.locator("#back").click();
		await expect
			.poll(() =>
				frame.evaluate(() => (window as HoloWindow).__holo.root.rotation.y),
			)
			.toBeCloseTo(Math.PI, 4);
		await frame.locator("#front").click();
		await expect
			.poll(() =>
				frame.evaluate(() => (window as HoloWindow).__holo.root.rotation.y),
			)
			.toBe(0);
		await assertCanvasPixels(frame);
		await saveScreenshot(page, "mobile.png");
	});
});
