// Cloud placement, per cell, in the air's own frame: the whole field slides with the
// wind's drift, so add the drift to get world positions. Pure, no Three.js.
import type { Config } from "../config";
import { forCells, memoCells } from "../core/memo";
import { rngFor } from "../core/rng";

export interface Cloud {
	x: number; // in the drifting frame
	y: number;
	z: number;
	size: number; // metres wide
	yaw: number;
	shape: number; // template index
}

export function createCloudField(seed: string, c: Config["clouds"]) {
	const cell = memoCells((cx: number, cz: number): Cloud[] => {
		const rand = rngFor(seed, "cloud", cx, cz);
		if (rand() > c.chance) return [];
		const out: Cloud[] = [];
		const n = 1 + Math.floor(rand() * c.maxPerCell);
		for (let i = 0; i < n; i++) {
			out.push({
				x: (cx + rand()) * c.cell,
				y: c.altitudeMin + rand() * (c.altitudeMax - c.altitudeMin),
				z: (cz + rand()) * c.cell,
				size: c.sizeMin + rand() * (c.sizeMax - c.sizeMin),
				yaw: rand() * Math.PI,
				shape: Math.floor(rand() * 1000),
			});
		}
		return out;
	});

	/** Clouds near (x, z) in world space, given how far the air has drifted. */
	function near(
		x: number,
		z: number,
		drift: { x: number; z: number },
	): Cloud[] {
		const out: Cloud[] = [];
		forCells(x - drift.x, z - drift.z, c.range, c.cell, (cx, cz) => {
			out.push(...cell(cx, cz));
		});
		return out;
	}

	return { near };
}
