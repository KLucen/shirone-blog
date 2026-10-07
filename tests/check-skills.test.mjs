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
import { FOOTER_HTML_TARGET } from "../scripts/content/config-domains.mjs";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const prefix = "shirone-check-skills-";

function write(root, path, contents = "fixture") {
	const absolute = join(root, path);
	mkdirSync(dirname(absolute), { recursive: true });
	writeFileSync(absolute, contents);
}

function withFixture({ external = false, refs = [], mounts }, verify) {
	const root = mkdtempSync(join(tmpdir(), prefix));
	try {
		mkdirSync(join(root, "scripts/content"), { recursive: true });
		for (const path of [
			"scripts/check-skills.mjs",
			"scripts/content/resolve-source.mjs",
			"scripts/content/config-domains.mjs",
		]) {
			copyFileSync(join(projectRoot, path), join(root, path));
		}
		write(root, "package.json", '{"type":"module"}');
		write(root, "docs/guide.md", "# Fixture guide");
		write(
			root,
			".agents/skills/shirone-fixture/SKILL.md",
			[
				"---",
				"name: shirone-fixture",
				"description: Validate a fixture skill",
				"---",
				"Read `docs/guide.md`.",
				...refs.map((path) => `Reference: \`${path}\`.`),
			].join("\n"),
		);
		write(
			root,
			".agents/skills/README.md",
			"[shirone-fixture](shirone-fixture/SKILL.md)",
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
				[join(root, "scripts/check-skills.mjs"), ...args],
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

describe("skills content references", () => {
	it("accepts existing references in local mode", () => {
		withFixture({}, (run) => assert.equal(run().status, 0));
	});

	it("allows and reports content docs and optional footer in external mode", () => {
		withFixture(
			{
				external: true,
				refs: ["src/content/posts/demo.md", FOOTER_HTML_TARGET],
			},
			(run) => {
				const result = run();
				assert.equal(result.status, 0, result.stderr);
				assert.match(
					result.stdout,
					/external 内容源未提供 2 处演示文档或可选页脚引用/,
				);
			},
		);
	});

	it("rejects both missing dynamic references in local mode", () => {
		withFixture(
			{ refs: ["src/content/posts/demo.md", FOOTER_HTML_TARGET] },
			(run) => {
				const result = run();
				assert.equal(result.status, 1);
				assert.match(result.stderr, /src\/content\/posts\/demo\.md/);
				assert.ok(result.stderr.includes(FOOTER_HTML_TARGET));
			},
		);
	});

	it("allows docs below a custom content mount", () => {
		withFixture(
			{
				external: true,
				mounts: { content: "src/demo-content" },
				refs: ["src/demo-content/posts/demo.md"],
			},
			(run) => {
				const result = run();
				assert.equal(result.status, 0, result.stderr);
			},
		);
	});

	it("recognizes a custom mount at the repository root, including strict checks", () => {
		withFixture(
			{
				external: true,
				mounts: { content: "site-content" },
				refs: ["site-content/posts/demo.md"],
			},
			(run) => {
				const optional = run();
				assert.equal(optional.status, 0, optional.stderr);
				assert.match(optional.stdout, /未提供 1 处/);
				const strict = run(["--strict-content-docs"]);
				assert.equal(strict.status, 1);
				assert.match(strict.stderr, /引用了不存在的路径/);
			},
		);
	});

	for (const path of [
		"src/config/MissingConfig.ts",
		"docs/missing.md",
		"src/content-other/demo.md",
		`${FOOTER_HTML_TARGET}.backup`,
	]) {
		it(`still rejects missing theme reference ${path}`, () => {
			withFixture({ external: true, refs: [path] }, (run) => {
				const result = run();
				assert.equal(result.status, 1);
				assert.match(result.stderr, /引用了不存在的路径/);
			});
		});
	}

	for (const path of [
		"src/content/../../outside.md",
		"src\\content\\demo.md",
	]) {
		it(`rejects unsafe or invalid reference ${path} before exemptions`, () => {
			withFixture({ external: true, refs: [path] }, (run) => {
				const result = run();
				assert.equal(result.status, 1);
				assert.match(result.stderr, /引用路径必须使用 \/，且不能包含 \.\./);
			});
		});
	}

	it("strict mode requires optional references and passes after they are restored", () => {
		withFixture(
			{
				external: true,
				refs: ["src/content/posts/demo.md", FOOTER_HTML_TARGET],
			},
			(run, root) => {
				const missing = run(["--strict-content-docs"]);
				assert.equal(missing.status, 1);
				assert.match(missing.stderr, /引用了不存在的路径/);
				write(root, "src/content/posts/demo.md", "# Real demonstration");
				write(root, FOOTER_HTML_TARGET, "<footer>Fixture footer</footer>");
				const restored = run(["--strict-content-docs"]);
				assert.equal(restored.status, 0, restored.stderr);
				assert.doesNotMatch(restored.stdout, /未提供/);
			},
		);
	});
});
