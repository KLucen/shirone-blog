/**
 * CI 夹具：关于页数据。
 *
 * 主题在 CI 中以 `tests/fixtures/ci-content` 作为内容仓（见 `.github/workflows/ci.yml`
 * 里的 `CONTENT_DIR`），所以这里必须给出 `src/types/aboutData.ts` 契约的最小完整实例，
 * 否则 `src/pages/about.astro` 对 `@/data/about` 的导入无法解析，诊断与构建都会失败。
 * 真实数据由内容仓的 `data/about.ts` 提供，与本文件互不相干。
 */
import type { AboutData } from "@/types/aboutData";

export const aboutData: AboutData = {
	name: "CI Fixture",
	handle: "ci-fixture",
	tagline: "Fixture data for the CI smoke build.",
	links: [
		{
			label: "Home",
			href: "https://example.com/",
			icon: "material-symbols:home-outline-rounded",
		},
		{
			label: "Repositories",
			href: "https://example.com/repositories",
			icon: "fa6-brands:github",
		},
	],
	statsHeadline: "Fixture headline",
	stats: [
		{
			key: "commits",
			value: "0",
			label: "commits",
			href: "https://example.com/commits",
			icon: "material-symbols:commit-rounded",
		},
		{
			key: "stars",
			value: "0",
			label: "stars",
			href: "https://example.com/stars",
			icon: "material-symbols:star-outline-rounded",
		},
	],
	languages: [
		{ name: "TypeScript", percent: 60, color: "#3178c6" },
		{ name: "CSS", percent: 40, color: "#663399" },
	],
	languageGroups: [
		{ label: "Frontend", percent: 60 },
		{ label: "Styling", percent: 40 },
	],
	activity: {
		total: 0,
		days: 0,
		scope: "fixture scope",
		cells: Array.from({ length: 371 }, () => 0),
	},
	notebookTitle: "Fixture notebook",
	notebook: [
		{ label: "Fixture entry", value: "0 items", href: "https://example.com/feed" },
	],
	exploring: [
		{
			title: "Fixture exploration",
			body: "Placeholder entry so the collapsed section renders during CI.",
			href: "https://example.com/exploring",
			meta: "Fixture · CI",
		},
	],
	provenance: ["Fixture data; not collected from any account."],
	generatedAt: "2026-01-01T00:00:00Z",
};
