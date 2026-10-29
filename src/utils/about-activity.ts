/**
 * 关于页活跃度热力图纯函数工具。
 *
 * 数据契约见 src/types/aboutData.ts 的 `AboutActivity.cells`：
 * 53 列 × 7 行的扁平等级数组，**按「周优先」展开**（先整周 7 天，再下一周），
 * 行序固定为周日在最上、周六在最下，共 371 格。
 * 这里只做几何切分与占位符替换，不读集合、不碰 DOM，可在 node --test 下直接导入。
 */

/** 热力图固定 53 列（约一年），与参考图 activity-light.svg 同口径 */
export const ACTIVITY_COLUMNS = 53;
/** 每列 7 天，周日在最上 */
export const ACTIVITY_ROWS = 7;
/** 格子总数：371。输入长短都按这个几何收敛，缺数据只表现为更浅的格子 */
export const ACTIVITY_CELL_TOTAL = ACTIVITY_COLUMNS * ACTIVITY_ROWS;
/** 色阶下限（无贡献） */
export const ACTIVITY_MIN_LEVEL = 0;
/** 色阶上限：0–4 五级，与参考图 --about-level-* 一致 */
export const ACTIVITY_MAX_LEVEL = 4;

/** 色阶图例从左到右要画的等级（Less → More） */
export const ACTIVITY_LEVELS: readonly number[] = Array.from(
	{ length: ACTIVITY_MAX_LEVEL - ACTIVITY_MIN_LEVEL + 1 },
	(_, index) => ACTIVITY_MIN_LEVEL + index,
);

/** 单格几何：column 为 0–52 的周序，row 为 0（周日）–6（周六） */
export interface ActivityCell {
	/** 在扁平数组中的下标，等于 column * 7 + row */
	index: number;
	column: number;
	row: number;
	/** 收敛到 0–4 的贡献等级 */
	level: number;
}

/** 一列 = 一周 = 7 格（周日在最上） */
export interface ActivityWeek {
	/** 周序，0 为最早一周 */
	index: number;
	cells: ActivityCell[];
}

/**
 * 把任意数值收敛成合法等级：非有限数按 0，越界夹到 0–4，小数向下取整。
 * 数据层已经归一过一次，这里再兜一层是为了「版式恒定」——坏值只能让格子变浅，
 * 不能让 53×7 的网格错位。
 */
export function normalizeActivityLevel(value: number): number {
	if (!Number.isFinite(value)) return ACTIVITY_MIN_LEVEL;
	const level = Math.trunc(value);
	if (level <= ACTIVITY_MIN_LEVEL) return ACTIVITY_MIN_LEVEL;
	if (level >= ACTIVITY_MAX_LEVEL) return ACTIVITY_MAX_LEVEL;
	return level;
}

/**
 * 按「周优先」把扁平等级数组切成 53 列 × 7 行。
 * 输入短于 371 时尾部补 0，长于 371 时截断——几何恒定，越界不报错。
 */
export function buildActivityWeeks(
	cells: readonly number[] | undefined,
): ActivityWeek[] {
	const source = cells ?? [];
	const weeks: ActivityWeek[] = [];
	for (let column = 0; column < ACTIVITY_COLUMNS; column += 1) {
		const weekCells: ActivityCell[] = [];
		for (let row = 0; row < ACTIVITY_ROWS; row += 1) {
			const index = column * ACTIVITY_ROWS + row;
			weekCells.push({
				index,
				column,
				row,
				level: normalizeActivityLevel(source[index] ?? ACTIVITY_MIN_LEVEL),
			});
		}
		weeks.push({ index: column, cells: weekCells });
	}
	return weeks;
}

/**
 * 替换 `{name}` 形式的占位符。
 * 未提供对应值时**原样保留**占位符：拼错的键会以 `{date}` 的样子出现在页面上，
 * 比静默替换成空串更早暴露问题。
 */
export function fillPlaceholders(
	template: string,
	values: Readonly<Record<string, string>>,
): string {
	return template.replace(/\{(\w+)\}/g, (match, name: string) => {
		const value = values[name];
		return value === undefined ? match : value;
	});
}

/** 替换 `{count}` 占位符；数字按站内既有口径加千分位（如 1,284） */
export function fillCount(template: string, count: number): string {
	return fillPlaceholders(template, {
		count: Number.isFinite(count) ? count.toLocaleString("en-US") : "0",
	});
}
