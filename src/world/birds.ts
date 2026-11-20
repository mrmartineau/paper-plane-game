// Paper birds flying circles: flocks crossing the sky, and a few circling in each
// of some thermals (so birds also show you where the lift is). They are solid.
// Pure: every bird's position is a function of time, so no per-bird state.
import type { Config } from "../config";
import { forCells, memoCells } from "../core/memo";
import { rngFor } from "../core/rng";
import type { AirColumn } from "./thermals";

export interface Bird {
	cx: number; // circle centre
	cy: number;
	cz: number;
	radius: number;
	speed: number; // rad/s around the circle; sign = direction
	phase: number;
	flap: number; // wing flap amount, 0..1 (thermal birds mostly glide)
	tint: number; // palette index
}

export interface BirdPose {
	x: number;
	y: number;
	z: number;
	yaw: number; // facing along the circle (0 = -Z)
	bank: number; // rad, leaning into the turn
}

export type BirdsConfig = Config["birds"];

/**
 * Birds per cell (cell size = flockCell): maybe one flock on a big circle, plus a few
 * birds circling each thermal whose centre is in the cell. Cached, so it streams.
 */
export function createBirdField(
	seed: string,
	height: (x: number, z: number) => number,
	columnsNear: (x: number, z: number, range: number) => AirColumn[],
	b: BirdsConfig,
) {
	const lerp = (a: number, c: number, t: number) => a + (c - a) * t;
	const size = b.flockCell;

	const cell = memoCells((cx: number, cz: number): Bird[] => {
		const birds: Bird[] = [];
		const rand = rngFor(seed, "flock", cx, cz);
		if (rand() <= b.flockChance) {
			// A flock on a big circle. Altitude clears the highest ground under the circle.
			const x = (cx + rand()) * size;
			const z = (cz + rand()) * size;
			const radius = lerp(b.flockRadiusMin, b.flockRadiusMax, rand());
			let ground = 0;
			for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
				ground = Math.max(
					ground,
					height(x + Math.cos(a) * radius, z + Math.sin(a) * radius),
				);
			}
			const y = ground + lerp(b.flockLiftMin, b.flockLiftMax, rand());
			const dir = rand() < 0.5 ? 1 : -1;
			const phase = rand() * Math.PI * 2;
			const n = b.flockMin + Math.floor(rand() * (b.flockMax - b.flockMin + 1));
			for (let i = 0; i < n; i++) {
				birds.push({
					cx: x,
					cy: y + (rand() - 0.5) * 8,
					cz: z,
					radius: radius + (rand() - 0.5) * 10,
					speed: (dir * b.flockSpeed) / radius,
					phase: phase - (dir * i * b.flockSpacing) / radius, // trail behind the leader
					flap: 1,
					tint: Math.floor(rand() * 100),
				});
			}
		}

		// A few birds circling inside some of this cell's thermals.
		const x0 = cx * size;
		const z0 = cz * size;
		for (const col of columnsNear(x0 + size / 2, z0 + size / 2, size)) {
			if (
				col.strength <= 0 ||
				col.x < x0 ||
				col.x >= x0 + size ||
				col.z < z0 ||
				col.z >= z0 + size
			)
				continue;
			const r2 = rngFor(seed, "thermalBirds", col.id);
			if (r2() > b.thermalChance) continue;
			const n = 2 + Math.floor(r2() * 2);
			for (let i = 0; i < n; i++) {
				const radius = col.radius * lerp(0.35, 0.7, r2());
				birds.push({
					cx: col.x,
					cy: col.base + col.top * lerp(0.3, 0.8, r2()),
					cz: col.z,
					radius,
					speed: b.thermalSpeed / radius,
					phase: r2() * Math.PI * 2,
					flap: 0.25,
					tint: Math.floor(r2() * 100),
				});
			}
		}
		return birds;
	});

	/** Every bird whose circle centre is in a cell within `range`. */
	function near(x: number, z: number, range: number): Bird[] {
		const out: Bird[] = [];
		forCells(x, z, range, size, (cx, cz) => {
			out.push(...cell(cx, cz));
		});
		return out;
	}

	/** True if a point is within `radius` of a bird at time t. */
	function hit(
		x: number,
		y: number,
		z: number,
		t: number,
		radius: number,
	): boolean {
		return hitsBird(near(x, z, b.flockRadiusMax + 10), x, y, z, t, radius);
	}

	return { near, hit };
}

export function birdPose(bird: Bird, t: number, out: BirdPose): BirdPose {
	const a = bird.phase + bird.speed * t;
	out.x = bird.cx + Math.cos(a) * bird.radius;
	out.z = bird.cz + Math.sin(a) * bird.radius;
	out.y = bird.cy + Math.sin(t * 0.7 + bird.phase) * 1.5;
	// Velocity direction = d/dt of the position.
	const s = Math.sign(bird.speed);
	const vx = -Math.sin(a) * s;
	const vz = Math.cos(a) * s;
	out.yaw = Math.atan2(-vx, -vz);
	out.bank = 0.35 * s;
	return out;
}

/** True if a point is within `radius` of any bird at time t. */
export function hitsBird(
	birds: Bird[],
	x: number,
	y: number,
	z: number,
	t: number,
	radius: number,
): boolean {
	const pose: BirdPose = { x: 0, y: 0, z: 0, yaw: 0, bank: 0 };
	for (const bird of birds) {
		// Cheap reject: the bird is somewhere on its circle.
		const dc = Math.hypot(x - bird.cx, z - bird.cz);
		if (
			Math.abs(dc - bird.radius) > radius + 1 ||
			Math.abs(y - bird.cy) > radius + 2
		)
			continue;
		birdPose(bird, t, pose);
		if (
			(pose.x - x) ** 2 + (pose.y - y) ** 2 + (pose.z - z) ** 2 <
			radius * radius
		)
			return true;
	}
	return false;
}
