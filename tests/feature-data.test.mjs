import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	filterByDisabledKeys,
	resolveDevicesData,
	resolveProjectsData,
	resolveSkillsData,
	resolveTimelineData,
} from "../src/utils/feature-data.ts";

describe("Feature Data & Resolver Tests", () => {
	it("filterByDisabledKeys correctly filters items by key/id/name/title", () => {
		const items = [
			{ key: "item-1", name: "One" },
			{ key: "item-2", name: "Two" },
			{ key: "item-3", name: "Three" },
		];

		const filtered = filterByDisabledKeys(items, ["item-2"]);
		assert.equal(filtered.length, 2);
		assert.deepEqual(
			filtered.map((i) => i.key),
			["item-1", "item-3"],
		);
	});

	it("resolveProjectsData applies disabledKeys correctly", () => {
		const customItems = [
			{ key: "shirone" },
			{ key: "folkpatch" },
			{ key: "kernelpatch" },
		];
		const config = {
			enable: true,
			categories: [],
			disabledKeys: ["folkpatch"],
		};
		const resolved = resolveProjectsData(config, customItems);
		assert.deepEqual(
			resolved.map((p) => p.key),
			["shirone", "kernelpatch"],
		);
	});

	it("resolveSkillsData applies disabledNames correctly", () => {
		const customItems = [{ name: "TypeScript" }, { name: "PHP" }];
		const config = {
			enable: true,
			categories: [],
			disabledNames: ["PHP"],
		};
		const resolved = resolveSkillsData(config, customItems);
		assert.deepEqual(
			resolved.map((s) => s.name),
			["TypeScript"],
		);
	});

	it("resolveTimelineData applies disabledTitles and order correctly", () => {
		const customItems = [
			{ title: "Frontend Engineer", date: "2024.07 – 2025.06" },
			{ title: "Senior Frontend Engineer", date: "2025.07 – Present" },
			{
				title: "Computer Science & Engineering Degree",
				date: "2020.09 – 2024.06",
			},
		];
		const config = {
			enable: true,
			categories: [],
			order: "asc",
			disabledTitles: ["Senior Frontend Engineer"],
		};
		const resolved = resolveTimelineData(config, customItems);
		assert.deepEqual(
			resolved.map((t) => t.title),
			["Computer Science & Engineering Degree", "Frontend Engineer"],
		);
	});

	it("resolveTimelineData sorts correctly by date in desc and asc order", () => {
		const customItems = [
			{ title: "Old", date: "2021.05" },
			{ title: "Recent", date: "2024.10" },
			{ title: "Present", date: "2025.01 - Present" },
			{ title: "Middle", date: "2023.01" },
		];
		const descRes = resolveTimelineData({ order: "desc" }, customItems);
		assert.deepEqual(
			descRes.map((i) => i.title),
			["Present", "Recent", "Middle", "Old"],
		);

		const ascRes = resolveTimelineData({ order: "asc" }, customItems);
		assert.deepEqual(
			ascRes.map((i) => i.title),
			["Old", "Middle", "Recent", "Present"],
		);
	});

	it("resolveDevicesData applies disabledIds correctly", () => {
		const customItems = [{ id: "macbook-pro-16" }, { id: "iphone-16-pro" }];
		const config = {
			enable: true,
			categories: [],
			disabledIds: ["iphone-16-pro"],
		};
		const resolved = resolveDevicesData(config, customItems);
		assert.deepEqual(
			resolved.map((d) => d.id),
			["macbook-pro-16"],
		);
	});
});
