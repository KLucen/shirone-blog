/**
 * 关于页「GitHub 个人主页」风格的内容模型。
 *
 * 形状冻结文件：数据由内容仓 `data/about.ts` 提供（内容仓 mount 到 `src/data/about.ts`），
 * 这里只描述契约。组件不得写死用户可见文案；固定 UI 文案一律走 `src/i18n/i18nKey.ts`，
 * 站点个性化内容（链接名、统计标签、口径说明…）随数据文件下发。
 */

/** GitHub 主页顶部的跳转链接（博客 / 仓库 / 贡献 / RSS）。 */
export interface AboutLink {
	/** 链接文字。 */
	label: string;
	href: string;
	/** `astro-icon` 图标名；纯 SSR 路径不使用 `@iconify/svelte`。 */
	icon: string;
}

/** 概览卡里的一项统计。 */
export interface AboutStat {
	/** 稳定标识，用作 keyed each 的键与入场动画序号。 */
	key: string;
	/** 展示值，已由内容仓格式化（千位分隔固定 `en-US`，不随构建机 locale 漂移）。 */
	value: string;
	label: string;
	href: string;
	icon: string;
}

/** 代码构成卡里的一种语言。 */
export interface AboutLanguage {
	name: string;
	/** 0–100。 */
	percent: number;
	/** 该语言在图例与环形图中的色值。 */
	color: string;
}

/** 代码构成卡里按类型归并的一行（前端 / 脚本 / 样式 …）。 */
export interface AboutLanguageGroup {
	label: string;
	/** 0–100。 */
	percent: number;
}

/** 活跃度卡的贡献热力图。 */
export interface AboutActivity {
	/** 统计区间内的公开贡献总数。 */
	total: number;
	/** 有贡献的天数。 */
	days: number;
	/** 口径里的仓库范围，例如「自有公开非 fork 仓库」。 */
	scope: string;
	/**
	 * 53 列 × 7 行（周日在最上）的等级矩阵，按周优先展开，长度 371。
	 * 取值 0–4，对应 GitHub 的 5 档色阶；0 表示当天无贡献。
	 */
	cells: number[];
}

/** 笔记本卡里的一行（RSS 收录条目 / 最近发布）。 */
export interface AboutNotebookItem {
	label: string;
	value: string;
	href?: string;
}

/** 「正在探索」折叠区里的一条。 */
export interface AboutExploringItem {
	title: string;
	body: string;
	href: string;
	/** 右侧元信息，例如「Tauri · Python/FastAPI」。 */
	meta: string;
}

/** 关于页除博客自身统计外的全部内容。 */
export interface AboutData {
	/** 顶部展示的名字。 */
	name: string;
	/** GitHub 用户名，用于渲染 `@handle`。 */
	handle: string;
	tagline: string;
	links: AboutLink[];
	/** 概览卡标题，例如「把想法写进代码里」。 */
	statsHeadline: string;
	stats: AboutStat[];
	languages: AboutLanguage[];
	languageGroups: AboutLanguageGroup[];
	activity: AboutActivity;
	notebookTitle: string;
	notebook: AboutNotebookItem[];
	exploring: AboutExploringItem[];
	/** 「数据口径与更新」的逐条说明。 */
	provenance: string[];
	/** 采集时间（ISO 8601）；渲染时按站点时区格式化，不直接切片字符串。 */
	generatedAt: string;
}
