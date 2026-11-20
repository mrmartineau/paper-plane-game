import { describe, expect, it } from "vitest";
import { config } from "../config";
import { createWind } from "./wind";

const c = config.wind;
const flat = () => 0;

describe("wind", () => {
	it("is deterministic and within its strength range", () => {
		const a = createWind("s", c, flat);
		const b = createWind("s", c, flat);
		for (const t of [0, 10, 100, 1000]) {
			expect(a.at(t)).toEqual(b.at(t));
			const speed = Math.hypot(a.at(t).x, a.at(t).z);
			expect(speed).toBeGreaterThanOrEqual(c.min - 1e-9);
			expect(speed).toBeLessThanOrEqual(c.max + 1e-9);
		}
	});

	it("drifts slowly", () => {
		const w = createWind("s", c, flat);
		const a = w.at(100);
		const b = w.at(101);
		expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(0.2);
	});

	it("gives ridge lift on the windward slope only, near the ground", () => {
		const w = createWind("s", c, flat);
		const wind = w.at(0);
		// A slope rising in the direction the wind blows.
		const dir = {
			x: wind.x / Math.hypot(wind.x, wind.z),
			z: wind.z / Math.hypot(wind.x, wind.z),
		};
		const uphill = createWind("s", c, (x, z) => (x * dir.x + z * dir.z) * 0.5);
		const downhill = createWind(
			"s",
			c,
			(x, z) => -(x * dir.x + z * dir.z) * 0.5,
		);
		expect(uphill.ridge(0, 0, 10, 0)).toBeGreaterThan(0);
		expect(downhill.ridge(0, 0, 10, 0)).toBe(0);
		expect(uphill.ridge(0, 0, c.ridgeHeight + 1, 0)).toBe(0); // too high
	});
});
