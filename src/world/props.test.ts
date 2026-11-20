import { describe, expect, it } from "vitest";
import { config } from "../config";
import { createHeight } from "./height";
import { createProps, SHAPES } from "./props";

const p = { ...config.props, extent: 1600 }; // smaller area keeps the test fast
const height = createHeight("paper", config.world);
const make = () => createProps("paper", height, p, config.world.seaLevel);

describe("props", () => {
	const props = make();

	it("are deterministic per seed", () => {
		const again = make();
		expect(again.trees).toEqual(props.trees);
		expect(again.rocks).toEqual(props.rocks);
		expect(again.arches).toEqual(props.arches);
	});

	it("places trees, rocks and arches, with no trees in water or above the tree line", () => {
		expect(props.trees.length).toBeGreaterThan(100);
		expect(props.rocks.length).toBeGreaterThan(20);
		expect(props.arches.length).toBeGreaterThan(0);
		for (const t of props.trees) {
			const h = height(t.x, t.z);
			expect(h).toBeGreaterThan(config.world.seaLevel + p.beach);
			expect(h).toBeLessThan(p.treeLine);
		}
	});

	it("trees are solid, the air above them is not", () => {
		const t = props.trees.find((t) => t.kind === "pine");
		if (!t) throw new Error("no pine");
		expect(props.solidAt(t.x, t.y + 1, t.z)).toBe(true); // trunk
		expect(props.solidAt(t.x + 0.5, t.y + 4 * t.s, t.z)).toBe(true); // branches
		expect(props.solidAt(t.x, t.y + 30 * t.s, t.z)).toBe(false); // above
	});

	it("arch holes are clear, the rock around them is solid", () => {
		const a = props.arches[0];
		const R = SHAPES.arch.R * a.s;
		// Centre of the hole, a few metres above the ring centre: open air.
		expect(props.solidAt(a.x, a.y + 4, a.z)).toBe(false);
		// Top of the ring: rock.
		expect(props.solidAt(a.x, a.y + R, a.z)).toBe(true);
	});

	it("keeps a clear lane in front of each arch", () => {
		const a = props.arches[0];
		const holeY = a.y + 4;
		for (let d = -150; d <= 150; d += 2) {
			const x = a.x + Math.sin(a.yaw) * d;
			const z = a.z + Math.cos(a.yaw) * d;
			expect(props.solidAt(x, holeY, z)).toBe(false);
		}
	});

	it("places hoops with a clear way through", () => {
		expect(props.hoops.length).toBeGreaterThan(5);
		for (const h of props.hoops) {
			expect(props.solidAt(h.x, h.y, h.z)).toBe(false); // the hole
			expect(props.solidAt(h.x, h.y + h.R, h.z)).toBe(true); // the rim
			for (let d = -p.hoopLane; d <= p.hoopLane; d += 10) {
				expect(
					height(h.x + Math.sin(h.yaw) * d, h.z + Math.cos(h.yaw) * d),
				).toBeLessThan(h.y);
			}
		}
	});
});
