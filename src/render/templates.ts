import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { rngFor } from "../core/rng";
import type { TreeKind } from "../world/biomes";
import { SHAPES } from "../world/props";
import { addBarycentric } from "./paperMaterial";

// Unit papercraft shapes (non-indexed, position + colour only), and `bake`,
// which merges many placed copies into one geometry: one draw call per cell.

const TRUNK = 0x8a6a4a;
const GREENS = [0x6f9a5c, 0x5d8a55, 0x7fa564, 0x557f4e];
const SNOWY = [0xdfe8de, 0xc9d8c6, 0xeef2ec];
const ROCK = 0xa59c90;
const SANDSTONE = 0xd2a982;
const CACTUS = 0x7a9a5a;
const WALL = 0xf2ece0;
export const ROOFS = [0xc8735a, 0x7f97ad, 0xb58a5e, 0x9b6b7f];
export const POLE = 0xf4efe4;
const GRASS = 0x7fa564;
const SKY_ROCK = 0x9d958a;

/** Paint a geometry one colour, make it non-indexed, and keep only position + colour. */
export function part(
	geo: THREE.BufferGeometry,
	color: number,
): THREE.BufferGeometry {
	const g = geo.index ? geo.toNonIndexed() : geo;
	for (const name of Object.keys(g.attributes))
		if (name !== "position") g.deleteAttribute(name);
	const c = new THREE.Color(color);
	const n = g.getAttribute("position").count;
	const colors = new Float32Array(n * 3);
	for (let i = 0; i < n; i++) c.toArray(colors, i * 3);
	g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
	return g;
}

/** Push every corner in or out a little. Shared corners move together, so faces stay joined. */
export function crumple(
	geo: THREE.BufferGeometry,
	seed: string,
	ax: number,
	ay = ax,
	az = ax,
): THREE.BufferGeometry {
	const rand = rngFor(seed);
	const pos = geo.getAttribute("position") as THREE.BufferAttribute;
	const moved = new Map<string, [number, number, number]>();
	for (let i = 0; i < pos.count; i++) {
		const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
		let d = moved.get(key);
		if (!d) {
			d = [(rand() - 0.5) * ax, (rand() - 0.5) * ay, (rand() - 0.5) * az];
			moved.set(key, d);
		}
		pos.setXYZ(i, pos.getX(i) + d[0], pos.getY(i) + d[1], pos.getZ(i) + d[2]);
	}
	return geo;
}

const merge = (parts: THREE.BufferGeometry[]) => mergeGeometries(parts);

function coneTree(
	kind: "pine" | "tallPine",
	greens: number[],
): THREE.BufferGeometry {
	const { trunk, cones } = SHAPES[kind];
	const parts = [
		part(
			new THREE.CylinderGeometry(trunk.r * 0.8, trunk.r, trunk.h, 5).translate(
				0,
				trunk.h / 2,
				0,
			),
			TRUNK,
		),
	];
	cones.forEach(([r, h, y], i) => {
		parts.push(
			part(
				new THREE.ConeGeometry(r, h, 6).translate(0, y + h / 2, 0),
				greens[i % greens.length],
			),
		);
	});
	return merge(parts);
}

function roundTree(): THREE.BufferGeometry {
	const { trunk, canopy } = SHAPES.round;
	return merge([
		part(
			new THREE.CylinderGeometry(
				trunk.r * 0.8,
				trunk.r,
				trunk.h + 1,
				5,
			).translate(0, (trunk.h + 1) / 2, 0),
			TRUNK,
		),
		part(
			crumple(
				new THREE.IcosahedronGeometry(canopy.r, 0),
				"canopy",
				0.6,
			).translate(0, canopy.y, 0),
			GREENS[2],
		),
	]);
}

function cactus(): THREE.BufferGeometry {
	const c = SHAPES.cactus;
	const a = c.arm;
	const arm = (side: number) => [
		part(
			new THREE.CylinderGeometry(a.r, a.r, a.out, 6)
				.rotateZ(Math.PI / 2)
				.translate((side * a.out) / 2, a.y, 0),
			CACTUS,
		),
		part(
			new THREE.CylinderGeometry(a.r * 0.9, a.r, a.h, 6).translate(
				side * a.out,
				a.y + a.h / 2,
				0,
			),
			CACTUS,
		),
	];
	return merge([
		part(
			new THREE.CylinderGeometry(c.r * 0.85, c.r, c.h, 6).translate(
				0,
				c.h / 2,
				0,
			),
			CACTUS,
		),
		...arm(1),
		...arm(-1).map((g) => g.translate(0, -0.6, 0)),
	]);
}

function house(roofColour: number): THREE.BufferGeometry {
	const { w, d, h, roof } = SHAPES.house;
	// Triangular prism roof: a 3-sided cylinder on its side, slightly wider than the walls.
	// After the turns the apex points up (+Y at 1), the eaves sit at y = -0.5, x = ±0.866.
	const prism = new THREE.CylinderGeometry(1, 1, d + 0.6, 3)
		.rotateX(Math.PI / 2)
		.rotateZ(Math.PI);
	const sy = roof / 1.5;
	prism.scale((w / 2 + 0.4) / 0.866, sy, 1);
	prism.translate(0, h + 0.5 * sy, 0);
	return merge([
		part(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), WALL),
		part(prism, roofColour),
	]);
}

function rock(): THREE.BufferGeometry {
	return part(
		crumple(new THREE.DodecahedronGeometry(1, 0), "rock", 0.35),
		ROCK,
	);
}

function arch(kind: "arch" | "ring"): THREE.BufferGeometry {
	const { R, r } = SHAPES.arch;
	// An arch runs a bit past a half circle so its feet dig into the ground.
	const arc = kind === "arch" ? Math.PI + 0.5 : Math.PI * 2;
	const torus = new THREE.TorusGeometry(
		R,
		r,
		6,
		kind === "arch" ? 10 : 18,
		arc,
	);
	if (kind === "arch") torus.rotateZ(-0.25);
	return part(crumple(torus, kind, 1.6), SANDSTONE);
}

function skyRock(): THREE.BufferGeometry {
	const k = SHAPES.skyRock;
	const spike = new THREE.ConeGeometry(k.spikeR, k.spikeLen, 6).rotateX(
		Math.PI,
	);
	spike.translate(0, k.spikeTop - k.spikeLen / 2, 0);
	return merge([
		part(
			crumple(
				new THREE.CylinderGeometry(0.95, 0.85, 0.25, 7),
				"cap",
				0.12,
			).translate(0, 0.55, 0),
			GREENS[2],
		),
		part(
			crumple(
				new THREE.DodecahedronGeometry(k.body, 0).scale(1, 0.75, 1),
				"skyRock",
				0.3,
			),
			ROCK,
		),
		part(crumple(spike, "spike", 0.15), ROCK),
	]);
}

function floater(): THREE.BufferGeometry {
	// Lathe from the tip up to the top edge, then the flat top. Points go bottom → top.
	const profile = [...SHAPES.floater.profile]
		.reverse()
		.map(([r, y]) => new THREE.Vector2(r, y));
	profile.push(new THREE.Vector2(0.97, 0), new THREE.Vector2(0, 0));
	const g = crumple(
		new THREE.LatheGeometry(profile, 9).toNonIndexed(),
		"floater",
		0.09,
		0.04,
		0.09,
	);
	part(g, SKY_ROCK);
	// Grass on the top faces.
	const pos = g.getAttribute("position");
	const col = g.getAttribute("color") as THREE.BufferAttribute;
	const grass = new THREE.Color(GRASS);
	for (let i = 0; i < pos.count; i += 3) {
		if ((pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3 > -0.07) {
			for (let j = 0; j < 3; j++) col.setXYZ(i + j, grass.r, grass.g, grass.b);
		}
	}
	return g;
}

function pole(): THREE.BufferGeometry {
	return part(
		new THREE.CylinderGeometry(1, 1, 1, 5).translate(0, 0.5, 0),
		POLE,
	);
}

// Built once, on first use.
let cache: ReturnType<typeof buildAll> | undefined;
function buildAll() {
	const trees: Record<TreeKind, THREE.BufferGeometry> = {
		pine: coneTree("pine", GREENS),
		tallPine: coneTree("tallPine", GREENS),
		snowPine: coneTree("pine", SNOWY),
		round: roundTree(),
		cactus: cactus(),
	};
	return {
		trees,
		houses: ROOFS.map(house),
		rock: rock(),
		arch: arch("arch"),
		ring: arch("ring"),
		skyRock: skyRock(),
		floater: floater(),
		pole: pole(),
	};
}
export function templates() {
	cache ??= buildAll();
	return cache;
}

const m = new THREE.Matrix4();
const q = new THREE.Quaternion();
const p = new THREE.Vector3();
const s = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);

/** A placed copy: position, yaw, scale (uniform or per axis) and a brightness tint. */
export interface Placement {
	geo: THREE.BufferGeometry;
	x: number;
	y: number;
	z: number;
	yaw: number;
	sx: number;
	sy?: number;
	sz?: number;
	tint?: number;
}

/** Merge placed copies into one flat-shaded geometry, ready for the paper material. */
export function bake(items: Placement[]): THREE.BufferGeometry | null {
	if (items.length === 0) return null;
	const parts = items.map((it) => {
		const g = it.geo.clone();
		g.applyMatrix4(
			m.compose(
				p.set(it.x, it.y, it.z),
				q.setFromAxisAngle(up, it.yaw),
				s.set(it.sx, it.sy ?? it.sx, it.sz ?? it.sx),
			),
		);
		if (it.tint !== undefined && it.tint !== 1) {
			const col = g.getAttribute("color") as THREE.BufferAttribute;
			for (let i = 0; i < col.array.length; i++)
				(col.array as Float32Array)[i] *= it.tint;
		}
		return g;
	});
	const merged = mergeGeometries(parts);
	for (const g of parts) g.dispose();
	merged.computeVertexNormals();
	merged.computeBoundingSphere();
	return addBarycentric(merged);
}
