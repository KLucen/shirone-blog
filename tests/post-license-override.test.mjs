import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

const integrationSchema = read("src/integration/collections.ts");
const inlineSchema = read("src/content.config.ts");
const licenseComponent = read("src/components/molecules/License.astro");
const postPages = ["src/pages/posts/[...slug].astro", "src/pages/[...permalink].astro"];

/**
 * 单篇许可覆盖（frontmatter `license`）横跨多个文件：schema 有两份副本
 * （源仓库内联 + 包模式生成）、组件负责字段回退、两个文章模板各自决定渲不渲染。
 * 这三条断言把「复制粘贴漏一处」变成红灯——只改一份 schema 或只改一个模板时，
 * 版权卡的行为会静默不一致，而站点上没有任何报错。
 */
describe("单篇许可覆盖（frontmatter license）", () => {
	it("两份 schema 都声明 false | { author, name, url }", () => {
		const schemas = [
			["src/integration/collections.ts", integrationSchema],
			["src/content.config.ts", inlineSchema],
		];
		for (const [name, source] of schemas) {
			assert.match(source, /license:\s*z\s*\.union\(\[/, `${name}: 没有 license union`);
			assert.match(source, /z\.literal\(false\)/, `${name}: 缺少 license: false 分支`);
			for (const key of ["author", "name", "url"]) {
				assert.match(
					source,
					new RegExp(`${key}: z\\.string\\(\\)\\.optional\\(\\)\\.default\\(""\\)`),
					`${name}: 缺少 ${key} 字段`,
				);
			}
		}
	});

	it("License 组件按字段回退站点默认，并区分水印图标", () => {
		assert.match(licenseComponent, /license\?\.name \|\| licenseConfig\.name/);
		assert.match(licenseComponent, /license\?\.url \|\| licenseConfig\.url/);
		assert.match(licenseComponent, /license\?\.author \|\| profileConf\.name/);
		// 覆盖时用版权符号，默认时才是 CC 水印——否则等于替他人作品声明本站许可
		assert.match(licenseComponent, /fa6-regular:copyright/);
		assert.match(licenseComponent, /fa6-brands:creative-commons/);
		assert.match(
			licenseComponent,
			/data-license-override=\{license \? "true" : undefined\}/,
		);
	});

	it("两个文章模板都按 license 字段决定渲染并透传覆盖", () => {
		for (const page of postPages) {
			const source = read(page);
			assert.match(
				source,
				/const postLicense =\s*entry\.data\.license === false \? undefined : entry\.data\.license;/,
				`${page}: 没有把 license: false 归一化成 undefined`,
			);
			assert.match(
				source,
				/const licenseVisible = licenseConfig\.enable && entry\.data\.license !== false;/,
				`${page}: 版权卡渲染条件没有带上单篇开关`,
			);
			assert.match(
				source,
				/licenseVisible && <License[^>]*license=\{postLicense\}/,
				`${page}: 没有把覆盖传给 License`,
			);
		}
	});
});
