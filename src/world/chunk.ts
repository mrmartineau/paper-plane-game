// Build one terrain chunk as flat-shaded triangles with per-face biome colours.
// Pure: returns typed arrays, no Three.js, so it runs in a worker (see chunkWorker.ts).
// Hot path: no allocations per face.
import type { Config } from "../config";
import { BIOME_IDS, BIOMES, CLIFF, SAND, SEABED } from "./biomes";
import type { ClimateFn, HeightFn } from "./height";

export interface ChunkArrays {
	position: Float32Array;
	color: Float32Array; // linear RGB, one colour per face
}

/** Quads per side for a LOD level: 64, 32, 16. */
export function lodQuads(w: Config["world"], lod: number): number {
	return w.chunkQuads >> lod;
}

/** Hex sRGB → linear RGB (what Three expects in vertex colours). */
export function srgb(hex: number): [number, number, number] {
	const f = (c: number) => {
		const s = c / 255;
		return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	};
	return [f((hex >> 16) & 255), f((hex >> 8) & 255), f(hex & 255)];
}

// Palette in linear RGB, worked out once.
const SAND_L = srgb(SAND);
const SEABED_L = srgb(SEABED);
const CLIFF_L = srgb(CLIFF);
const GROUND_L = BIOME_IDS.map((id) => [
	srgb(BIOMES[id].ground[0]),
	srgb(BIOMES[id].ground[1]),
]);
const SNOW = BIOME_IDS.indexOf("snow");
const MEADOW = BIOME_IDS.indexOf("meadow");
const FOREST = BIOME_IDS.indexOf("forest");
const DESERT = BIOME_IDS.indexOf("desert");

function smoothstep(a: number, b: number, t: number): number {
	const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
	return x * x * (3 - 2 * x);
}

/** Same maths as biomeWeights() in biomes.ts, written into an array (no allocation). */
function biomeWeightsInto(
	temperature: number,
	moisture: number,
	out: Float64Array,
) {
	const snow = smoothstep(-0.25, -0.55, temperature);
	const desert =
		smoothstep(0.05, 0.35, temperature) *
		smoothstep(0.0, -0.3, moisture) *
		(1 - snow);
	const forest = smoothstep(0.0, 0.3, moisture) * (1 - snow) * (1 - desert);
	const meadow = Math.max(0, 1 - snow - desert - forest);
	const sum = snow + desert + forest + meadow;
	out[SNOW] = snow / sum;
	out[DESERT] = desert / sum;
	out[FOREST] = forest / sum;
	out[MEADOW] = meadow / sum;
}

export function buildChunk(
	cx: number,
	cz: number,
	lod: number,
	height: HeightFn,
	climate: ClimateFn,
	w: Config["world"],
): ChunkArrays {
	const n = lodQuads(w, lod);
	const size = w.chunkSize;
	const step = size / n;
	const x0 = cx * size;
	const z0 = cz * size;

	// Height grid
	const hs = new Float32Array((n + 1) * (n + 1));
	for (let j = 0; j <= n; j++) {
		for (let i = 0; i <= n; i++)
			hs[j * (n + 1) + i] = height(x0 + i * step, z0 + j * step);
	}
	const H = (i: number, j: number) => hs[j * (n + 1) + i];

	// Climate noise is very low frequency: sample the 4 corners (at sea level) and blend.
	const c00 = climate(x0, z0, 0);
	const c10 = climate(x0 + size, z0, 0);
	const c01 = climate(x0, z0 + size, 0);
	const c11 = climate(x0 + size, z0 + size, 0);

	const faces = n * n * 2 + 4 * n * 2; // ground + skirts
	const position = new Float32Array(faces * 9);
	const color = new Float32Array(faces * 9);
	const weights = new Float64Array(BIOME_IDS.length);
	let o = 0;
	let r = 0;
	let g = 0;
	let b = 0;

	const put = (x: number, y: number, z: number) => {
		position[o] = x;
		position[o + 1] = y;
		position[o + 2] = z;
		color[o] = r;
		color[o + 1] = g;
		color[o + 2] = b;
		o += 3;
	};

	/** Set r, g, b for a face: seabed / sand by the water, biome blend above, bare rock on cliffs. */
	const shade = (fx: number, fz: number, h: number, normalY: number) => {
		if (h < w.seaLevel - 0.5) {
			[r, g, b] = SEABED_L;
			return;
		}
		if (h < w.seaLevel + 3) {
			[r, g, b] = SAND_L;
			return;
		}
		const u = (fx - x0) / size;
		const v = (fz - z0) / size;
		const temp =
			(c00.temperature * (1 - u) + c10.temperature * u) * (1 - v) +
			(c01.temperature * (1 - u) + c11.temperature * u) * v -
			Math.max(0, h) * w.lapseRate;
		const moist =
			(c00.moisture * (1 - u) + c10.moisture * u) * (1 - v) +
			(c01.moisture * (1 - u) + c11.moisture * u) * v;
		biomeWeightsInto(temp, moist, weights);
		const t = Math.min(1, Math.max(0, h / 220));
		r = 0;
		g = 0;
		b = 0;
		for (let k = 0; k < weights.length; k++) {
			const wgt = weights[k];
			if (wgt < 0.001) continue;
			const lo = GROUND_L[k][0];
			const hi = GROUND_L[k][1];
			r += wgt * (lo[0] + (hi[0] - lo[0]) * t);
			g += wgt * (lo[1] + (hi[1] - lo[1]) * t);
			b += wgt * (lo[2] + (hi[2] - lo[2]) * t);
		}
		// Steep faces fade to bare rock (snow still sticks a bit).
		const cliff =
			Math.min(1, Math.max(0, (w.cliffSlope - normalY) / 0.15)) *
			(1 - weights[SNOW] * 0.6);
		if (cliff > 0) {
			r += (CLIFF_L[0] - r) * cliff;
			g += (CLIFF_L[1] - g) * cliff;
			b += (CLIFF_L[2] - b) * cliff;
		}
	};

	const face = (
		ax: number,
		ay: number,
		az: number,
		bx: number,
		by: number,
		bz: number,
		qx: number,
		qy: number,
		qz: number,
	) => {
		const ux = bx - ax;
		const uy = by - ay;
		const uz = bz - az;
		const vx = qx - ax;
		const vy = qy - ay;
		const vz = qz - az;
		const ny = uz * vx - ux * vz;
		const len = Math.hypot(uy * vz - uz * vy, ny, ux * vy - uy * vx);
		shade(
			(ax + bx + qx) / 3,
			(az + bz + qz) / 3,
			(ay + by + qy) / 3,
			len > 0 ? ny / len : 1,
		);
		put(ax, ay, az);
		put(bx, by, bz);
		put(qx, qy, qz);
	};

	for (let j = 0; j < n; j++) {
		for (let i = 0; i < n; i++) {
			const xa = x0 + i * step;
			const xb = xa + step;
			const za = z0 + j * step;
			const zb = za + step;
			face(xa, H(i, j), za, xa, H(i, j + 1), zb, xb, H(i + 1, j), za);
			face(xb, H(i + 1, j), za, xa, H(i, j + 1), zb, xb, H(i + 1, j + 1), zb);
		}
	}

	// Skirts: a strip down from every edge so cracks between LODs show rock, not sky.
	[r, g, b] = CLIFF_L;
	const s = w.skirt;
	const edge = (
		p1x: number,
		p1z: number,
		h1: number,
		p2x: number,
		p2z: number,
		h2: number,
	) => {
		put(p1x, h1, p1z);
		put(p2x, h2, p2z);
		put(p1x, h1 - s, p1z);
		put(p2x, h2, p2z);
		put(p2x, h2 - s, p2z);
		put(p1x, h1 - s, p1z);
	};
	for (let k = 0; k < n; k++) {
		const a = k * step;
		const c = a + step;
		edge(x0 + a, z0, H(k, 0), x0 + c, z0, H(k + 1, 0));
		edge(x0 + a, z0 + size, H(k, n), x0 + c, z0 + size, H(k + 1, n));
		edge(x0, z0 + a, H(0, k), x0, z0 + c, H(0, k + 1));
		edge(x0 + size, z0 + a, H(n, k), x0 + size, z0 + c, H(n, k + 1));
	}

	return { position, color };
}
