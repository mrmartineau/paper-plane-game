import { describe, expect, it } from "vitest";
import { config } from "../config";
import { createHeight } from "./height";

describe("height", () => {
	it("is deterministic per seed", () => {
		const a = createHeight("abc", config.world);
		const b = createHeight("abc", config.world);
		const other = createHeight("xyz", config.world);
		for (const [x, z] of [
			[0, 0],
			[123.4, -987.6],
			[5000, 5000],
		]) {
			expect(a(x, z)).toBe(b(x, z));
		}
		expect(a(123.4, -987.6)).not.toBe(other(123.4, -987.6));
	});

	it("stays in a sane range and has real relief", () => {
		const h = createHeight("paper", config.world);
		let min = Infinity;
		let max = -Infinity;
		for (let x = -4000; x <= 4000; x += 50) {
			for (let z = -4000; z <= 4000; z += 50) {
				const y = h(x, z);
				expect(Number.isFinite(y)).toBe(true);
				min = Math.min(min, y);
				max = Math.max(max, y);
			}
		}
		expect(min).toBeGreaterThan(-200);
		expect(max).toBeLessThan(500);
		expect(max - min).toBeGreaterThan(80);
	});
});
