import { describe, expect, it } from "vitest";
import { config } from "../config";
import { createAir } from "./thermals";

const flat = () => 0;

describe("air columns", () => {
	it("are deterministic per seed", () => {
		const a = createAir("s", flat, config.air).columnsNear(0, 0, 2000);
		const b = createAir("s", flat, config.air).columnsNear(0, 0, 2000);
		expect(a).toEqual(b);
		expect(a.length).toBeGreaterThan(10);
		expect(a.some((c) => c.strength > 0)).toBe(true);
		expect(a.some((c) => c.strength < 0)).toBe(true);
	});

	it("push hardest at the centre, nothing outside or above", () => {
		const air = createAir("s", flat, config.air);
		const all = air.columnsNear(0, 0, 3000);
		const gap = config.air.radiusMax * 2;
		const col = all.find(
			(c) =>
				c.strength > 0 &&
				all.every(
					(o) => o === c || (o.x - c.x) ** 2 + (o.z - c.z) ** 2 > gap * gap,
				),
		);
		if (!col) throw new Error("no lone updraft in range");
		const mid = col.top * 0.5;
		const centre = air.airAt(col.x, mid, col.z);
		expect(centre).toBeGreaterThan(col.strength * 0.9);
		expect(air.airAt(col.x + col.radius * 0.7, mid, col.z)).toBeLessThan(
			centre,
		);
		expect(air.airAt(col.x, col.top + 10, col.z)).toBe(0);
	});
});
