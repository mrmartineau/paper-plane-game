// Plane types: each a different origami fold (triangles, nose at -Z) with its own
// paper tint and handling (overrides on config.flight). Pure, no Three.js.
import type { Config } from "../config";

type P = [number, number, number];
type Rgb = [number, number, number];
export type Tri = [P, P, P, Rgb];

export type PlaneId = "dart" | "glider" | "arrow" | "stunt" | "crane";

export interface PlaneType {
	id: PlaneId;
	name: string;
	blurb: string;
	tris: Tri[];
	flight: Partial<Config["flight"]>;
	animal?: boolean; // a paper animal: lands anywhere and runs (see run.ts)
}

const shade = (c: Rgb, k: number): Rgb => [c[0] * k, c[1] * k, c[2] * k];
const mirror = (p: P): P => [-p[0], p[1], p[2]];

/** Build a symmetric fold from the left-hand triangles (+ any centre ones). */
function fold(left: Tri[], centre: Tri[]): Tri[] {
	const right = left.map(
		([a, b, c, col]): Tri => [mirror(a), mirror(c), mirror(b), col],
	); // flip winding too
	return [...left, ...right, ...centre];
}

function dart(): Tri[] {
	const W: Rgb = [0.97, 0.96, 0.93];
	const N: P = [0, 0, -1];
	const T: P = [0, 0.02, 0.6];
	return fold(
		[
			[N, [-0.6, 0.1, 0.6], [-0.18, 0.03, 0.6], W], // outer wing
			[N, [-0.18, 0.03, 0.6], T, shade(W, 0.91)], // inner panel
			[N, T, [-0.03, -0.2, 0.6], shade(W, 0.83)], // keel
		],
		[],
	);
}

function glider(): Tri[] {
	const W: Rgb = [0.86, 0.95, 0.9]; // mint
	const N: P = [0, 0, -0.85];
	const T: P = [0, 0.02, 0.75];
	const tip: P = [-1.15, 0.16, 0.2];
	const trail: P = [-1, 0.14, 0.5];
	const root: P = [-0.2, 0.03, 0.6];
	return fold(
		[
			[N, tip, trail, W],
			[N, trail, root, shade(W, 0.95)],
			[N, root, T, shade(W, 0.88)],
			[N, T, [-0.02, -0.12, 0.55], shade(W, 0.8)],
		],
		[[T, [0, 0.34, 0.82], [0, 0.02, 0.42], shade(W, 0.88)]], // tail fin
	);
}

function arrow(): Tri[] {
	const W: Rgb = [0.86, 0.9, 0.98]; // pale blue
	const N: P = [0, 0, -1.35];
	const T: P = [0, 0.02, 0.6];
	const tip: P = [-0.42, 0.04, 0.6];
	return fold(
		[
			[N, tip, [-0.1, 0.02, 0.6], W],
			[N, [-0.1, 0.02, 0.6], T, shade(W, 0.9)],
			[N, T, [-0.02, -0.3, 0.55], shade(W, 0.8)], // deep keel
			[tip, [-0.32, 0.24, 0.66], [-0.3, 0.04, 0.32], shade(W, 0.75)], // fin
		],
		[],
	);
}

function stunt(): Tri[] {
	const W: Rgb = [0.98, 0.88, 0.84]; // pale coral
	const N: P = [0, 0, -0.75];
	const T: P = [0, 0.04, 0.6];
	const la: P = [-0.1, 0.02, -0.25]; // leading root
	const lb: P = [-0.9, 0.06, -0.1]; // leading tip
	const lc: P = [-0.9, 0.06, 0.45]; // trailing tip
	const ld: P = [-0.1, 0.02, 0.55]; // trailing root
	return fold(
		[
			[la, lb, lc, W], // square wing
			[la, lc, ld, shade(W, 0.95)],
			[N, la, ld, shade(W, 0.9)], // body panel
			[N, ld, T, shade(W, 0.86)],
			[lc, [-0.92, 0.32, 0.35], [-0.9, 0.06, 0.1], shade(W, 0.78)], // winglet
		],
		[[N, T, [0, -0.18, 0.4], shade(W, 0.8)]], // keel
	);
}

/** Colour that marks leg triangles, so the model can swing them when running. */
export const LEG: Rgb = [0.93, 0.6, 0.45];

/** Origami crane: body, long neck, beak, tail fin, flapping wings, and legs that run. */
function crane(): Tri[] {
	const W: Rgb = [0.98, 0.97, 0.94];
	const RED: Rgb = [0.92, 0.5, 0.42];
	const F: P = [0, 0.15, -0.35]; // chest
	const B: P = [0, 0.12, 0.5]; // rump
	const T: P = [0, 0.3, 0.05]; // back
	const U: P = [0, -0.12, 0.05]; // belly
	const L: P = [-0.2, 0.08, 0.05];
	return fold(
		[
			[F, L, T, W],
			[L, B, T, shade(W, 0.93)],
			[F, U, L, shade(W, 0.85)],
			[L, U, B, shade(W, 0.8)],
			// wings: inner panel and a coloured outer tip
			[[-0.12, 0.2, -0.15], [-0.7, 0.3, 0.02], [-0.12, 0.18, 0.3], W],
			[[-0.7, 0.3, 0.02], [-1.05, 0.36, 0.1], [-0.85, 0.3, 0.42], RED],
			[
				[-0.12, 0.18, 0.3],
				[-0.7, 0.3, 0.02],
				[-0.85, 0.3, 0.42],
				shade(W, 0.92),
			],
			// legs (thin, hanging): upper leg, then a foot
			[[-0.1, 0.0, 0.15], [-0.15, 0.0, 0.15], [-0.1, -0.55, 0.1], LEG],
			[[-0.1, -0.55, 0.1], [-0.15, -0.55, 0.1], [-0.12, -0.57, -0.12], LEG],
		],
		[
			[F, [0, 0.3, -0.2], [0, 0.6, -0.72], shade(W, 0.96)], // neck
			[
				[0, 0.6, -0.72],
				[0, 0.68, -0.78],
				[0, 0.55, -1.08],
				[0.97, 0.6, 0.4],
			], // head and beak
			[B, T, [0, 0.42, 0.9], shade(W, 0.9)], // tail
		],
	);
}

export const PLANES: Record<PlaneId, PlaneType> = {
	dart: {
		id: "dart",
		name: "Dart",
		blurb: "Balanced all-rounder",
		tris: dart(),
		flight: {},
	},
	glider: {
		id: "glider",
		name: "Glider",
		blurb: "Wide wings, floats for ages, gentle turns",
		tris: glider(),
		flight: {
			drag: 0.0026,
			glidePitch: -0.07,
			stallSpeed: 9.5,
			liftCoeff: 0.09,
			rollRate: 1.8,
			pitchRate: 1.3,
			turnCoeff: 0.04,
			boost: 26,
			boostMaxSpeed: 80,
		},
	},
	arrow: {
		id: "arrow",
		name: "Arrow",
		blurb: "Fast and sharp, sinks quicker",
		tris: arrow(),
		flight: {
			drag: 0.0028,
			glidePitch: -0.14,
			stallSpeed: 14,
			liftCoeff: 0.055,
			rollRate: 3.2,
			pitchRate: 1.9,
			turnCoeff: 0.05,
			maxSpeed: 75,
			boost: 40,
			boostMaxSpeed: 115,
		},
	},
	stunt: {
		id: "stunt",
		name: "Stunt",
		blurb: "Square wings: flips, rolls and tight loops",
		tris: stunt(),
		flight: {
			drag: 0.0045,
			glidePitch: -0.12,
			rollRate: 4,
			pitchRate: 2.4,
			turnCoeff: 0.06,
			boostAgility: 1,
		},
	},
	crane: {
		id: "crane",
		name: "Paper crane",
		blurb: "Flies like a glider, lands anywhere and runs",
		tris: crane(),
		animal: true,
		flight: {
			drag: 0.0028,
			glidePitch: -0.09,
			stallSpeed: 10,
			liftCoeff: 0.085,
			rollRate: 2.2,
			pitchRate: 1.5,
			turnCoeff: 0.04,
			boost: 28,
			boostMaxSpeed: 85,
		},
	},
};

/** The fliers you can pick from (paper animals are a separate setting). */
export const PLANE_IDS = (Object.keys(PLANES) as PlaneId[]).filter(
	(id) => !PLANES[id].animal,
);
export const ANIMAL_ID: PlaneId = "crane";

export function randomPlane(): PlaneId {
	return PLANE_IDS[Math.floor(Math.random() * PLANE_IDS.length)];
}
