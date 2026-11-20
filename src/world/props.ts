// Seeded placement of trees, rocks and rock arches, plus their collision.
// Pure: no Three.js. Shape sizes live in SHAPES so the meshes and the
// colliders can't drift apart.
import type { Config } from "../config";
import { rngFor } from "../core/rng";
import { makeNoise } from "./noise";

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
	arch: { R: 20, r: 4.5 }, // ring radius to the tube centre, tube radius
	// Floating island at radius 1: grass cap on top, rock body, a spike hanging below.
	skyRock: { body: 1, spikeR: 0.6, spikeTop: -0.3, spikeLen: 1.8 },
} as const;

export type TreeKind = "pine" | "tallPine" | "round";

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

export interface Arch {
	kind: "arch" | "ring"; // arch: a bridge with both feet in the ground; ring: a standing hoop
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

/** A paper hoop: floating in the air, or standing on a pole. Fly along local Z through it. */
export interface Hoop {
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

type Collider =
	| {
			type: "spike"; // hanging cone: r0 at the top, a point at the bottom
			x: number;
			z: number;
			top: number;
			bottom: number;
			r0: number;
	  }
	| {
			type: "pole";
			x: number;
			z: number;
			base: number;
			top: number;
			r: number;
	  }
	| {
			type: "cone";
			x: number;
			z: number;
			base: number;
			y0: number;
			y1: number;
			r0: number;
			trunk: number;
	  }
	| {
			type: "sphere";
			x: number;
			y: number;
			z: number;
			r: number;
			base: number;
			trunk: number;
	  }
	| {
			type: "torus";
			x: number;
			y: number;
			z: number;
			c: number;
			s: number;
			R: number;
			r: number;
	  };

export type PropsConfig = Config["props"];

export function createProps(
	seed: string,
	height: (x: number, z: number) => number,
	p: PropsConfig,
	seaLevel: number,
) {
	const forest = makeNoise(seed, "forest");
	const half = p.extent / 2;
	const slope = (x: number, z: number) =>
		Math.hypot(
			height(x + 1, z) - height(x - 1, z),
			height(x, z + 1) - height(x, z - 1),
		) / 2;

	// --- Arches first, so trees and rocks can keep out of their holes ---
	const arches: Arch[] = [];
	for (let cx = -half; cx < half; cx += p.archCell) {
		for (let cz = -half; cz < half; cz += p.archCell) {
			const rand = rngFor(seed, "arch", cx, cz);
			if (rand() > p.archChance) continue;
			for (let tries = 0; tries < 8; tries++) {
				const x = cx + rand() * p.archCell;
				const z = cz + rand() * p.archCell;
				const yaw = rand() * Math.PI;
				const s = lerp(p.archScaleMin, p.archScaleMax, rand());
				const ring = rand() < p.ringChance;
				const R = SHAPES.arch.R * s;
				const fx = Math.cos(yaw) * R; // the feet sit at local ±X
				const fz = -Math.sin(yaw) * R;
				const h0 = height(x, z);
				const h1 = height(x + fx, z + fz);
				const h2 = height(x - fx, z - fz);
				if (Math.min(h0, h1, h2) < seaLevel + 2) continue;
				if (Math.abs(h1 - h2) > 5) continue;
				const y = ring ? h0 + R * 0.55 : Math.max(h1, h2) + 0.5;
				if (!ring && h0 > y + 2) continue; // a hump would block the hole
				if (ring && Math.abs(h1 - h0) > 8) continue;
				arches.push({ kind: ring ? "ring" : "arch", x, y, z, yaw, s });
				break;
			}
		}
	}

	// --- Hoops: floating, or on poles. Not physical, just fun. ---
	const hoops: Hoop[] = [];
	for (let cx = -half; cx < half; cx += p.hoopCell) {
		for (let cz = -half; cz < half; cz += p.hoopCell) {
			const rand = rngFor(seed, "hoop", cx, cz);
			if (rand() > p.hoopChance) continue;
			for (let tries = 0; tries < 6; tries++) {
				const x = cx + rand() * p.hoopCell;
				const z = cz + rand() * p.hoopCell;
				const yaw = rand() * Math.PI * 2;
				const R = lerp(p.hoopRadiusMin, p.hoopRadiusMax, rand());
				const pole = rand() < p.poleChance;
				const lift = pole
					? lerp(p.poleMin, p.poleMax, rand())
					: lerp(p.floatMin, p.floatMax, rand());
				const color = Math.floor(rand() * 1000);
				const base = height(x, z);
				// Clear the ground under both sides of the ring.
				const ex = Math.cos(yaw) * R;
				const ez = -Math.sin(yaw) * R;
				const ground = Math.max(
					base,
					height(x + ex, z + ez),
					height(x - ex, z - ez),
					seaLevel,
				);
				if (pole && base < seaLevel + 1) continue; // no poles in the sea
				const y = ground + lift + R;
				// The approach lane (both ways) must be clear of hills, or you can't line up a run.
				const lx = Math.sin(yaw);
				const lz = Math.cos(yaw);
				let blocked = false;
				for (let d = -p.hoopLane; d <= p.hoopLane && !blocked; d += 10) {
					blocked = height(x + lx * d, z + lz * d) > y - R * 0.5;
				}
				if (blocked) continue;
				hoops.push({
					kind: pole ? "pole" : "float",
					x,
					y,
					z,
					yaw,
					R,
					r: R * p.hoopTube,
					base,
					color,
				});
				break;
			}
		}
	}

	// Keep a clear lane through each arch and hoop (along its local Z) so you can line up a run at it.
	const lanes = [
		...arches.map((a) => ({
			...a,
			half: SHAPES.arch.R * a.s + 10,
			length: p.archLane,
		})),
		...hoops.map((h) => ({ ...h, half: h.R + 6, length: p.hoopLane })),
	];
	const nearArch = (x: number, z: number) =>
		lanes.some((a) => {
			const dx = x - a.x;
			const dz = z - a.z;
			const c = Math.cos(a.yaw);
			const s = Math.sin(a.yaw);
			const lx = c * dx - s * dz;
			const lz = s * dx + c * dz;
			return Math.abs(lx) < a.half && Math.abs(lz) < a.length;
		});

	// --- Floating rock islands, away from the arch and hoop lanes ---
	const skyRocks: SkyRock[] = [];
	const sk = SHAPES.skyRock;
	for (let cx = -half; cx < half; cx += p.skyRockCell) {
		for (let cz = -half; cz < half; cz += p.skyRockCell) {
			const rand = rngFor(seed, "skyRock", cx, cz);
			if (rand() > p.skyRockChance) continue;
			const ax = cx + rand() * p.skyRockCell;
			const az = cz + rand() * p.skyRockCell;
			const lift = lerp(p.skyRockLiftMin, p.skyRockLiftMax, rand());
			const count = 1 + Math.floor(rand() * 3); // a big one plus a few smaller ones nearby
			for (let i = 0; i < count; i++) {
				const s =
					lerp(p.skyRockMin, p.skyRockMax, rand()) * (i === 0 ? 1 : 0.5);
				const x = ax + (i === 0 ? 0 : (rand() - 0.5) * 80);
				const z = az + (i === 0 ? 0 : (rand() - 0.5) * 80);
				const y =
					Math.max(height(x, z), seaLevel) +
					lift +
					(i === 0 ? 0 : (rand() - 0.5) * 30);
				const yaw = rand() * Math.PI * 2;
				const tint = lerp(0.9, 1.1, rand());
				const bottom = y + (sk.spikeTop - sk.spikeLen) * s;
				if (bottom < Math.max(height(x, z), seaLevel) + 15 || nearArch(x, z))
					continue;
				skyRocks.push({ x, y, z, s, yaw, tint });
			}
		}
	}

	// --- Trees and rocks per small cell ---
	const trees: Tree[] = [];
	const rocks: Rock[] = [];
	for (let cx = -half; cx < half; cx += p.cell) {
		for (let cz = -half; cz < half; cz += p.cell) {
			const rand = rngFor(seed, "props", cx, cz);
			const density = smoothstep(
				-0.15,
				0.45,
				forest(cx * p.forestScale, cz * p.forestScale),
			);
			const d = p.meadowDensity + (1 - p.meadowDensity) * density;

			for (let i = 0; i < p.treeTries; i++) {
				const x = cx + rand() * p.cell;
				const z = cz + rand() * p.cell;
				const accept = rand() < d;
				const pick = rand();
				const s = lerp(0.8, 1.3, rand());
				const yaw = rand() * Math.PI * 2;
				const tint = lerp(0.85, 1.1, rand());
				if (!accept) continue;
				const h = height(x, z);
				if (
					h < seaLevel + p.beach ||
					h > p.treeLine ||
					slope(x, z) > p.maxSlope ||
					nearArch(x, z)
				)
					continue;
				const kind: TreeKind =
					density > 0.5
						? pick < p.tallShare
							? "tallPine"
							: "pine"
						: pick < 0.6
							? "round"
							: "pine";
				const scale = kind === "tallPine" ? s * 1.3 : s;
				trees.push({ kind, x, y: h - 0.4, z, s: scale, yaw, tint });
			}

			const x = cx + rand() * p.cell;
			const z = cz + rand() * p.cell;
			const chance = rand();
			const size = lerp(p.rockMin, p.rockMax, rand() ** 2);
			const rx = size * lerp(0.8, 1.3, rand());
			const ry = size * lerp(0.5, 0.9, rand());
			const rz = size * lerp(0.8, 1.3, rand());
			const yaw = rand() * Math.PI * 2;
			const tint = lerp(0.85, 1.1, rand());
			const h = height(x, z);
			const sl = slope(x, z);
			// More rocks on steep and high ground.
			const want = p.rockChance + sl * 0.3 + (h > p.treeLine ? 0.2 : 0);
			if (chance < want && h > seaLevel - 1 && !nearArch(x, z)) {
				rocks.push({
					x,
					y: h - ry * 0.3,
					z,
					sx: rx,
					sy: ry,
					sz: rz,
					yaw,
					tint,
				});
			}
		}
	}

	// --- Collision grid ---
	const grid = new Map<string, Collider[]>();
	const add = (c: Collider, x: number, z: number, radius: number) => {
		for (
			let gx = Math.floor((x - radius) / p.cell);
			gx <= Math.floor((x + radius) / p.cell);
			gx++
		) {
			for (
				let gz = Math.floor((z - radius) / p.cell);
				gz <= Math.floor((z + radius) / p.cell);
				gz++
			) {
				const key = `${gx},${gz}`;
				const list = grid.get(key);
				if (list) list.push(c);
				else grid.set(key, [c]);
			}
		}
	};
	const f = p.collisionFactor;
	for (const t of trees) {
		if (t.kind === "round") {
			const { trunk, canopy } = SHAPES.round;
			add(
				{
					type: "sphere",
					x: t.x,
					y: t.y + canopy.y * t.s,
					z: t.z,
					r: canopy.r * t.s * f,
					base: t.y,
					trunk: trunk.r * t.s,
				},
				t.x,
				t.z,
				canopy.r * t.s,
			);
		} else {
			const shape = SHAPES[t.kind];
			const first = shape.cones[0];
			const last = shape.cones[shape.cones.length - 1];
			add(
				{
					type: "cone",
					x: t.x,
					z: t.z,
					base: t.y,
					y0: t.y + first[2] * t.s,
					y1: t.y + (last[2] + last[1]) * t.s,
					r0: first[0] * t.s * f,
					trunk: shape.trunk.r * t.s,
				},
				t.x,
				t.z,
				first[0] * t.s,
			);
		}
	}
	for (const r of rocks) {
		const radius = ((r.sx + r.sy + r.sz) / 3) * f;
		add(
			{
				type: "sphere",
				x: r.x,
				y: r.y,
				z: r.z,
				r: radius,
				base: r.y,
				trunk: 0,
			},
			r.x,
			r.z,
			radius,
		);
	}
	for (const a of arches) {
		const R = SHAPES.arch.R * a.s;
		const r = SHAPES.arch.r * a.s;
		add(
			{
				type: "torus",
				x: a.x,
				y: a.y,
				z: a.z,
				c: Math.cos(a.yaw),
				s: Math.sin(a.yaw),
				R,
				r: r * f,
			},
			a.x,
			a.z,
			R + r,
		);
	}

	for (const k of skyRocks) {
		add(
			{
				type: "sphere",
				x: k.x,
				y: k.y,
				z: k.z,
				r: k.s * f,
				base: k.y,
				trunk: 0,
			},
			k.x,
			k.z,
			k.s,
		);
		add(
			{
				type: "spike",
				x: k.x,
				z: k.z,
				top: k.y + sk.spikeTop * k.s,
				bottom: k.y + (sk.spikeTop - sk.spikeLen) * k.s,
				r0: sk.spikeR * k.s * f,
			},
			k.x,
			k.z,
			sk.spikeR * k.s,
		);
	}
	for (const h of hoops) {
		add(
			{
				type: "torus",
				x: h.x,
				y: h.y,
				z: h.z,
				c: Math.cos(h.yaw),
				s: Math.sin(h.yaw),
				R: h.R,
				r: h.r * f,
			},
			h.x,
			h.z,
			h.R + h.r,
		);
		if (h.kind === "pole") {
			add(
				{
					type: "pole",
					x: h.x,
					z: h.z,
					base: h.base,
					top: h.y - h.R,
					r: p.poleRadius,
				},
				h.x,
				h.z,
				p.poleRadius,
			);
		}
	}

	/** True if the point is inside a tree, rock, arch, hoop or pole. */
	function solidAt(x: number, y: number, z: number): boolean {
		const list = grid.get(
			`${Math.floor(x / p.cell)},${Math.floor(z / p.cell)}`,
		);
		if (!list) return false;
		for (const c of list) {
			if (c.type === "spike") {
				if (y < c.bottom || y > c.top) continue;
				const r = (c.r0 * (y - c.bottom)) / (c.top - c.bottom);
				if ((x - c.x) ** 2 + (z - c.z) ** 2 < r * r) return true;
				continue;
			}
			if (c.type === "pole") {
				if (
					y >= c.base &&
					y <= c.top &&
					(x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r
				)
					return true;
				continue;
			}
			if (c.type === "torus") {
				const dx = x - c.x;
				const dz = z - c.z;
				const lx = c.c * dx - c.s * dz; // into the arch's own frame
				const lz = c.s * dx + c.c * dz;
				const ly = y - c.y;
				if ((Math.hypot(lx, ly) - c.R) ** 2 + lz * lz < c.r * c.r) return true;
				continue;
			}
			const d2 = (x - c.x) ** 2 + (z - c.z) ** 2;
			if (y >= c.base && d2 < c.trunk * c.trunk) {
				const top = c.type === "cone" ? c.y0 : c.y - c.r;
				if (y < top) return true; // trunk
			}
			if (c.type === "cone") {
				if (y < c.y0 || y > c.y1) continue;
				const r = c.r0 * (1 - (y - c.y0) / (c.y1 - c.y0));
				if (d2 < r * r) return true;
			} else if (d2 + (y - c.y) ** 2 < c.r * c.r) {
				return true;
			}
		}
		return false;
	}

	return { trees, rocks, arches, hoops, skyRocks, solidAt };
}

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

function smoothstep(a: number, b: number, t: number): number {
	const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
	return x * x * (3 - 2 * x);
}
