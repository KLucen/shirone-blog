// 校验 .agents/skills/ 下 AI 技能包的结构与引用完整性。
// 用法：node scripts/check-skills.mjs [--strict-content-docs]
// 通过 = 每个技能目录含 SKILL.md，frontmatter 合法（name 与目录一致、kebab-case、
//        shirone- 前缀、description 非空），正文引用的主题路径真实存在。
//        external 模式下内容演示文档与可选页脚生成物可缺省，严格参数可恢复全量检查。
// 失败 = 打印问题清单并 exit 1。

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FOOTER_HTML_TARGET } from "./content/config-domains.mjs";
import { resolveContentSource } from "./content/resolve-source.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const skillsDir = join(root, ".agents", "skills");
const args = new Set(process.argv.slice(2));
const unknownArgs = [...args].filter((arg) => arg !== "--strict-content-docs");
if (unknownArgs.length > 0) {
	console.error(`不支持的参数：${unknownArgs.join(", ")}`);
	process.exit(1);
}

let contentSource;
try {
	contentSource = resolveContentSource(root);
} catch (error) {
	console.error(`无法解析内容源：${error.message}`);
	process.exit(1);
}
const allowMissingContentReferences =
	contentSource.mode === "external" && !args.has("--strict-content-docs");
const contentDocRoots = new Set([
	"src/content",
	...(contentSource.mode === "external" && contentSource.mounts.content
		? [contentSource.mounts.content]
		: []),
]);
let missingContentReferences = 0;

function fail(msg) {
	console.error(`✗ ${msg}`);
	process.exitCode = 1;
}

function parseFrontmatter(content) {
	const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(content);
	if (!match) return null;
	const fields = {};
	for (const line of match[1].split(/\r?\n/)) {
		const idx = line.indexOf(":");
		if (idx > 0) fields[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
	}
	return fields;
}

// 正文反引号 token 中，以仓库顶层目录开头的才视为路径引用并校验存在性；
// 别名导入（@/...）、站点路由（/...）、枚举值列表等一律跳过。
const REPO_ROOT_SEGMENTS = new Set([
	"src",
	"docs",
	"rules",
	"tests",
	"scripts",
	"public",
	".github",
	".agents",
]);
for (const directory of contentDocRoots) {
	REPO_ROOT_SEGMENTS.add(directory.split("/")[0]);
}

function extractRepoPaths(body) {
	const paths = new Set();
	for (const token of body.match(/`([^`\n]+)`/g) ?? []) {
		const value = token.slice(1, -1).replace(/\/+$/, "");
		if (!/[\\/]/.test(value)) continue;
		if (/[\s<>{}*"'~]/.test(value)) continue;
		if (/^(@|\/|~|https?:\/\/)/.test(value)) continue;
		if (!REPO_ROOT_SEGMENTS.has(value.split(/[\\/]/)[0])) continue;
		paths.add(value);
	}
	return paths;
}

if (!existsSync(skillsDir) || !statSync(skillsDir).isDirectory()) {
	fail("技能目录不存在：.agents/skills/");
	process.exit(process.exitCode ?? 0);
}

const entries = readdirSync(skillsDir, { withFileTypes: true }).filter((e) =>
	e.isDirectory(),
);
let skillCount = 0;
let pathCount = 0;
const discoveredNames = new Set();

if (entries.length === 0) {
	fail("未发现任何技能目录");
}

for (const entry of entries) {
	const skillPath = join(skillsDir, entry.name, "SKILL.md");
	if (!existsSync(skillPath)) {
		fail(`${entry.name}/SKILL.md 缺失`);
		continue;
	}
	skillCount += 1;

	const content = readFileSync(skillPath, "utf8");
	const fields = parseFrontmatter(content);
	if (!fields) {
		fail(`${entry.name}/SKILL.md 缺少合法的 YAML frontmatter`);
		continue;
	}

	const name = fields.name ?? "";
	const description = fields.description ?? "";
	if (discoveredNames.has(name)) {
		fail(`重复的 skill name：${name}`);
	}
	discoveredNames.add(name);

	if (name !== entry.name) {
		fail(`${entry.name}/SKILL.md：name "${name}" 与目录名不一致`);
	}
	if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
		fail(`${entry.name}/SKILL.md：name "${name}" 不是 kebab-case`);
	} else if (!name.startsWith("shirone-")) {
		fail(`${entry.name}/SKILL.md：name "${name}" 缺少 shirone- 前缀`);
	}
	if (!description) {
		fail(`${entry.name}/SKILL.md：description 为空`);
	} else if (description.length > 1024) {
		fail(`${entry.name}/SKILL.md：description 超过 1024 字符`);
	}

	// 先检查路径边界，再判断内容引用是否可缺省；主题源码与正式文档始终严格。
	for (const rel of extractRepoPaths(content)) {
		pathCount += 1;
		if (rel.includes("\\") || rel.split("/").includes("..")) {
			fail(`${entry.name}/SKILL.md 引用路径必须使用 /，且不能包含 ..：${rel}`);
			continue;
		}
		if (!existsSync(join(root, ...rel.split("/")))) {
			if (
				allowMissingContentReferences &&
				(rel === FOOTER_HTML_TARGET ||
					[...contentDocRoots].some((directory) =>
						rel.startsWith(`${directory}/`),
					))
			) {
				missingContentReferences += 1;
				continue;
			}
			fail(`${entry.name}/SKILL.md 引用了不存在的路径：${rel}`);
		}
	}
}

// README 是技能目录的公开索引；校验其中的 skill 链接与磁盘目录保持一致。
const readmePath = join(skillsDir, "README.md");
if (existsSync(readmePath)) {
	const readme = readFileSync(readmePath, "utf8");
	const listedNames = new Set();
	for (const match of readme.matchAll(
		/\[(shirone-[a-z0-9-]+)\]\((shirone-[a-z0-9-]+)\/SKILL\.md\)/g,
	)) {
		if (match[1] !== match[2]) {
			fail(`README.md 技能名称与路径不一致：${match[1]} -> ${match[2]}`);
		}
		listedNames.add(match[1]);
	}
	for (const name of discoveredNames) {
		if (!listedNames.has(name)) fail(`README.md 未列出技能：${name}`);
	}
	for (const name of listedNames) {
		if (!discoveredNames.has(name))
			fail(`README.md 列出了不存在的技能：${name}`);
	}
}

console.log(`skills 总数: ${skillCount}，校验路径引用: ${pathCount}`);
if (process.exitCode) {
	console.error("\n✗ skills 校验未通过");
	process.exit(1);
} else {
	if (missingContentReferences > 0) {
		console.log(
			`external 内容源未提供 ${missingContentReferences} 处演示文档或可选页脚引用；使用 --strict-content-docs 强制检查`,
		);
		console.log("\n✓ skills 结构与主题路径引用一致（外部内容引用可缺省）");
	} else {
		console.log("\n✓ skills 结构与路径引用一致");
	}
}
