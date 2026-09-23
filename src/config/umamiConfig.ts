import type { ResolvedUmamiOptions, UmamiConfig } from "@/types/umamiConfig";
import { withUserConfig } from "../utils/config-overlay.ts";

/**
 * Umami 统计配置单一真源（由 oddmisc 提供）。
 *
 * 遵循「零额外负担」原则：默认全局关闭（enable: false），
 * 在未开启时不产生任何外部网络请求、零额外 DOM 占位与零包体积膨胀。
 *
 * 详细用法见：`docs/umami-guide.md`
 */
export const umamiConfig: UmamiConfig = withUserConfig("umami", {
	/** 全局 Umami 统计总开关：false 时完全不加载 oddmisc 运行时脚本与 DOM */
	enable: false,
	/** Umami 分享链接（必填） */
	shareUrl: "",
	/** Umami Website ID；与 scriptUrl 同时填写时启用访问采集 */
	websiteId: "",
	/** Umami 采集脚本 URL；与 websiteId 同时填写时启用访问采集 */
	scriptUrl: "",
});

/**
 * 解析并校验 Umami 配置。全局关闭、或两层都没配齐时返回 null。
 *
 * ## 为什么不能因为 `shareUrl` 缺失就返回 null
 *
 * 早先这里在 `shareUrl` 为空时直接返回 null，于是「只采集、不读取」这个组合
 * 静默失效：`Layout.astro` 的采集脚本挂在 `umamiOptions?.websiteId` 之下，
 * 而 `umamiOptions` 恒为 null，脚本永远不注入——配了 Tracking code 却没有任何
 * 数据上报，且没有任何报错。这既与文档描述的「两层独立」矛盾，也是采集层
 * 事实上无法启用的根因。
 *
 * 现在两层各自判断：
 *   - 读取层：`shareUrl` 非空
 *   - 采集层：`websiteId` 与 `scriptUrl` **同时**非空
 *
 * 任何一层配齐就返回配置对象；两层都空才返回 null（此时真的无事可做）。
 */
export function resolveUmamiOptions(config: UmamiConfig): ResolvedUmamiOptions {
	if (!config.enable) {
		return null;
	}

	const shareUrl = config.shareUrl?.trim() || undefined;
	const websiteId = config.websiteId?.trim() || undefined;
	const scriptUrl = config.scriptUrl?.trim() || undefined;

	// 采集层要求成对出现：只有 id 没有脚本地址（或反之）都无法上报
	const collect = Boolean(websiteId && scriptUrl);

	// 两层都没配齐：保持「零加载」承诺——不注入运行时，也不渲染任何占位
	if (!shareUrl && !collect) {
		return null;
	}

	return {
		...(shareUrl ? { shareUrl } : {}),
		...(collect ? { websiteId, scriptUrl } : {}),
	};
}

export type { ResolvedUmamiOptions };
