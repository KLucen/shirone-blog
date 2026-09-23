/**
 * 构建期的「尽力而为」追番同步。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 为什么需要它
 * ─────────────────────────────────────────────────────────────────────────────
 * 快照（`src/data/anime-snapshots/*.json`）与封面（`public/assets/anime/covers/*`）
 * 都在 `.gitignore` 里——它们是构建期产物，不进 Git。而 Vercel 的构建只跑
 * `pnpm build`，不会碰 `anime:sync`。若不在构建期同步一次，线上番剧页会回退成
 * `src/data/anime.ts` 里的演示数据（5 条），而不是你自己的追番列表（229 条）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 为什么不能让失败冒泡
 * ─────────────────────────────────────────────────────────────────────────────
 * 追番数据来自第三方接口（`api.bilibili.com`）。博客站点的可用性不该被一个
 * 装饰性的第三方接口绑架：B 站限流、改接口、CI 出口网络抖动，任何一件都不该
 * 让一次内容发布失败。
 *
 * 因此这里把同步包在 try/catch 里，失败只打印警告并继续构建；此时页面按
 * `anime.fallback` 配置回退到本地数据，站点照常上线。
 *
 * 提示：有 `BILI_SESSDATA`（仓库 secret / 环境变量）时会带上；
 * 追番列表为公开时无需该凭据。
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const syncScript = fileURLToPath(new URL("./sync.mjs", import.meta.url));

if (!existsSync(syncScript)) {
	console.warn(
		"[anime:build-sync] ⚠ scripts/anime/sync.mjs not found; skipping. " +
			"The anime page will fall back to the local dataset.",
	);
	process.exit(0);
}

/*
 * `--if-stale`：快照比 `snapshot.staleAfterDays` 新时直接跳过，避免每次构建都
 * 打第三方接口。快照缺失时它一律视为「过期」并触发同步——正是需要的行为。
 *
 * 用同步子进程而不是 import：同步脚本自己会 `process.exit()`，import 进来会
 * 把本进程一起带退出，构建就断了。
 */
const result = spawnSync(process.execPath, [syncScript, "--if-stale"], {
	stdio: "inherit",
	env: process.env,
});

if (result.error) {
	console.warn(
		`[anime:build-sync] ⚠ Could not run anime sync (${result.error.message}); ` +
			"continuing build with the fallback dataset.",
	);
	process.exit(0);
}

if (result.status !== 0) {
	console.warn(
		`[anime:build-sync] ⚠ Anime sync exited with code ${result.status}; ` +
			"continuing build with the fallback dataset. " +
			"This is expected when the anime list is private and BILI_SESSDATA is unset.",
	);
}

// 无论如何都以 0 退出：追番数据是装饰性的，不该阻断站点部署。
process.exit(0);
