// Seeded columns of rising (thermal) and sinking air. Pure maths, no Three.js.
import type { Config } from "../config";
import { rngFor } from "../core/rng";

export interface AirColumn {
	id: number;
	x: number;
	z: number;
	base: number; // ground height under the centre
	top: number; // height of the column above base
	radius: number;
	strength: number; // m/s at the centre; negative = sinking air
}

export type AirConfig = Config["air"];

export function createAir(
	seed: string,
	groundAt: (x: number, z: number) => number,
	a: AirConfig,
) {
	// ponytail: cache never evicts; fine at phase 1 scale, evict with chunk unload in phase 2.
	const cache = new Map<string, AirColumn[]>();

	function cell(cx: number, cz: number): AirColumn[] {
		const key = `${cx},${cz}`;
		let cols = cache.get(key);
		if (cols) return cols;
		const rand = rngFor(seed, "air", cx, cz);
		const n = Math.floor(rand() * (a.maxPerCell + 1));
		cols = [];
		for (let i = 0; i < n; i++) {
			const x = (cx + rand()) * a.cellSize;
			const z = (cz + rand()) * a.cellSize;
			const down = rand() < a.downChance;
			const strength = down
				? -lerp(a.downMin, a.downMax, rand())
				: lerp(a.upMin, a.upMax, rand());
			cols.push({
				id: (cx * 73856093) ^ (cz * 19349663) ^ i,
				x,
				z,
				base: groundAt(x, z),
				top: lerp(a.topMin, a.topMax, rand()),
				radius: lerp(a.radiusMin, a.radiusMax, rand()),
				strength,
			});
		}
		cache.set(key, cols);
		return cols;
	}

	function columnsNear(x: number, z: number, range: number): AirColumn[] {
		const out: AirColumn[] = [];
		const r = Math.ceil(range / a.cellSize);
		const cx = Math.floor(x / a.cellSize);
		const cz = Math.floor(z / a.cellSize);
		for (let i = -r; i <= r; i++) {
			for (let j = -r; j <= r; j++) {
				for (const c of cell(cx + i, cz + j)) {
					if ((c.x - x) ** 2 + (c.z - z) ** 2 < range * range) out.push(c);
				}
			}
		}
		return out;
	}

	/** Vertical air speed (m/s) at a point. Smooth radial falloff, fades at the top. */
	function airAt(x: number, y: number, z: number): number {
		let w = 0;
		for (const c of columnsNear(x, z, a.radiusMax)) {
			const d2 = ((x - c.x) ** 2 + (z - c.z) ** 2) / (c.radius * c.radius);
			if (d2 >= 1) continue;
			const h = (y - c.base) / c.top;
			if (h < 0 || h > 1) continue;
			const radial = 1 - smoothstep(a.core, 1, Math.sqrt(d2));
			let vertical = 1 - smoothstep(0.75, 1, h);
			// Sinking air eases off near the ground so it pushes you down without slamming you in.
			if (c.strength < 0) vertical *= smoothstep(0, 0.2, h);
			w += c.strength * radial * vertical;
		}
		return w;
	}

	return { airAt, columnsNear };
}

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

function smoothstep(a: number, b: number, t: number): number {
	const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
	return x * x * (3 - 2 * x);
}
