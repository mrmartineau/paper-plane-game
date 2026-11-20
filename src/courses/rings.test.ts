import { describe, expect, it } from "vitest";
import { passedThrough, type Ring } from "./rings";

// Ring facing along world Z (yaw 0), centre at (0, 50, 0).
const ring: Ring = { x: 0, y: 50, z: 0, yaw: 0, R: 8, r: 0.7 };
const at = (x: number, y: number, z: number) => ({ x, y, z });

describe("passedThrough", () => {
	it("counts a step through the hole, either way", () => {
		expect(passedThrough(ring, at(0, 50, 1), at(0, 50, -1))).toBe(true);
		expect(passedThrough(ring, at(3, 48, -0.2), at(3, 48, 0.3))).toBe(true);
	});

	it("ignores steps that miss the hole or don't cross the plane", () => {
		expect(passedThrough(ring, at(0, 60, 1), at(0, 60, -1))).toBe(false); // above
		expect(passedThrough(ring, at(7.5, 50, 1), at(7.5, 50, -1))).toBe(false); // through the tube
		expect(passedThrough(ring, at(0, 50, 1), at(0, 50, 0.5))).toBe(false); // short of it
	});

	it("works for a turned ring", () => {
		const turned = { ...ring, yaw: Math.PI / 2 }; // hole faces along X
		expect(passedThrough(turned, at(1, 50, 0), at(-1, 50, 0))).toBe(true);
		expect(passedThrough(turned, at(1, 50, 1), at(1, 50, -1))).toBe(false); // alongside, never crosses
	});
});
