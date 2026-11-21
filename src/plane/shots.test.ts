import { describe, expect, it } from "vitest";
import { fire, SHOT, type Shot, segmentHits, stepShots } from "./shots";

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
