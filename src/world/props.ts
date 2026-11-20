// Seeded world features, generated per cell so the world never ends:
// trees, rocks and houses (per terrain chunk), arches, hoops, floating islands,
// floating mountains (with trees, waterfalls, vines). Plus their collision.
// Pure: no Three.js. Shape sizes live in SHAPES so meshes and colliders match.
import type { Config } from "../config";
import { forCells, memoCells } from "../core/memo";
import { rngFor } from "../core/rng";
import {
	BIOMES,
	biomeWeights,
	blend,
	type TreeKind,
	type Weights,
} from "./biomes";
import type { ClimateFn, HeightFn } from "./height";

export type { TreeKind } from "./biomes";

/** Unit sizes in metres at scale 1. Cones: [radius, height, baseY]. */
export const SHAPES = {
	pine: {
		trunk: { r: 0.45, h: 2.5 },
		cones: [
			[3.2, 4.5, 2],
			[2.5, 4, 4.6],
			[1.7, 3.5, 7.2],
		],
	},
	tallPine: {
		trunk: { r: 0.55, h: 5 },
		cones: [
			[2.6, 6, 4],
			[2.2, 5.5, 8.5],
			[1.8, 5, 12.5],
			[1.3, 4.5, 16],
		],
	},
	round: { trunk: { r: 0.4, h: 3 }, canopy: { r: 2.8, y: 5 } },
	cactus: { r: 0.5, h: 6, arm: { y: 2.6, out: 1.1, h: 2.2, r: 0.32 } },
	house: { w: 5, d: 7, h: 3.5, roof: 2.6 },
	arch: { R: 20, r: 4.5 }, // ring radius to the tube centre, tube radius
	// Floating island at radius 1: grass cap on top, rock body, a spike hanging below.
	skyRock: {
		body: 1,
		spikeR: 0.6,
		spikeTop: -0.3,
		spikeLen: 1.8,
		capTop: 0.675,
		capRadius: 0.85,
	},
	// Floating mountain at unit size: flat grassy top at y = 0, radius 1, tapering to a point at y = -1.
	// [radius, y] from the top edge down to the tip. Scaled by (R, H, R).
	floater: {
		profile: [
			[1, -0.06],
			[0.93, -0.28],
			[0.78, -0.52],
			[0.5, -0.78],
			[0.12, -0.97],
			[0, -1],
		],
	},
} as const;

export interface Tree {
	kind: TreeKind;
	x: number;
	y: number;
	z: number;
	s: number;
	yaw: number;
	tint: number;
}

export interface Rock {
	x: number;
	y: number;
	z: number;
	sx: number;
	sy: number;
	sz: number;
	yaw: number;
	tint: number;
}

export interface House {
	x: number;
	y: number;
	z: number;
	s: number;
	yaw: number;
	roof: number; // palette index
}

export interface Arch {
	kind: "arch" | "ring"; // arch: a bridge with both feet in the ground; ring: a standing hoop of rock
	x: number;
	y: number; // centre of the ring
	z: number;
	yaw: number; // fly along local Z to go through the hole
	s: number;
}

/** A floating rock island with a spike hanging under it. */
export interface SkyRock {
	x: number;
	y: number; // body centre
	z: number;
	s: number; // body radius, metres
	yaw: number;
	tint: number;
}

/** A floating mountain: grassy top at y, radius R, a body H tall tapering to a point. */
export interface Floater {
	x: number;
	y: number; // top surface
	z: number;
	R: number;
	H: number;
	yaw: number;
	tint: number;
}

/** A thick vine hanging from a floating island. */
export interface Vine {
	x: number;
	top: number;
	z: number;
	length: number;
	r: number;
	phase: number;
}

/** A waterfall pouring off a floating mountain's edge, fading out in mid-air. Not solid. */
export interface Waterfall {
	x: number;
	y: number; // top
	z: number;
	yaw: number; // faces outward from the mountain (local +Z)
	width: number;
	length: number;
}

/** A paper hoop: floating in the air, or standing on a pole. Fly along local Z through it. */
export interface Hoop {
	id: string;
	kind: "float" | "pole";
	x: number;
	y: number; // centre
	z: number;
	yaw: number;
	R: number; // ring radius to the tube centre
	r: number; // tube radius
	base: number; // ground height under the centre (the pole's foot)
	color: number; // palette index
}

type Collider = { x: number; z: number; reach: number } & (
	| {
			type: "cone";
			base: number;
			y0: number;
			y1: number;
			r0: number;
			trunk: number;
	  }
	| { type: "sphere"; y: number; r: number; base: number; trunk: number }
	| { type: "torus"; y: number; c: number; s: number; R: number; r: number }
	| { type: "spike"; top: number; bottom: number; r0: number } // r0 at the top, a point at the bottom
	| { type: "pole"; base: number; top: number; r: number }
);

export interface GroundCell {
	trees: Tree[];
	rocks: Rock[];
	houses: House[];
	colliders: Collider[];
}
export interface ArchCell {
	arch: Arch | null;
	colliders: Collider[];
}
export interface HoopCell {
	hoop: Hoop | null;
	colliders: Collider[];
}
/** A flat grassy top you can land on. */
export interface Pad {
	x: number;
	y: number; // surface height
	z: number;
	r: number; // usable radius
}

export interface SkyCell {
	rocks: SkyRock[];
	vines: Vine[];
	pads: Pad[];
	colliders: Collider[];
}
export interface FloaterCell {
	floaters: Floater[];
	trees: Tree[];
	waterfalls: Waterfall[];
	vines: Vine[];
	pads: Pad[];
	colliders: Collider[];
}

/** Height of a floating mountain's underside at a fraction (0 centre .. 1 edge) of its radius. */
export function floaterUnderside(fraction: number): number {
	const pts = SHAPES.floater.profile;
	for (let i = 0; i < pts.length - 1; i++) {
		const [r0, y0] = pts[i];
		const [r1, y1] = pts[i + 1];
		if (fraction <= r0 && fraction >= r1)
			return y1 + ((y0 - y1) * (fraction - r1)) / (r0 - r1);
	}
	return -1;
}

export type PropsConfig = Config["props"];

export function createFeatures(
	seed: string,
	height: HeightFn,
	climate: ClimateFn,
	p: PropsConfig,
	w: Config["world"],
) {
	const sea = w.seaLevel;
	const f = p.collisionFactor;
	const ground = (x: number, z: number) => Math.max(height(x, z), sea);
	const slope = (x: number, z: number) =>
		Math.hypot(
			height(x + 1, z) - height(x - 1, z),
			height(x, z + 1) - height(x, z - 1),
		) / 2;
	const biomeAt = (x: number, z: number): Weights => {
		const c = climate(x, z, height(x, z));
		return biomeWeights(c.temperature, c.moisture);
	};

	// --- Arches ---
	const archCell = memoCells((cx, cz): ArchCell => {
		const rand = rngFor(seed, "arch", cx, cz);
		if (rand() > p.archChance) return { arch: null, colliders: [] };
		for (let tries = 0; tries < 8; tries++) {
			const x = (cx + rand()) * p.archCell;
			const z = (cz + rand()) * p.archCell;
			const yaw = rand() * Math.PI;
			const s = lerp(p.archScaleMin, p.archScaleMax, rand());
			const ring = rand() < p.ringChance;
			const R = SHAPES.arch.R * s;
			const fx = Math.cos(yaw) * R; // the feet sit at local ±X
			const fz = -Math.sin(yaw) * R;
			const h0 = height(x, z);
			const h1 = height(x + fx, z + fz);
			const h2 = height(x - fx, z - fz);
			if (Math.min(h0, h1, h2) < sea + 2 || Math.abs(h1 - h2) > 5) continue;
			const y = ring ? h0 + R * 0.55 : Math.max(h1, h2) + 0.5;
			if (!ring && h0 > y + 2) continue; // a hump would block the hole
			if (ring && Math.abs(h1 - h0) > 8) continue;
			const arch: Arch = { kind: ring ? "ring" : "arch", x, y, z, yaw, s };
			const r = SHAPES.arch.r * s;
			return {
				arch,
				colliders: [
					{
						type: "torus",
						x,
						y,
						z,
						c: Math.cos(yaw),
						s: Math.sin(yaw),
						R,
						r: r * f,
						reach: R + r,
					},
				],
			};
		}
		return { arch: null, colliders: [] };
	});

	// --- Hoops ---
	const hoopCell = memoCells((cx, cz): HoopCell => {
		const rand = rngFor(seed, "hoop", cx, cz);
		if (rand() > p.hoopChance) return { hoop: null, colliders: [] };
		for (let tries = 0; tries < 6; tries++) {
			const x = (cx + rand()) * p.hoopCell;
			const z = (cz + rand()) * p.hoopCell;
			const yaw = rand() * Math.PI * 2;
			const R = lerp(p.hoopRadiusMin, p.hoopRadiusMax, rand());
			const pole = rand() < p.poleChance;
			const lift = pole
				? lerp(p.poleMin, p.poleMax, rand())
				: lerp(p.floatMin, p.floatMax, rand());
			const color = Math.floor(rand() * 1000);
			const base = height(x, z);
			if (pole && base < sea + 1) continue; // no poles in the sea
			const ex = Math.cos(yaw) * R; // clear the ground under both sides of the ring
			const ez = -Math.sin(yaw) * R;
			const y =
				Math.max(base, height(x + ex, z + ez), height(x - ex, z - ez), sea) +
				lift +
				R;
			// The approach lane (both ways) must be clear of hills, or you can't line up a run.
			let blocked = false;
			for (let d = -p.hoopLane; d <= p.hoopLane && !blocked; d += 10) {
				blocked =
					height(x + Math.sin(yaw) * d, z + Math.cos(yaw) * d) > y - R * 0.5;
			}
			if (blocked) continue;
			const r = R * p.hoopTube;
			const hoop: Hoop = {
				id: `${cx},${cz}`,
				kind: pole ? "pole" : "float",
				x,
				y,
				z,
				yaw,
				R,
				r,
				base,
				color,
			};
			const colliders: Collider[] = [
				{
					type: "torus",
					x,
					y,
					z,
					c: Math.cos(yaw),
					s: Math.sin(yaw),
					R,
					r: r * f,
					reach: R + r,
				},
			];
			if (pole)
				colliders.push({
					type: "pole",
					x,
					z,
					base,
					top: y - R,
					r: p.poleRadius,
					reach: p.poleRadius,
				});
			return { hoop, colliders };
		}
		return { hoop: null, colliders: [] };
	});

	// Keep a clear lane through each arch and hoop (along its local Z) so you can line up a run.
	const archReach = p.archLane + SHAPES.arch.R * p.archScaleMax + 10;
	const hoopReach = p.hoopLane + p.hoopRadiusMax + 6;
	interface Lane {
		x: number;
		z: number;
		c: number;
		s: number;
		half: number;
		length: number;
	}
	/** Every arch and hoop lane that could touch a point within `extra` metres of (x, z). */
	const lanesNear = (x: number, z: number, extra: number): Lane[] => {
		const out: Lane[] = [];
		forCells(x, z, archReach + extra, p.archCell, (cx, cz) => {
			const a = archCell(cx, cz).arch;
			if (a)
				out.push({
					x: a.x,
					z: a.z,
					c: Math.cos(a.yaw),
					s: Math.sin(a.yaw),
					half: SHAPES.arch.R * a.s + 10,
					length: p.archLane,
				});
		});
		forCells(x, z, hoopReach + extra, p.hoopCell, (cx, cz) => {
			const h = hoopCell(cx, cz).hoop;
			if (h)
				out.push({
					x: h.x,
					z: h.z,
					c: Math.cos(h.yaw),
					s: Math.sin(h.yaw),
					half: h.R + 6,
					length: p.hoopLane,
				});
		});
		return out;
	};
	const inLanes = (lanes: Lane[], x: number, z: number) =>
		lanes.some((l) => {
			const dx = x - l.x;
			const dz = z - l.z;
			return (
				Math.abs(l.c * dx - l.s * dz) < l.half &&
				Math.abs(l.s * dx + l.c * dz) < l.length
			);
		});
	const inLane = (x: number, z: number) => inLanes(lanesNear(x, z, 0), x, z);

	// --- Small floating islands, some trailing vines ---
	const sk = SHAPES.skyRock;
	const skyCell = memoCells((cx, cz): SkyCell => {
		const out: SkyCell = { rocks: [], vines: [], pads: [], colliders: [] };
		const rand = rngFor(seed, "skyRock", cx, cz);
		if (rand() > p.skyRockChance) return out;
		const ax = (cx + rand()) * p.skyRockCell;
		const az = (cz + rand()) * p.skyRockCell;
		const lift = lerp(p.skyRockLiftMin, p.skyRockLiftMax, rand());
		const count = 1 + Math.floor(rand() * 3); // a big one plus a few smaller ones nearby
		for (let i = 0; i < count; i++) {
			const s = lerp(p.skyRockMin, p.skyRockMax, rand()) * (i === 0 ? 1 : 0.5);
			const x = ax + (i === 0 ? 0 : (rand() - 0.5) * 80);
			const z = az + (i === 0 ? 0 : (rand() - 0.5) * 80);
			const y = ground(x, z) + lift + (i === 0 ? 0 : (rand() - 0.5) * 30);
			const yaw = rand() * Math.PI * 2;
			const tint = lerp(0.9, 1.1, rand());
			const nVines = Math.floor(rand() * 4);
			const bottom = y + (sk.spikeTop - sk.spikeLen) * s;
			if (bottom < ground(x, z) + 15 || inLane(x, z)) continue;
			out.rocks.push({ x, y, z, s, yaw, tint });
			out.pads.push({ x, y: y + sk.capTop * s, z, r: sk.capRadius * s });
			out.colliders.push(
				// The rock ball stays under the grassy cap, so you can land on it.
				{
					type: "sphere",
					x,
					y: y - 0.15 * s,
					z,
					r: 0.7 * s,
					base: y,
					trunk: 0,
					reach: s,
				},
				{
					type: "spike",
					x,
					z,
					top: y + sk.spikeTop * s,
					bottom,
					r0: sk.spikeR * s * f,
					reach: sk.spikeR * s,
				},
			);
			for (let j = 0; j < nVines; j++) {
				const a = rand() * Math.PI * 2;
				const d = rand() * 0.5 * s;
				const length = s * lerp(1.5, 4, rand());
				const vx = x + Math.cos(a) * d;
				const vz = z + Math.sin(a) * d;
				const r = lerp(0.25, 0.5, rand()) * Math.min(2, s / 6);
				const phase = rand() * 6;
				const top = y - 0.3 * s;
				if (top - length < ground(vx, vz) + 8) continue;
				addVine(out, { x: vx, top, z: vz, length, r, phase });
			}
		}
		return out;
	});

	function addVine(out: { vines: Vine[]; colliders: Collider[] }, v: Vine) {
		out.vines.push(v);
		out.colliders.push({
			type: "pole",
			x: v.x,
			z: v.z,
			base: v.top - v.length,
			top: v.top,
			r: v.r * f,
			reach: v.r,
		});
	}

	// --- Floating mountains (the big ones), with trees, waterfalls and vines ---
	const floaterCell = memoCells((cx, cz): FloaterCell => {
		const out: FloaterCell = {
			floaters: [],
			trees: [],
			waterfalls: [],
			vines: [],
			pads: [],
			colliders: [],
		};
		const rand = rngFor(seed, "floater", cx, cz);
		if (rand() > p.floaterChance) return out;
		const ax = (cx + rand()) * p.floaterCell;
		const az = (cz + rand()) * p.floaterCell;
		const top = lerp(p.floaterLiftMin, p.floaterLiftMax, rand());
		const count = 1 + Math.floor(rand() * 3); // often a group, like a mountain range in the sky
		for (let i = 0; i < count; i++) {
			const shrink = i === 0 ? 1 : lerp(0.4, 0.7, rand());
			const R = lerp(p.floaterRadiusMin, p.floaterRadiusMax, rand()) * shrink;
			const H = R * lerp(2.2, 3.4, rand()); // tall pillars, not bowls
			const a0 = rand() * Math.PI * 2;
			const dist = i === 0 ? 0 : lerp(90, 180, rand());
			const x = ax + Math.cos(a0) * dist;
			const z = az + Math.sin(a0) * dist;
			let under = ground(x, z);
			for (let a = 0; a < Math.PI * 2; a += Math.PI / 3) {
				under = Math.max(
					under,
					ground(x + Math.cos(a) * R, z + Math.sin(a) * R),
				);
			}
			const y = Math.max(
				under + top + (i === 0 ? 0 : (rand() - 0.5) * 60),
				under + H + 30,
			);
			const yaw = rand() * Math.PI * 2;
			const tint = lerp(0.9, 1.08, rand());
			const nTrees = Math.floor(R / 5);
			const nFalls = Math.floor(rand() * (p.waterfallsMax + 1));
			const nVines = Math.floor(lerp(p.vinesMin, p.vinesMax, rand()) * shrink);
			let blocked = inLane(x, z);
			for (let a = 0; a < Math.PI * 2 && !blocked; a += Math.PI / 2) {
				blocked = inLane(x + Math.cos(a) * R, z + Math.sin(a) * R);
			}
			if (blocked) continue;
			out.floaters.push({ x, y, z, R, H, yaw, tint });
			out.pads.push({ x, y, z, r: R * 0.9 });
			// The body tapers to a point: a hanging cone from the top edge to the tip.
			out.colliders.push({
				type: "spike",
				x,
				z,
				top: y,
				bottom: y - H,
				r0: R * f,
				reach: R,
			});

			for (let t = 0; t < nTrees; t++) {
				const ta = rand() * Math.PI * 2;
				const td = Math.sqrt(rand()) * R * 0.8;
				const pick = rand();
				const tree: Tree = {
					kind: pick < 0.4 ? "tallPine" : pick < 0.75 ? "pine" : "round",
					x: x + Math.cos(ta) * td,
					y: y - 0.3,
					z: z + Math.sin(ta) * td,
					s: lerp(0.9, 1.4, rand()),
					yaw: rand() * Math.PI * 2,
					tint: lerp(0.85, 1.1, rand()),
				};
				out.trees.push(tree);
				out.colliders.push(treeCollider(tree));
			}
			for (let k = 0; k < nFalls; k++) {
				const wa = rand() * Math.PI * 2;
				out.waterfalls.push({
					x: x + Math.cos(wa) * (R + 0.5),
					y: y - 0.5,
					z: z + Math.sin(wa) * (R + 0.5),
					yaw: Math.atan2(Math.cos(wa), Math.sin(wa)), // local +Z points outward
					width: lerp(0.3, 0.55, rand()) * R,
					length: H * lerp(1.2, 2, rand()),
				});
			}
			for (let k = 0; k < nVines; k++) {
				const va = rand() * Math.PI * 2;
				const fr = lerp(0.25, 0.85, rand());
				const vx = x + Math.cos(va) * fr * R;
				const vz = z + Math.sin(va) * fr * R;
				const vtop = y + floaterUnderside(fr) * H + 2; // tuck the top into the rock
				const length = H * lerp(0.4, 1.3, rand());
				const r = lerp(0.6, 1.3, rand());
				const phase = rand() * 6;
				if (vtop - length < ground(vx, vz) + 12) continue;
				addVine(out, { x: vx, top: vtop, z: vz, length, r, phase });
			}
		}
		return out;
	});

	// --- Trees, rocks and houses per terrain chunk, chosen by biome ---
	const groundCell = memoCells((cx, cz): GroundCell => {
		const out: GroundCell = { trees: [], rocks: [], houses: [], colliders: [] };
		const size = w.chunkSize;
		const lanes = lanesNear((cx + 0.5) * size, (cz + 0.5) * size, size * 0.75); // once per chunk
		const blocked = (x: number, z: number) => inLanes(lanes, x, z);
		const sub = Math.round(size / p.cell);
		for (let i = 0; i < sub; i++) {
			for (let j = 0; j < sub; j++) {
				const gx = cx * sub + i; // global sub-cell index
				const gz = cz * sub + j;
				const rand = rngFor(seed, "props", gx, gz);
				const weights = biomeAt((gx + 0.5) * p.cell, (gz + 0.5) * p.cell);
				const density = blend(weights, (b) => b.trees);
				for (let t = 0; t < p.treeTries; t++) {
					const x = (gx + rand()) * p.cell;
					const z = (gz + rand()) * p.cell;
					const accept = rand() < density;
					const kind = pickKind(weights, rand());
					const s = lerp(0.8, 1.3, rand());
					const yaw = rand() * Math.PI * 2;
					const tint = lerp(0.85, 1.1, rand());
					if (!accept) continue;
					const h = height(x, z);
					if (
						h < sea + p.beach ||
						h > p.treeLine ||
						slope(x, z) > p.maxSlope ||
						blocked(x, z)
					)
						continue;
					const tree: Tree = {
						kind,
						x,
						y: h - 0.4,
						z,
						s: kind === "tallPine" ? s * 1.3 : s,
						yaw,
						tint,
					};
					out.trees.push(tree);
					out.colliders.push(treeCollider(tree));
				}

				const x = (gx + rand()) * p.cell;
				const z = (gz + rand()) * p.cell;
				const chance = rand();
				const rs = lerp(p.rockMin, p.rockMax, rand() ** 2);
				const rx = rs * lerp(0.8, 1.3, rand());
				const ry = rs * lerp(0.5, 0.9, rand());
				const rz = rs * lerp(0.8, 1.3, rand());
				const yaw = rand() * Math.PI * 2;
				const tint = lerp(0.85, 1.1, rand());
				const h = height(x, z);
				const want = blend(weights, (b) => b.rocks) + slope(x, z) * 0.3; // more on steep ground
				if (chance < want && h > sea - 1 && !blocked(x, z)) {
					const rock = {
						x,
						y: h - ry * 0.3,
						z,
						sx: rx,
						sy: ry,
						sz: rz,
						yaw,
						tint,
					};
					out.rocks.push(rock);
					const r = ((rx + ry + rz) / 3) * f;
					out.colliders.push({
						type: "sphere",
						x,
						y: rock.y,
						z,
						r,
						base: rock.y,
						trunk: 0,
						reach: r,
					});
				}
			}
		}

		// A little village, sometimes.
		const rand = rngFor(seed, "village", cx, cz);
		const vx = (cx + 0.25 + rand() * 0.5) * size;
		const vz = (cz + 0.25 + rand() * 0.5) * size;
		if (rand() < blend(biomeAt(vx, vz), (b) => b.houses)) {
			const n = 3 + Math.floor(rand() * 5);
			for (let k = 0; k < n; k++) {
				const x = vx + (rand() - 0.5) * 70;
				const z = vz + (rand() - 0.5) * 70;
				const s = lerp(0.85, 1.25, rand());
				const yaw = rand() * Math.PI * 2;
				const roof = Math.floor(rand() * 100);
				const h = height(x, z);
				if (h < sea + 3 || slope(x, z) > 0.3 || blocked(x, z)) continue;
				out.houses.push({ x, y: h - 0.3, z, s, yaw, roof });
				const hs = SHAPES.house;
				const r = (Math.max(hs.w, hs.d) / 2) * s * f;
				out.colliders.push({
					type: "sphere",
					x,
					y: h + (hs.h / 2) * s,
					z,
					r,
					base: h,
					trunk: 0,
					reach: r,
				});
			}
		}
		return out;
	});

	function treeCollider(t: Tree): Collider {
		if (t.kind === "round") {
			const { trunk, canopy } = SHAPES.round;
			return {
				type: "sphere",
				x: t.x,
				y: t.y + canopy.y * t.s,
				z: t.z,
				r: canopy.r * t.s * f,
				base: t.y,
				trunk: trunk.r * t.s,
				reach: canopy.r * t.s,
			};
		}
		if (t.kind === "cactus") {
			const c = SHAPES.cactus;
			return {
				type: "pole",
				x: t.x,
				z: t.z,
				base: t.y,
				top: t.y + c.h * t.s,
				r: c.r * t.s * 1.5,
				reach: c.r * t.s * 1.5,
			};
		}
		const shape = SHAPES[t.kind === "snowPine" ? "pine" : t.kind];
		const first = shape.cones[0];
		const last = shape.cones[shape.cones.length - 1];
		return {
			type: "cone",
			x: t.x,
			z: t.z,
			base: t.y,
			y0: t.y + first[2] * t.s,
			y1: t.y + (last[2] + last[1]) * t.s,
			r0: first[0] * t.s * f,
			trunk: shape.trunk.r * t.s,
			reach: first[0] * t.s,
		};
	}

	// Each layer: its cell size, how far its colliders can reach outside their cell, its generator.
	const layers: {
		cell: number;
		reach: number;
		get: (cx: number, cz: number) => { colliders: Collider[] };
	}[] = [
		{ cell: w.chunkSize, reach: 8, get: groundCell },
		{
			cell: p.archCell,
			reach: SHAPES.arch.R * p.archScaleMax + 8,
			get: archCell,
		},
		{ cell: p.hoopCell, reach: p.hoopRadiusMax + 2, get: hoopCell },
		{ cell: p.skyRockCell, reach: 60 + p.skyRockMax, get: skyCell },
		{ cell: p.floaterCell, reach: 180 + p.floaterRadiusMax, get: floaterCell },
	];

	/** True if the point is inside a tree, rock, house, arch, hoop rim, pole, island or vine. */
	function solidAt(x: number, y: number, z: number): boolean {
		for (const layer of layers) {
			let hit = false;
			forCells(x, z, layer.reach, layer.cell, (cx, cz) => {
				if (hit) return;
				for (const c of layer.get(cx, cz).colliders) {
					if (Math.abs(x - c.x) > c.reach || Math.abs(z - c.z) > c.reach)
						continue;
					if (hits(c, x, y, z)) {
						hit = true;
						return;
					}
				}
			});
			if (hit) return true;
		}
		return false;
	}

	/** Gather features from every cell within `range` of (x, z). */
	function near(x: number, z: number, range: number) {
		const out = {
			arches: [] as Arch[],
			hoops: [] as Hoop[],
			skyRocks: [] as SkyRock[],
			pads: [] as Pad[],
			floaters: [] as Floater[],
			vines: [] as Vine[],
			waterfalls: [] as Waterfall[],
		};
		forCells(x, z, range, p.archCell, (cx, cz) => {
			const a = archCell(cx, cz).arch;
			if (a) out.arches.push(a);
		});
		forCells(x, z, range, p.hoopCell, (cx, cz) => {
			const h = hoopCell(cx, cz).hoop;
			if (h) out.hoops.push(h);
		});
		forCells(x, z, range, p.skyRockCell, (cx, cz) => {
			const c = skyCell(cx, cz);
			out.skyRocks.push(...c.rocks);
			out.pads.push(...c.pads);
			out.vines.push(...c.vines);
		});
		forCells(x, z, range, p.floaterCell, (cx, cz) => {
			const c = floaterCell(cx, cz);
			out.floaters.push(...c.floaters);
			out.pads.push(...c.pads);
			out.vines.push(...c.vines);
			out.waterfalls.push(...c.waterfalls);
		});
		return out;
	}

	/** The landing pad under (x, z) whose surface is within `tolerance` of y, if any. */
	function padAt(
		x: number,
		y: number,
		z: number,
		tolerance: number,
	): Pad | null {
		let found: Pad | null = null;
		const check = (pads: Pad[]) => {
			for (const pad of pads) {
				if ((x - pad.x) ** 2 + (z - pad.z) ** 2 > pad.r * pad.r) continue;
				if (Math.abs(y - pad.y) <= tolerance) found = pad;
			}
		};
		forCells(x, z, 60 + p.skyRockMax, p.skyRockCell, (cx, cz) =>
			check(skyCell(cx, cz).pads),
		);
		forCells(x, z, 180 + p.floaterRadiusMax, p.floaterCell, (cx, cz) =>
			check(floaterCell(cx, cz).pads),
		);
		return found;
	}

	return {
		groundCell,
		archCell,
		hoopCell,
		skyCell,
		floaterCell,
		solidAt,
		padAt,
		near,
		biomeAt,
	};
}

export type Features = ReturnType<typeof createFeatures>;

function hits(c: Collider, x: number, y: number, z: number): boolean {
	const d2 = (x - c.x) ** 2 + (z - c.z) ** 2;
	switch (c.type) {
		case "torus": {
			const dx = x - c.x;
			const dz = z - c.z;
			const lx = c.c * dx - c.s * dz; // into the ring's own frame
			const lz = c.s * dx + c.c * dz;
			return (Math.hypot(lx, y - c.y) - c.R) ** 2 + lz * lz < c.r * c.r;
		}
		case "spike": {
			if (y < c.bottom || y > c.top) return false;
			const r = (c.r0 * (y - c.bottom)) / (c.top - c.bottom);
			return d2 < r * r;
		}
		case "pole":
			return y >= c.base && y <= c.top && d2 < c.r * c.r;
		case "cone": {
			if (y >= c.base && y < c.y0 && d2 < c.trunk * c.trunk) return true; // trunk
			if (y < c.y0 || y > c.y1) return false;
			const r = c.r0 * (1 - (y - c.y0) / (c.y1 - c.y0));
			return d2 < r * r;
		}
		case "sphere":
			if (c.trunk > 0 && y >= c.base && y < c.y - c.r && d2 < c.trunk * c.trunk)
				return true; // trunk
			return d2 + (y - c.y) ** 2 < c.r * c.r;
	}
}

/** Pick a tree kind from the blended biome odds. */
function pickKind(weights: Weights, r: number): TreeKind {
	const odds: Partial<Record<TreeKind, number>> = {};
	let total = 0;
	for (const [id, wgt] of Object.entries(weights) as [
		keyof typeof BIOMES,
		number,
	][]) {
		for (const [kind, o] of Object.entries(BIOMES[id].treeKinds) as [
			TreeKind,
			number,
		][]) {
			odds[kind] = (odds[kind] ?? 0) + o * wgt;
			total += o * wgt;
		}
	}
	let acc = 0;
	for (const [kind, o] of Object.entries(odds) as [TreeKind, number][]) {
		acc += o / total;
		if (r < acc) return kind;
	}
	return "pine";
}

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}
