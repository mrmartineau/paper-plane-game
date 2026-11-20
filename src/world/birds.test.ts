import { describe, expect, it } from "vitest";
import { config } from "../config";
import { type Bird, birdPose, createBirds, hitsBird } from "./birds";

const flat = () => 0;
const pose = () => ({ x: 0, y: 0, z: 0, yaw: 0, bank: 0 });

describe("birds", () => {
	it("are deterministic and include flocks", () => {
		const a = createBirds("s", flat, [], config.birds, 3000);
		expect(a).toEqual(createBirds("s", flat, [], config.birds, 3000));
		expect(a.length).toBeGreaterThan(10);
	});

	it("circle a thermal", () => {
		const col = {
			id: 1,
			x: 100,
			z: 200,
			base: 0,
			top: 300,
			radius: 50,
			strength: 8,
		};
		const b = { ...config.birds, flockChance: 0, thermalChance: 1 };
		const birds = createBirds("s", flat, [col], b, 1000);
		expect(birds.length).toBeGreaterThan(1);
		for (const bird of birds) {
			const p = birdPose(bird, 12.3, pose());
			expect(Math.hypot(p.x - col.x, p.z - col.z)).toBeLessThan(col.radius);
		}
	});

	it("move along their circle and can be hit", () => {
		const bird: Bird = {
			cx: 0,
			cy: 50,
			cz: 0,
			radius: 100,
			speed: 0.1,
			phase: 0,
			flap: 1,
			tint: 0,
		};
		const p0 = birdPose(bird, 0, pose());
		const p1 = birdPose(bird, 1, pose());
		expect(Math.hypot(p1.x - p0.x, p1.z - p0.z)).toBeCloseTo(10, 0); // 0.1 rad/s × 100 m
		expect(hitsBird([bird], p1.x, p1.y, p1.z, 1, 1.5)).toBe(true);
		expect(hitsBird([bird], p1.x, p1.y + 5, p1.z, 1, 1.5)).toBe(false);
	});
});
