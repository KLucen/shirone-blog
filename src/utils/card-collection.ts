import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { url } from "./url-utils";

export interface CollectionCard {
	id: string;
	title: string;
	subtitle: string;
	edition: string;
	poster?: string;
	layers: string[];
	viewerUrl: string;
	href: string;
}

export function loadCardCollection(): CollectionCard[] {
	// These are materialized user assets, in both source and npm package mode.
	const directory = resolve(process.cwd(), "public/card");
	if (!existsSync(directory)) return [];
	return readdirSync(directory, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && /^[a-z0-9_-]+$/i.test(entry.name))
		.sort((a, b) => a.name.localeCompare(b.name))
		.flatMap((entry) => {
			const root = resolve(directory, entry.name);
			const file = resolve(root, "card-config.json");
			if (!existsSync(file) || !existsSync(resolve(root, "index.html")))
				return [];
			const config = JSON.parse(readFileSync(file, "utf8"));
			if (typeof config.title !== "string" || !config.title.trim()) {
				throw new Error(
					`[card] ${entry.name}/card-config.json requires a title`,
				);
			}
			const assetUrl = (value: unknown): string | undefined => {
				if (typeof value !== "string") return undefined;
				const relative = value.replace(/^\.\//, "");
				if (relative.startsWith("/") || relative.split(/[\\/]/).includes(".."))
					return undefined;
				if (!existsSync(resolve(root, relative))) return undefined;
				return url(`/card/${entry.name}/${relative}`);
			};
			return [
				{
					id: entry.name,
					title: config.title,
					subtitle: typeof config.subtitle === "string" ? config.subtitle : "",
					edition: typeof config.edition === "string" ? config.edition : "",
					poster: assetUrl(config.poster),
					layers: ["background", "subject", "effects", "text"]
						.map((name) => assetUrl(config.assets?.[name]))
						.filter((value): value is string => Boolean(value)),
					viewerUrl: url(`/card/${entry.name}/index.html`),
					href: url(`/card/view/${entry.name}/`),
				},
			];
		});
}
