import * as THREE from "three";

const TAU = Math.PI * 2;
const CARD_WIDTH = 1.2;
const CARD_HEIGHT = 1.8;
const CARD_DEPTH = 0.035;

function durationOf(style, name, fallback) {
	const value = style.getPropertyValue(name).trim();
	const numeric = Number.parseFloat(value);
	if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
	return value.endsWith("ms") ? numeric : numeric * 1000;
}

function frontAngle(angle) {
	return ((((angle + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
}

function roundedPath(context, x, y, width, height, radius) {
	context.beginPath();
	context.roundRect(x, y, width, height, radius);
}

function fitTitle(context, title, width, fontFamily) {
	let size = 58;
	while (size > 14) {
		context.font = `600 ${size}px ${fontFamily}`;
		if (context.measureText(title).width <= width) break;
		size -= 2;
	}
	if (context.measureText(title).width <= width) return [title];
	const lines = [];
	let line = "";
	for (const character of title) {
		if (line && context.measureText(line + character).width > width) {
			lines.push(line);
			line = character;
		} else {
			line += character;
		}
	}
	if (line) lines.push(line);
	return lines;
}

function drawBack(context, palette, title, fontFamily) {
	const { width, height } = context.canvas;
	context.clearRect(0, 0, width, height);
	context.fillStyle = palette.surface;
	context.fillRect(0, 0, width, height);
	context.lineWidth = 2;
	context.strokeStyle = palette.outline;
	roundedPath(context, 28, 28, width - 56, height - 56, 20);
	context.stroke();
	roundedPath(context, 42, 42, width - 84, height - 84, 12);
	context.stroke();

	context.strokeStyle = palette.accent;
	context.lineWidth = 3;
	const centerX = width / 2;
	const centerY = height * 0.43;
	for (const radius of [128, 174, 216]) {
		context.beginPath();
		context.arc(centerX, centerY, radius, 0, TAU);
		context.stroke();
	}
	context.save();
	context.translate(centerX, centerY);
	context.rotate(Math.PI / 4);
	context.globalAlpha = 0.13;
	context.fillStyle = palette.accent;
	context.fillRect(-108, -108, 216, 216);
	context.globalAlpha = 1;
	context.strokeRect(-108, -108, 216, 216);
	context.restore();
	for (let index = 0; index < 16; index += 1) {
		const angle = (index * TAU) / 16;
		context.beginPath();
		context.moveTo(
			centerX + Math.cos(angle) * 226,
			centerY + Math.sin(angle) * 226,
		);
		context.lineTo(
			centerX + Math.cos(angle) * 239,
			centerY + Math.sin(angle) * 239,
		);
		context.stroke();
	}

	context.textAlign = "center";
	context.textBaseline = "middle";
	context.fillStyle = palette.muted;
	context.font = `500 23px ${fontFamily}`;
	context.fillText(palette.collection, centerX, 106);
	context.fillStyle = palette.ink;
	const lines = fitTitle(context, title, width - 144, fontFamily);
	const lineHeight =
		Number.parseFloat(context.font.match(/([\d.]+)px/)?.[1] || "14") * 1.4;
	const titleY = height * 0.75 - ((lines.length - 1) * lineHeight) / 2;
	lines.forEach((line, index) =>
		context.fillText(line, centerX, titleY + index * lineHeight),
	);
	context.strokeStyle = palette.outline;
	context.lineWidth = 2;
	context.beginPath();
	context.moveTo(112, height - 146);
	context.lineTo(width - 112, height - 146);
	context.stroke();
	context.fillStyle = palette.muted;
	context.font = `500 22px ${fontFamily}`;
	context.fillText(palette.kind, centerX, height - 102);
}

export function mountCabinet(host) {
	const canvas = host.querySelector("[data-cabinet-canvas]");
	const links = [...host.querySelectorAll(".collection-card")];
	const abort = new AbortController();
	const geometries = new Set();
	const materials = new Set();
	const textures = new Set();
	const cards = [];
	const reducedMedia = matchMedia("(prefers-reduced-motion: reduce)");
	const hoverMedia = matchMedia("(hover: hover) and (pointer: fine)");
	let disposed = false;
	let failed = false;
	let frameId = 0;
	let hostVisible = true;
	let themeDirty = true;
	let paletteSignature = "";
	let rotationDuration = 18000;
	let returnDuration = 600;
	let renderer;
	let resizeObserver;
	let intersectionObserver;
	let themeObserver;

	const listen = (target, event, handler, options = {}) => {
		target.addEventListener(event, handler, {
			...options,
			signal: abort.signal,
		});
	};
	const motionReduced = () =>
		reducedMedia.matches ||
		document.documentElement.classList.contains("motion-reduced");
	const setRotation = (card, angle) => {
		card.angle = angle;
		card.group.rotation.y = angle;
		card.link.dataset.rotation =
			angle === 0 ? "0" : ((angle * 180) / Math.PI).toFixed(3);
	};
	const stopAtFront = () => {
		for (const card of cards) {
			card.phase = "idle";
			setRotation(card, 0);
		}
	};
	const showFallback = () => {
		failed = true;
		host.dataset.previewState = "fallback";
		for (const link of links) link.dataset.previewState = "fallback";
		if (frameId) cancelAnimationFrame(frameId);
		frameId = 0;
		stopAtFront();
	};
	const cleanup = () => {
		if (disposed) return;
		disposed = true;
		abort.abort();
		if (frameId) cancelAnimationFrame(frameId);
		frameId = 0;
		resizeObserver?.disconnect();
		intersectionObserver?.disconnect();
		themeObserver?.disconnect();
		for (const texture of textures) texture.dispose();
		for (const material of materials) material.dispose();
		for (const geometry of geometries) geometry.dispose();
		for (const card of cards) card.scene.clear();
		renderer?.renderLists.dispose();
		renderer?.dispose();
		renderer?.forceContextLoss();
		host.dataset.previewState = "fallback";
		for (const link of links) {
			link.dataset.rotation = "0";
			link.dataset.previewState = "fallback";
		}
	};

	if (!(canvas instanceof HTMLCanvasElement) || links.length === 0) {
		showFallback();
		return cleanup;
	}

	try {
		renderer = new THREE.WebGLRenderer({
			canvas,
			alpha: true,
			antialias: true,
			powerPreference: "low-power",
			preserveDrawingBuffer: true,
		});
		renderer.outputColorSpace = THREE.SRGBColorSpace;
		renderer.setClearColor(0x000000, 0);
		renderer.autoClear = false;
	} catch {
		showFallback();
		return cleanup;
	}

	const colorCanvas = document.createElement("canvas");
	colorCanvas.width = 1;
	colorCanvas.height = 1;
	const colorContext = colorCanvas.getContext("2d", {
		willReadFrequently: true,
	});
	const cssColor = (value, fallback) => {
		if (!colorContext) return fallback;
		colorContext.clearRect(0, 0, 1, 1);
		colorContext.fillStyle = fallback;
		colorContext.fillStyle = value || fallback;
		colorContext.fillRect(0, 0, 1, 1);
		const [red, green, blue] = colorContext.getImageData(0, 0, 1, 1).data;
		return `rgb(${red}, ${green}, ${blue})`;
	};
	const readPalette = () => {
		const style = getComputedStyle(host);
		rotationDuration = durationOf(
			style,
			"--m3e-duration-ambient-extra-long",
			18000,
		);
		returnDuration = Math.min(
			900,
			Math.max(250, durationOf(style, "--m3e-duration-long", 600)),
		);
		return {
			surface: cssColor(
				style.getPropertyValue("--surface-container-highest").trim(),
				"#e5e7e5",
			),
			ink: cssColor(style.getPropertyValue("--on-surface").trim(), "#252625"),
			muted: cssColor(
				style.getPropertyValue("--on-surface-variant").trim(),
				"#606360",
			),
			accent: cssColor(style.getPropertyValue("--primary").trim(), "#536e62"),
			outline: cssColor(
				style.getPropertyValue("--outline-variant").trim(),
				"#bfc5c0",
			),
			font: getComputedStyle(host).fontFamily || "sans-serif",
			collection: host.dataset.collection || "",
			kind: host.dataset.kind || "",
		};
	};

	const requestFrame = () => {
		if (!disposed && !failed && !frameId && !document.hidden && hostVisible) {
			frameId = requestAnimationFrame(render);
		}
	};
	const refreshPreferences = () => {
		if (motionReduced() || !hoverMedia.matches) stopAtFront();
		requestFrame();
	};
	const returnToFront = (card) => {
		if (card.phase === "idle") return;
		if (motionReduced() || !hoverMedia.matches) {
			card.phase = "idle";
			setRotation(card, 0);
		} else {
			const angle = frontAngle(card.angle);
			if (Math.abs(angle) < 0.0001) {
				card.phase = "idle";
				setRotation(card, 0);
			} else {
				setRotation(card, angle);
				card.phase = "return";
				card.returnAngle = angle;
				card.returnStart = performance.now();
			}
		}
		requestFrame();
	};

	const loader = new THREE.TextureLoader();
	loader.setCrossOrigin("anonymous");
	for (const link of links) {
		const area = link.querySelector("[data-cabinet-preview]");
		const image = area?.querySelector("img");
		const source = area?.dataset.poster || image?.currentSrc || image?.src;
		link.dataset.rotation = "0";
		link.dataset.previewState = "loading";
		if (!area || !source) {
			link.dataset.previewState = "fallback";
			continue;
		}

		const scene = new THREE.Scene();
		const camera = new THREE.OrthographicCamera(-0.8, 0.8, 1.2, -1.2, 0.1, 10);
		camera.position.z = 4;
		const group = new THREE.Group();
		const edgeGeometry = new THREE.BoxGeometry(
			CARD_WIDTH + 0.014,
			CARD_HEIGHT + 0.014,
			CARD_DEPTH,
		);
		const faceGeometry = new THREE.PlaneGeometry(CARD_WIDTH, CARD_HEIGHT);
		geometries.add(edgeGeometry);
		geometries.add(faceGeometry);
		const edgeMaterial = new THREE.MeshBasicMaterial({ color: 0xbfc5c0 });
		const frontMaterial = new THREE.MeshBasicMaterial({
			transparent: true,
			toneMapped: false,
		});
		const backCanvas = document.createElement("canvas");
		backCanvas.width = 768;
		backCanvas.height = 1152;
		const backContext = backCanvas.getContext("2d");
		if (!backContext) {
			edgeMaterial.dispose();
			frontMaterial.dispose();
			link.dataset.previewState = "fallback";
			continue;
		}
		const backTexture = new THREE.CanvasTexture(backCanvas);
		backTexture.colorSpace = THREE.SRGBColorSpace;
		const backMaterial = new THREE.MeshBasicMaterial({
			map: backTexture,
			toneMapped: false,
		});
		materials.add(edgeMaterial);
		materials.add(frontMaterial);
		materials.add(backMaterial);
		textures.add(backTexture);

		group.add(new THREE.Mesh(edgeGeometry, edgeMaterial));
		const front = new THREE.Mesh(faceGeometry, frontMaterial);
		front.position.z = CARD_DEPTH / 2 + 0.001;
		group.add(front);
		const back = new THREE.Mesh(faceGeometry, backMaterial);
		back.rotation.y = Math.PI;
		back.position.z = -CARD_DEPTH / 2 - 0.001;
		group.add(back);
		scene.add(group);
		const card = {
			link,
			area,
			scene,
			camera,
			group,
			edgeMaterial,
			frontMaterial,
			backTexture,
			backContext,
			title: link.dataset.title || area.dataset.title || image?.alt || "",
			ready: false,
			hovering: false,
			phase: "idle",
			angle: 0,
			lastTime: 0,
			returnStart: 0,
			returnAngle: 0,
		};
		cards.push(card);

		listen(link, "pointerenter", (event) => {
			if (
				motionReduced() ||
				!hoverMedia.matches ||
				event.pointerType === "touch"
			)
				return;
			card.hovering = true;
			if (!card.ready) return;
			card.phase = "rotate";
			card.lastTime = performance.now();
			requestFrame();
		});
		const stopHover = () => {
			card.hovering = false;
			returnToFront(card);
		};
		listen(link, "pointerleave", stopHover);
		listen(link, "pointercancel", stopHover);
		listen(link, "blur", () => returnToFront(card));
		const acceptTexture = (texture) => {
			if (disposed || failed) {
				texture.dispose();
				return;
			}
			texture.colorSpace = THREE.SRGBColorSpace;
			texture.anisotropy = Math.min(
				4,
				renderer.capabilities.getMaxAnisotropy(),
			);
			textures.add(texture);
			frontMaterial.map = texture;
			frontMaterial.needsUpdate = true;
			card.ready = true;
			if (card.hovering && !motionReduced() && hoverMedia.matches) {
				card.phase = "rotate";
				card.lastTime = performance.now();
			}
			requestFrame();
		};
		const rejectTexture = () => {
			if (!disposed) link.dataset.previewState = "fallback";
		};
		if (area.dataset.poster) {
			textures.add(
				loader.load(source, acceptTexture, undefined, rejectTexture),
			);
		} else {
			// Future cards can use layered artwork without a separate poster.
			const sources = JSON.parse(area.dataset.layers || "[]");
			Promise.all(
				sources.map(
					(src) =>
						new Promise((resolve, reject) => {
							const layer = new Image();
							layer.onload = () => resolve(layer);
							layer.onerror = reject;
							layer.src = src;
						}),
				),
			)
				.then((layers) => {
					if (disposed || failed) return;
					const composite = document.createElement("canvas");
					composite.width = 640;
					composite.height = 960;
					const context = composite.getContext("2d");
					if (!context || !layers.length)
						throw new Error("Card artwork unavailable");
					for (const layer of layers)
						context.drawImage(layer, 0, 0, composite.width, composite.height);
					acceptTexture(new THREE.CanvasTexture(composite));
				})
				.catch(rejectTexture);
		}
	}

	function render(now) {
		frameId = 0;
		if (disposed || failed || document.hidden || !hostVisible) return;
		try {
			if (themeDirty) {
				themeDirty = false;
				const palette = readPalette();
				const signature = JSON.stringify(palette);
				if (signature !== paletteSignature) {
					paletteSignature = signature;
					for (const card of cards) {
						drawBack(card.backContext, palette, card.title, palette.font);
						card.backTexture.needsUpdate = true;
						card.edgeMaterial.color.set(palette.outline);
					}
				}
				if (motionReduced() || !hoverMedia.matches) stopAtFront();
			}

			const hostRect = canvas.getBoundingClientRect();
			const width = Math.max(1, hostRect.width);
			const height = Math.max(1, hostRect.height);
			const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
			if (renderer.getPixelRatio() !== pixelRatio)
				renderer.setPixelRatio(pixelRatio);
			const size = renderer.getSize(new THREE.Vector2());
			if (size.x !== width || size.y !== height)
				renderer.setSize(width, height, false);
			renderer.setScissorTest(false);
			renderer.setViewport(0, 0, width, height);
			renderer.clear(true, true, true);
			renderer.setScissorTest(true);
			let hasRenderedCard = false;
			let animating = false;

			for (const card of cards) {
				if (card.phase === "rotate") {
					const elapsed = Math.max(0, Math.min(100, now - card.lastTime));
					card.lastTime = now;
					setRotation(
						card,
						(card.angle + (elapsed * TAU) / rotationDuration) % TAU,
					);
				} else if (card.phase === "return") {
					const progress = Math.min(
						1,
						Math.max(0, (now - card.returnStart) / returnDuration),
					);
					setRotation(card, card.returnAngle * Math.pow(1 - progress, 3));
					if (progress === 1) {
						card.phase = "idle";
						setRotation(card, 0);
					}
				}
				animating ||= card.phase !== "idle";
				if (!card.ready) continue;
				const rect = card.area.getBoundingClientRect();
				const left = rect.left - hostRect.left;
				const top = rect.top - hostRect.top;
				if (
					rect.width <= 0 ||
					rect.height <= 0 ||
					left >= width ||
					top >= height ||
					left + rect.width <= 0 ||
					top + rect.height <= 0
				)
					continue;
				const viewportBottom = height - top - rect.height;
				const scissorLeft = Math.max(0, left);
				const scissorBottom = Math.max(0, viewportBottom);
				const scissorWidth = Math.min(width, left + rect.width) - scissorLeft;
				const scissorHeight =
					Math.min(height, viewportBottom + rect.height) - scissorBottom;
				if (scissorWidth <= 0 || scissorHeight <= 0) continue;
				const halfHeight = Math.max(1, 2 / 3 / (rect.width / rect.height));
				const halfWidth = (halfHeight * rect.width) / rect.height;
				card.camera.left = -halfWidth;
				card.camera.right = halfWidth;
				card.camera.top = halfHeight;
				card.camera.bottom = -halfHeight;
				card.camera.updateProjectionMatrix();
				renderer.setViewport(left, viewportBottom, rect.width, rect.height);
				renderer.setScissor(
					scissorLeft,
					scissorBottom,
					scissorWidth,
					scissorHeight,
				);
				renderer.render(card.scene, card.camera);
				card.link.dataset.previewState = "ready";
				hasRenderedCard = true;
			}
			if (hasRenderedCard) host.dataset.previewState = "ready";
			if (animating) requestFrame();
		} catch {
			showFallback();
		}
	}

	listen(canvas, "webglcontextlost", (event) => {
		event.preventDefault();
		showFallback();
	});
	listen(window, "resize", requestFrame, { passive: true });
	listen(window, "scroll", requestFrame, { capture: true, passive: true });
	listen(document, "visibilitychange", () => {
		if (document.hidden) {
			if (frameId) cancelAnimationFrame(frameId);
			frameId = 0;
		} else {
			for (const card of cards) card.lastTime = performance.now();
			requestFrame();
		}
	});
	listen(reducedMedia, "change", refreshPreferences);
	listen(hoverMedia, "change", refreshPreferences);
	resizeObserver = new ResizeObserver(requestFrame);
	resizeObserver.observe(host);
	for (const card of cards) resizeObserver.observe(card.area);
	intersectionObserver = new IntersectionObserver(([entry]) => {
		hostVisible = entry.isIntersecting;
		if (!hostVisible) {
			if (frameId) cancelAnimationFrame(frameId);
			frameId = 0;
		} else {
			for (const card of cards) card.lastTime = performance.now();
			requestFrame();
		}
	});
	intersectionObserver.observe(host);
	themeObserver = new MutationObserver(() => {
		themeDirty = true;
		refreshPreferences();
	});
	themeObserver.observe(document.documentElement, {
		attributes: true,
		attributeFilter: ["class", "style"],
	});
	document.fonts.ready.then(() => {
		themeDirty = true;
		requestFrame();
	});
	requestFrame();
	return cleanup;
}
