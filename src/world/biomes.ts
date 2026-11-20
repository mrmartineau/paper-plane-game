// Biome definitions: palette, prop density, thermal bias. Pure data + maths, no Three.js.

export type BiomeId = "meadow" | "forest" | "desert" | "snow";
export const BIOME_IDS: BiomeId[] = ["meadow", "forest", "desert", "snow"];

export type Weights = Record<BiomeId, number>;

export interface BiomeDef {
	ground: [number, number]; // cardstock colour low → high
	trees: number; // tree tries accepted, 0..1
	treeKinds: Partial<Record<TreeKind, number>>; // relative odds
	rocks: number; // rock chance per 32m cell
	houses: number; // village chance per chunk
	thermals: number; // relative chance an air column is a thermal here
}

export type TreeKind = "pine" | "tallPine" | "round" | "snowPine" | "cactus";

export const BIOMES: Record<BiomeId, BiomeDef> = {
	meadow: {
		ground: [0x9fbf7f, 0xb7c487],
		trees: 0.1,
		treeKinds: { round: 0.65, pine: 0.35 },
		rocks: 0.06,
		houses: 0.12,
		thermals: 1,
	},
	forest: {
		ground: [0x7fa565, 0x8fae6c],
		trees: 0.9,
		treeKinds: { pine: 0.55, tallPine: 0.35, round: 0.1 },
		rocks: 0.05,
		houses: 0,
		thermals: 0.5,
	},
	desert: {
		ground: [0xe2c793, 0xd6a96f],
		trees: 0.05,
		treeKinds: { cactus: 1 },
		rocks: 0.22,
		houses: 0.02,
		thermals: 1.4,
	},
	snow: {
		ground: [0xeef0ec, 0xfbfbf7],
		trees: 0.18,
		treeKinds: { snowPine: 1 },
		rocks: 0.12,
		houses: 0,
		thermals: 0.3,
	},
};

export const SAND = 0xd9c9a3;
export const SEABED = 0xb9c6a6;
export const CLIFF = 0x9a948a;

function smoothstep(a: number, b: number, t: number): number {
	const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
	return x * x * (3 - 2 * x);
}

/**
 * Soft biome weights from temperature and moisture (both ~[-1, 1]).
 * Weights sum to 1 so colours and densities blend across borders.
 */
export function biomeWeights(temperature: number, moisture: number): Weights {
	const snow = smoothstep(-0.25, -0.55, temperature);
	const desert =
		smoothstep(0.05, 0.35, temperature) *
		smoothstep(0.0, -0.3, moisture) *
		(1 - snow);
	const forest = smoothstep(0.0, 0.3, moisture) * (1 - snow) * (1 - desert);
	const meadow = Math.max(0, 1 - snow - desert - forest);
	const sum = snow + desert + forest + meadow;
	return {
		meadow: meadow / sum,
		forest: forest / sum,
		desert: desert / sum,
		snow: snow / sum,
	};
}

/** Blend any per-biome number by the weights. */
export function blend(w: Weights, pick: (b: BiomeDef) => number): number {
	let v = 0;
	for (const id of BIOME_IDS) v += w[id] * pick(BIOMES[id]);
	return v;
}

/** The biome with the most weight. */
export function dominant(w: Weights): BiomeId {
	let best: BiomeId = "meadow";
	for (const id of BIOME_IDS) if (w[id] > w[best]) best = id;
	return best;
}
