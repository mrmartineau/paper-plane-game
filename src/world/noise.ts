import alea from "alea";
import { createNoise2D, type NoiseFunction2D } from "simplex-noise";

export type Noise2D = NoiseFunction2D;

/** Seeded 2D simplex. `salt` gives independent fields from one seed. */
export function makeNoise(seed: string, salt: string): Noise2D {
	return createNoise2D(alea(`${seed}:${salt}`));
}

/** Fractal Brownian motion, roughly in [-1, 1]. */
export function fbm(
	noise: Noise2D,
	x: number,
	z: number,
	octaves: number,
	lacunarity: number,
	gain: number,
): number {
	let sum = 0;
	let amp = 1;
	let freq = 1;
	let norm = 0;
	for (let i = 0; i < octaves; i++) {
		sum += noise(x * freq, z * freq) * amp;
		norm += amp;
		amp *= gain;
		freq *= lacunarity;
	}
	return sum / norm;
}

/** Ridged multifractal, in [0, 1]. Sharp crests where the noise crosses zero. */
export function ridged(
	noise: Noise2D,
	x: number,
	z: number,
	octaves: number,
	lacunarity: number,
	gain: number,
): number {
	let sum = 0;
	let amp = 1;
	let freq = 1;
	let norm = 0;
	for (let i = 0; i < octaves; i++) {
		const r = 1 - Math.abs(noise(x * freq, z * freq));
		sum += r * r * amp;
		norm += amp;
		amp *= gain;
		freq *= lacunarity;
	}
	return sum / norm;
}
