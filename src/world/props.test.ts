import { describe, expect, it } from "vitest";
import { config } from "../config";
import { BIOME_IDS, dominant } from "./biomes";
import { createClimate, createHeight } from "./height";
import { createFeatures, type Tree } from "./props";

const p = config.props;
const w = config.world;
const height = createHeight("paper", w);
const climate = createClimate("paper", w);
const make = () => createFeatures("paper", height, climate, p, w);
const features = make();

// Trees in the 20×20 chunks around the origin.
const groundTrees: Tree[] = [];
for (let cx = -10; cx < 10; cx++)
	for (let cz = -10; cz < 10; cz++)
		groundTrees.push(...features.groundCell(cx, cz).trees);
const around = features.near(0, 0, 3000);

describe("world features", () => {
	it("are deterministic per seed", () => {
		const again = make();
		expect(again.groundCell(3, -2)).toEqual(features.groundCell(3, -2));
		expect(again.near(0, 0, 3000)).toEqual(around);
	});

	it("places trees, but not in water or on steep slopes", () => {
		expect(groundTrees.length).toBeGreaterThan(200);
		for (const t of groundTrees) {
			expect(height(t.x, t.z)).toBeGreaterThan(w.seaLevel + p.beach);
			expect(height(t.x, t.z)).toBeLessThan(p.treeLine);
		}
	});

	it("has every biome somewhere, and houses in villages", () => {
		const seen = new Set<string>();
		for (let x = -20000; x <= 20000; x += 500) {
			for (let z = -20000; z <= 20000; z += 500)
				seen.add(dominant(features.biomeAt(x, z)));
		}
		expect([...seen].sort()).toEqual([...BIOME_IDS].sort());
		let houses = 0;
		for (let cx = -25; cx < 25; cx++)
			for (let cz = -25; cz < 25; cz++)
				houses += features.groundCell(cx, cz).houses.length;
		expect(houses).toBeGreaterThan(0);
	});

	it("trees are solid, the air above them is not", () => {
		const t = groundTrees.find(
			(t) => t.kind === "pine" || t.kind === "snowPine",
		);
		if (!t) throw new Error("no pine");
		expect(features.solidAt(t.x, t.y + 1, t.z)).toBe(true); // trunk
		expect(features.solidAt(t.x + 0.5, t.y + 4 * t.s, t.z)).toBe(true); // branches
		expect(features.solidAt(t.x, t.y + 30 * t.s, t.z)).toBe(false); // above
	});

	it("arch holes are clear, the rock is solid, and the lane in front is clear", () => {
		const a = around.arches[0];
		const R = 20 * a.s;
		expect(features.solidAt(a.x, a.y + 4, a.z)).toBe(false);
		expect(features.solidAt(a.x, a.y + R, a.z)).toBe(true);
		for (let d = -150; d <= 150; d += 2) {
			expect(
				features.solidAt(
					a.x + Math.sin(a.yaw) * d,
					a.y + 4,
					a.z + Math.cos(a.yaw) * d,
				),
			).toBe(false);
		}
	});

	it("places hoops with a clear way through", () => {
		expect(around.hoops.length).toBeGreaterThan(5);
		for (const h of around.hoops) {
			expect(features.solidAt(h.x, h.y, h.z)).toBe(false); // the hole
			expect(features.solidAt(h.x, h.y + h.R, h.z)).toBe(true); // the rim
			for (let d = -p.hoopLane; d <= p.hoopLane; d += 10) {
				expect(
					height(h.x + Math.sin(h.yaw) * d, h.z + Math.cos(h.yaw) * d),
				).toBeLessThan(h.y);
			}
		}
	});

	it("floating mountains float, with vines that never reach the ground", () => {
		expect(around.floaters.length).toBeGreaterThan(0);
		for (const f of around.floaters) {
			expect(f.y - f.H).toBeGreaterThan(height(f.x, f.z)); // tip above the ground
			expect(features.solidAt(f.x, f.y - f.H * 0.3, f.z)).toBe(true); // inside the rock
			expect(features.solidAt(f.x, f.y + 40, f.z)).toBe(false); // above it
		}
		for (const v of around.vines) {
			expect(v.top - v.length).toBeGreaterThan(height(v.x, v.z));
			expect(features.solidAt(v.x, v.top - v.length / 2, v.z)).toBe(true);
		}
	});
});
