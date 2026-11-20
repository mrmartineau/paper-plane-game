import { describe, expect, it } from "vitest";
import { config } from "../config";
import { createClimate, createHeight } from "../world/height";
import { createFeatures } from "../world/props";
import { catmullRom, createCourses } from "./generate";

const w = config.world;
const height = createHeight("paper", w);
const ground = (x: number, z: number) => Math.max(height(x, z), w.seaLevel);
const features = createFeatures(
	"paper",
	height,
	createClimate("paper", w),
	config.props,
	w,
);
const make = () =>
	createCourses("paper", ground, features.solidAt, config.courses);

describe("courses", () => {
	const courses = make().near(0, 0, 4000);

	it("are deterministic and there are several near the start", () => {
		expect(make().near(0, 0, 4000)).toEqual(courses);
		expect(courses.length).toBeGreaterThanOrEqual(4);
	});

	it("have a gate, enough rings, sensible spacing, and stay off the ground and out of rocks", () => {
		for (const course of courses) {
			expect(course.rings.length).toBeGreaterThanOrEqual(
				config.courses.minRings,
			);
			for (const r of [course.gate, ...course.rings]) {
				expect(r.y - r.R).toBeGreaterThan(ground(r.x, r.z));
				expect(features.solidAt(r.x, r.y, r.z)).toBe(false);
			}
			for (let i = 1; i < course.rings.length; i++) {
				const a = course.rings[i - 1];
				const b = course.rings[i];
				expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(
					config.courses.spacing * 4,
				);
			}
		}
	});

	it("catmull-rom passes through its middle points", () => {
		const p = [
			{ x: 0, y: 0, z: 0 },
			{ x: 10, y: 1, z: 0 },
			{ x: 20, y: 5, z: 10 },
			{ x: 30, y: 0, z: 10 },
		];
		expect(catmullRom(p[0], p[1], p[2], p[3], 0)).toEqual(p[1]);
		const end = catmullRom(p[0], p[1], p[2], p[3], 1);
		expect(end.x).toBeCloseTo(20);
		expect(end.y).toBeCloseTo(5);
	});
});
