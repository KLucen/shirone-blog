/**
 * Umami 统计配置类型（由 oddmisc 提供）。
 */
export type UmamiConfig = {
	/** 全局 Umami 统计总开关：false 时完全不加载 oddmisc 运行时脚本与 DOM */
	enable: boolean;
	/** Umami 分享链接（必填） */
	shareUrl: string;
	/** Umami Website ID；与 scriptUrl 同时配置时启用访问采集。 */
	websiteId?: string;
	/** Umami 采集脚本 URL；与 websiteId 同时配置时启用访问采集。 */
	scriptUrl?: string;
};

/**
 * 解析后的 Umami 配置选项。
 *
 * `shareUrl` 是**可选**的：它是「读取层」的入口，与「采集层」（`websiteId` +
 * `scriptUrl`）彼此独立。只配置采集层时不该被判定为「未启用」。
 *
 * 读取方的约定：
 * - 注入 oddmisc 读取运行时前先看 `shareUrl`（缺省时不注入，不发任何请求）；
 * - 注入采集脚本前先看 `websiteId` 与 `scriptUrl`。
 *
 * 返回 `null` 仅表示「一层都没配」或全局关闭。
 */
export type ResolvedUmamiOptions = {
	shareUrl?: string;
	websiteId?: string;
	scriptUrl?: string;
} | null;
