// Courses: chains of rings along a Catmull-Rom spline over the terrain, one region at a time.
// The seed decides whether a region has a course. Pure, no Three.js.
import type { Config } from "../config";
import { forCells, memoCells } from "../core/memo";
import { rngFor } from "../core/rng";
import type { Ring } from "./rings";

export interface Course {
	id: string;
	gate: Ring; // fly through this to start
	rings: Ring[];
}

type Vec = { x: number; y: number; z: number };

/** Catmull-Rom point between p1 and p2 at t (0..1). */
export function catmullRom(p0: Vec, p1: Vec, p2: Vec, p3: Vec, t: number): Vec {
	const t2 = t * t;
	const t3 = t2 * t;
	const f = (a: number, b: number, c: number, d: number) =>
		0.5 *
		(2 * b +
			(-a + c) * t +
			(2 * a - 5 * b + 4 * c - d) * t2 +
			(-a + 3 * b - 3 * c + d) * t3);
	return {
		x: f(p0.x, p1.x, p2.x, p3.x),
		y: f(p0.y, p1.y, p2.y, p3.y),
		z: f(p0.z, p1.z, p2.z, p3.z),
	};
}

export function createCourses(
	seed: string,
	ground: (x: number, z: number) => number,
	solidAt: (x: number, y: number, z: number) => boolean,
	c: Config["courses"],
) {
	const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
	const highestUnder = (a: Vec, b: Vec) => {
		let h = Number.NEGATIVE_INFINITY;
		for (let k = 0; k <= 6; k++)
			h = Math.max(h, ground(lerp(a.x, b.x, k / 6), lerp(a.z, b.z, k / 6)));
		return h;
	};
	/** Is a ring of radius R at p, facing yaw, clear of solid things (rim and centre)? */
	const clear = (p: Vec, R: number, yaw: number) => {
		if (p.y - R < ground(p.x, p.z) + c.groundClearance) return false;
		if (solidAt(p.x, p.y, p.z)) return false;
		for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
			const side = Math.cos(a) * R;
			if (
				solidAt(
					p.x + Math.cos(yaw) * side,
					p.y + Math.sin(a) * R,
					p.z - Math.sin(yaw) * side,
				)
			)
				return false;
		}
		return true;
	};

	const region = memoCells((rx: number, rz: number): Course | null => {
		const rand = rngFor(seed, "course", rx, rz);
		if (rand() > c.chance) return null;

		// Control points: a wandering path that keeps a sensible height above the ground.
		let x = (rx + 0.2 + rand() * 0.6) * c.region;
		let z = (rz + 0.2 + rand() * 0.6) * c.region;
		let heading = rand() * Math.PI * 2;
		let y = ground(x, z) + lerp(c.heightMin, c.heightMax, rand());
		const points: Vec[] = [{ x, y, z }];
		const n =
			c.pointsMin + Math.floor(rand() * (c.pointsMax - c.pointsMin + 1));
		for (let i = 1; i < n; i++) {
			heading += (rand() - 0.5) * 2 * c.maxTurn;
			const step = lerp(c.stepMin, c.stepMax, rand());
			const next = {
				x: x + Math.sin(heading) * step,
				y: 0,
				z: z + Math.cos(heading) * step,
			};
			const floor = highestUnder({ x, y, z }, next);
			y = Math.min(
				Math.max(y + (rand() - 0.5) * 2 * c.climbMax, floor + c.heightMin),
				floor + c.heightMax,
			);
			next.y = y;
			points.push(next);
			x = next.x;
			z = next.z;
		}

		// Walk the spline and drop a ring every `spacing` metres, facing along the path.
		const samples: Vec[] = [];
		for (let i = 0; i < points.length - 1; i++) {
			const p0 = points[Math.max(0, i - 1)];
			const p3 = points[Math.min(points.length - 1, i + 2)];
			for (let k = 0; k < 12; k++)
				samples.push(catmullRom(p0, points[i], points[i + 1], p3, k / 12));
		}
		samples.push(points[points.length - 1]);

		const rings: Ring[] = [];
		let gate: Ring | null = null;
		let since = c.spacing; // place the gate at the very start
		for (let i = 1; i < samples.length; i++) {
			const a = samples[i - 1];
			const b = samples[i];
			since += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
			if (since < c.spacing && gate) continue;
			since = 0;
			const yaw = Math.atan2(a.x - b.x, a.z - b.z); // the hole faces back along the path
			const R: number = gate ? c.ringRadius : c.gateRadius;
			const ring: Ring = { x: b.x, y: b.y, z: b.z, yaw, R, r: R * c.tube };
			// Nudge it up out of anything in the way; drop it if that doesn't work.
			let ok = false;
			for (let lift = 0; lift < 4 && !ok; lift++) {
				if (lift) ring.y += 12;
				ok = clear(ring, R, yaw);
			}
			if (!ok) {
				if (!gate) return null; // no room for a start gate here
				continue;
			}
			if (gate) rings.push(ring);
			else gate = ring;
		}
		if (!gate || rings.length < c.minRings) return null;
		return { id: `${rx},${rz}`, gate, rings };
	});

	/** Courses whose region is within `range` of (x, z). */
	function near(x: number, z: number, range: number): Course[] {
		const out: Course[] = [];
		forCells(x, z, range, c.region, (rx, rz) => {
			const course = region(rx, rz);
			if (course) out.push(course);
		});
		return out;
	}

	return { near, region };
}
