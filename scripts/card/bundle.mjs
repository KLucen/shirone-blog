import { build } from "esbuild";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

await build({
	entryPoints: [
		fileURLToPath(new URL("./cabinet-preview.js", import.meta.url)),
	],
	outfile: fileURLToPath(
		new URL("../../src/assets/card/cabinet-preview.js", import.meta.url),
	),
	nodePaths: process.argv.slice(2).map((path) => resolve(path)),
	bundle: true,
	minify: true,
	format: "esm",
	target: "es2020",
	legalComments: "eof",
});
