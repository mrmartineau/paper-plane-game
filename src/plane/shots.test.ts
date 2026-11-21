import { describe, expect, it } from "vitest";
import { aimAt, fire, SHOT, type Shot, segmentHits, stepShots } from "./shots";

const flat = () => 0;
const none = () => false;
const shot = (): Shot => {
	const s = fire([0, 100, 0], [0, 0, -1], [0, 0, -20]);
	return { ...s, prev: [...s.p], age: 0, by: 2 };
};

describe("paper-ball shots", () => {
	it("flies fast ahead of the plane and drops a little", () => {
		let shots = [shot()];
		for (let i = 0; i < 60; i++) shots = stepShots(shots, 1 / 60, flat, none);
		const [s] = shots;
		expect(s.p[2]).toBeLessThan(-(SHOT.speed + 20) * 0.95);
		expect(s.p[1]).toBeLessThan(100);
		expect(s.p[1]).toBeGreaterThan(95);
	});

	it("stops at solid things, the ground, and old age", () => {
		const wall = (_x: number, _y: number, z: number) => z < -30;
		let shots = [shot()];
		for (let i = 0; i < 30; i++) shots = stepShots(shots, 1 / 60, flat, wall);
		expect(shots).toHaveLength(0);
		shots = [shot()];
		for (let i = 0; i < (SHOT.life + 0.1) * 60; i++)
			shots = stepShots(shots, 1 / 60, () => -1e5, none);
		expect(shots).toHaveLength(0);
	});

	it("hits a plane it passes, even between two steps", () => {
		expect(segmentHits([0, 0, 0], [0, 0, -10], [0, 1, -5], 2.5)).toBe(true);
		expect(segmentHits([0, 0, 0], [0, 0, -10], [0, 5, -5], 2.5)).toBe(false);
		expect(segmentHits([0, 0, 0], [0, 0, -10], [0, 0, -14], 2.5)).toBe(false);
	});
});

describe("auto-aim", () => {
	it("aims straight at a target that is straight ahead and standing still", () => {
		const d = aimAt([0, 0, -1], [0, 0, -100], [0, 0, 0]);
		expect(d?.[2]).toBeLessThan(-0.99);
		expect(d?.[1]).toBeGreaterThan(0); // a touch high, the ball drops
	});

	it("leads a target that moves across", () => {
		const d = aimAt([0, 0, -1], [0, 0, -200], [20, 0, 0]);
		expect(d?.[0]).toBeGreaterThan(0.05); // aims to the right of where they are now
	});

	it("ignores targets outside the cone or out of range", () => {
		expect(aimAt([0, 0, -1], [100, 0, -20], [0, 0, 0])).toBeNull(); // off to the side
		expect(aimAt([0, 0, -1], [0, 0, 100], [0, 0, 0])).toBeNull(); // behind
		expect(
			aimAt([0, 0, -1], [0, 0, -(SHOT.aimRange + 50)], [0, 0, 0]),
		).toBeNull();
	});
});
