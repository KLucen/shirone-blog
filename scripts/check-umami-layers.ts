/**
 * 定向自测：resolveUmamiOptions 的两层独立性。
 *
 * 回归的是本次修复的那个静默失效——`shareUrl` 为空时整个配置被判为 null，
 * 导致「只配 Tracking code（只采集）」这个组合永远不生效。
 */
import { resolveUmamiOptions } from "../src/config/umamiConfig.ts";

type Case = {
	name: string;
	config: {
		enable: boolean;
		shareUrl: string;
		websiteId?: string;
		scriptUrl?: string;
	};
	expect: {
		null?: boolean;
		shareUrl?: string;
		websiteId?: string;
		scriptUrl?: string;
	};
};

const cases: Case[] = [
	{
		name: "全局关闭 → null（零加载）",
		config: {
			enable: false,
			shareUrl: "https://cloud.umami.is/share/x",
			websiteId: "id",
			scriptUrl: "https://cloud.umami.is/script.js",
		},
		expect: { null: true },
	},
	{
		name: "两层都空 → null",
		config: { enable: true, shareUrl: "", websiteId: "", scriptUrl: "" },
		expect: { null: true },
	},
	{
		name: "只配采集层 → 非 null，且无 shareUrl（本次修复的核心）",
		config: {
			enable: true,
			shareUrl: "",
			websiteId: "627703f7-002c-4a43-a00c-1603126afc0f",
			scriptUrl: "https://cloud.umami.is/script.js",
		},
		expect: {
			websiteId: "627703f7-002c-4a43-a00c-1603126afc0f",
			scriptUrl: "https://cloud.umami.is/script.js",
		},
	},
	{
		name: "只配读取层 → 非 null，且无采集字段",
		config: { enable: true, shareUrl: "https://cloud.umami.is/share/abc" },
		expect: { shareUrl: "https://cloud.umami.is/share/abc" },
	},
	{
		name: "两层都配 → 三个字段齐全",
		config: {
			enable: true,
			shareUrl: "https://cloud.umami.is/share/abc",
			websiteId: "id-1",
			scriptUrl: "https://cloud.umami.is/script.js",
		},
		expect: {
			shareUrl: "https://cloud.umami.is/share/abc",
			websiteId: "id-1",
			scriptUrl: "https://cloud.umami.is/script.js",
		},
	},
	{
		name: "采集层只给一半（有 id 无脚本）→ 视为未配齐，回落 null",
		config: { enable: true, shareUrl: "", websiteId: "id-only" },
		expect: { null: true },
	},
	{
		name: "采集层只给一半（有脚本无 id）→ 视为未配齐，回落 null",
		config: {
			enable: true,
			shareUrl: "",
			scriptUrl: "https://cloud.umami.is/script.js",
		},
		expect: { null: true },
	},
	{
		name: "首尾空白被 trim（粘贴带换行的配置不会漏判）",
		config: {
			enable: true,
			shareUrl: "  https://cloud.umami.is/share/abc  ",
			websiteId: "  id-2  ",
			scriptUrl: "  https://cloud.umami.is/script.js  ",
		},
		expect: {
			shareUrl: "https://cloud.umami.is/share/abc",
			websiteId: "id-2",
			scriptUrl: "https://cloud.umami.is/script.js",
		},
	},
];

let pass = 0;
let fail = 0;

for (const c of cases) {
	const got = resolveUmamiOptions(c.config as never);
	let ok = true;
	const detail: string[] = [];

	if (c.expect.null) {
		ok = got === null;
		if (!ok) detail.push(`期望 null，实际 ${JSON.stringify(got)}`);
	} else {
		if (got === null) {
			ok = false;
			detail.push("期望非 null，实际 null");
		} else {
			for (const key of ["shareUrl", "websiteId", "scriptUrl"] as const) {
				const want = c.expect[key];
				const have = got[key];
				if (want === undefined) {
					// 未声明期望即不得出现：避免「只配采集」时混进 shareUrl
					if (have !== undefined) {
						ok = false;
						detail.push(`${key} 不该出现，实际 ${JSON.stringify(have)}`);
					}
				} else if (want !== have) {
					ok = false;
					detail.push(`${key} 期望 ${JSON.stringify(want)}，实际 ${JSON.stringify(have)}`);
				}
			}
		}
	}

	if (ok) {
		console.log(`  PASS  ${c.name}`);
		pass += 1;
	} else {
		console.log(`  FAIL  ${c.name}  — ${detail.join("; ")}`);
		fail += 1;
	}
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
