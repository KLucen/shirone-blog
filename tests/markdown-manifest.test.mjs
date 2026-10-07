import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const prefix = "shirone-markdown-manifest-";

function write(root, path, contents = "fixture") {
	const absolute = join(root, path);
	mkdirSync(dirname(absolute), { recursive: true });
	writeFileSync(absolute, contents);
}

function withFixture(
	{ external = false, docs, implementation, mounts },
	verify,
) {
	const root = mkdtempSync(join(tmpdir(), prefix));
	try {
		mkdirSync(join(root, "scripts/content"), { recursive: true });
		for (const path of [
			"scripts/check-markdown-manifest.mjs",
			"scripts/content/resolve-source.mjs",
		]) {
			copyFileSync(join(projectRoot, path), join(root, path));
		}
		write(root, "package.json", '{"type":"module"}');
		write(root, "src/markdown-register.mjs");
		write(root, "src/remark-demo.mjs");
		write(root, "docs/demo.md");
		write(
			root,
			"src/plugins/markdown/manifest.json",
			JSON.stringify({
				schema: 1,
				stylesheetPacks: [],
				syntaxes: [
					{
						id: "demo",
						name: "Demo",
						status: "stable",
						category: "leaf-directive",
						source: "shirone",
						summary: "A fixture syntax",
						forms: [
							{ kind: "directive", pattern: "::demo", example: "::demo" },
						],
						attributes: [],
						registeredIn: "src/markdown-register.mjs",
						implementation: implementation ?? ["src/remark-demo.mjs"],
						styles: [],
						docs: docs ?? ["docs/demo.md"],
						tests: [],
						runtime: { mode: "none", modules: [], network: [] },
						notes: [],
					},
				],
			}),
		);
		if (external) {
			write(
				root,
				"shirone.content.json",
				JSON.stringify({
					schemaVersion: 1,
					source: { type: "path", path: "external-content" },
					...(mounts ? { mounts } : {}),
				}),
			);
		}
		const run = (args = []) => {
			const result = spawnSync(
				process.execPath,
				[join(root, "scripts/check-markdown-manifest.mjs"), ...args],
				{
					cwd: root,
					encoding: "utf8",
					env: {
						...process.env,
						CONTENT_DIR: "",
						CONTENT_REPO_URL: "",
						CONTENT_REPO_REF: "",
						SHIRONE_CONTENT_SYNC: "",
					},
				},
			);
			assert.ifError(result.error);
			return result;
		};
		verify(run, root);
	} finally {
		assert.equal(dirname(root), resolve(tmpdir()));
		assert.ok(basename(root).startsWith(prefix));
		rmSync(root, { recursive: true, force: true });
	}
}

describe("Markdown manifest content docs", () => {
	it("accepts existing docs in local mode", () => {
		withFixture({}, (run) => {
			assert.equal(run().status, 0);
		});
	});

	it("rejects missing content docs in local mode", () => {
		withFixture({ docs: ["src/content/posts/demo.md"] }, (run) => {
			const result = run();
			assert.equal(result.status, 1);
			assert.match(result.stderr, /demo\.docs 指向不存在的文件/);
		});
	});

	it("allows and reports missing content docs in external mode", () => {
		withFixture(
			{ external: true, docs: ["src/content/posts/demo.md"] },
			(run) => {
				const result = run();
				assert.equal(result.status, 0, result.stderr);
				assert.match(result.stdout, /external 内容源未提供 1 处演示文档引用/);
			},
		);
	});

	it("honors a custom content mount without allowing sibling paths", () => {
		withFixture(
			{
				external: true,
				mounts: { content: "src/demo-content" },
				docs: ["src/demo-content/posts/demo.md"],
			},
			(run) => {
				const result = run();
				assert.equal(result.status, 0, result.stderr);
			},
		);
	});

	for (const [label, options, error] of [
		[
			"implementation",
			{ implementation: ["src/content/remark-missing.mjs"] },
			/demo\.implementation 指向不存在的文件/,
		],
		[
			"theme docs",
			{ docs: ["docs/missing.md"] },
			/demo\.docs 指向不存在的文件/,
		],
		[
			"content sibling",
			{ docs: ["src/content-other/posts/missing.md"] },
			/demo\.docs 指向不存在的文件/,
		],
		[
			"custom mount sibling",
			{
				mounts: { content: "src/demo-content" },
				docs: ["src/demo-content-other/missing.md"],
			},
			/demo\.docs 指向不存在的文件/,
		],
		[
			"traversal",
			{ docs: ["src/content/../../missing.md"] },
			/必须是使用 \/ 的仓库内相对路径/,
		],
		[
			"absolute path",
			{ docs: ["C:/content/missing.md"] },
			/必须是使用 \/ 的仓库内相对路径/,
		],
		[
			"backslashes",
			{ docs: ["src\\content\\missing.md"] },
			/必须是使用 \/ 的仓库内相对路径/,
		],
	]) {
		it(`rejects missing or invalid ${label} in external mode`, () => {
			withFixture({ external: true, ...options }, (run) => {
				const result = run();
				assert.equal(result.status, 1);
				assert.match(result.stderr, error);
			});
		});
	}

	it("strict mode requires content docs even in external mode", () => {
		withFixture(
			{ external: true, docs: ["src/content/posts/demo.md"] },
			(run, root) => {
				const missing = run(["--strict-content-docs"]);
				assert.equal(missing.status, 1);
				assert.match(missing.stderr, /demo\.docs 指向不存在的文件/);
				write(root, "src/content/posts/demo.md", "# Real demonstration");
				const restored = run(["--strict-content-docs"]);
				assert.equal(restored.status, 0, restored.stderr);
				assert.doesNotMatch(restored.stdout, /未提供/);
			},
		);
	});
});
