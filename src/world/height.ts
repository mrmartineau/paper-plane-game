// Pure terrain height. No Three.js, so it runs in tests and (later) a worker.
import type { Config } from "../config";
import { fbm, makeNoise, ridged } from "./noise";

export type HeightFn = (x: number, z: number) => number;

export function createHeight(seed: string, w: Config["world"]): HeightFn {
	const base = makeNoise(seed, "base");
	const warpX = makeNoise(seed, "warpX");
	const warpZ = makeNoise(seed, "warpZ");
	const mask = makeNoise(seed, "mountainMask");
	const ridge = makeNoise(seed, "ridge");

	return (x, z) => {
		// Light domain warp so hills don't look like a regular grid.
		const wx = x + warpX(x * w.warpScale, z * w.warpScale) * w.warpAmount;
		const wz = z + warpZ(x * w.warpScale, z * w.warpScale) * w.warpAmount;

		const rolling =
			fbm(
				base,
				wx * w.baseScale,
				wz * w.baseScale,
				w.octaves,
				w.lacunarity,
				w.gain,
			) * w.baseAmplitude;

		// Mountain mask: 0 in lowlands, 1 in ranges, smoothstepped.
		const m = smoothstep(
			0.15,
			0.6,
			mask(x * w.mountainScale, z * w.mountainScale),
		);
		const peaks =
			m *
			ridged(ridge, wx * w.ridgeScale, wz * w.ridgeScale, 4, 2, 0.5) *
			w.ridgeAmplitude;

		return w.baseOffset + rolling + peaks;
	};
}

/**
 * Climate at a point: temperature and moisture in ~[-1, 1].
 * Temperature drops with height so high peaks turn snowy.
 */
export function createClimate(seed: string, w: Config["world"]) {
	const temp = makeNoise(seed, "temperature");
	const moist = makeNoise(seed, "moisture");
	return (x: number, z: number, h: number) => ({
		temperature:
			temp(x * w.climateScale, z * w.climateScale) -
			Math.max(0, h) * w.lapseRate,
		moisture: moist(x * w.climateScale, z * w.climateScale),
	});
}

export type ClimateFn = ReturnType<typeof createClimate>;

function smoothstep(a: number, b: number, t: number): number {
	const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
	return x * x * (3 - 2 * x);
}
