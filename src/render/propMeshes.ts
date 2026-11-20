import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { config } from "../config";
import { rngFor } from "../core/rng";
import {
	type Arch,
	type Rock,
	SHAPES,
	type SkyRock,
	type Tree,
	type TreeKind,
} from "../world/props";
import { addBarycentric, createPaperMaterial } from "./paperMaterial";

// Papercraft props as InstancedMeshes: one draw call per kind.
// ponytail: every prop on the map is drawn every frame; per-chunk instancing comes with chunk streaming (phase 2).

const TRUNK = 0x8a6a4a;
const GREENS = [0x6f9a5c, 0x5d8a55, 0x7fa564, 0x557f4e];
const ROCK = 0xa59c90;
const SANDSTONE = 0xd2a982;

/** Paint a geometry one colour, make it non-indexed, and drop attributes the merge doesn't need. */
function part(geo: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
	const g = geo.index ? geo.toNonIndexed() : geo;
	g.deleteAttribute("uv");
	g.deleteAttribute("normal");
	const c = new THREE.Color(color);
	const n = g.getAttribute("position").count;
	const colors = new Float32Array(n * 3);
	for (let i = 0; i < n; i++) c.toArray(colors, i * 3);
	g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
	return g;
}

function finish(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
	const g = mergeGeometries(parts);
	g.computeVertexNormals(); // non-indexed → flat
	return addBarycentric(g);
}

/** Push every corner in or out a little. Shared corners move together, so faces stay joined. */
function crumple(
	geo: THREE.BufferGeometry,
	amount: number,
	seed: string,
): THREE.BufferGeometry {
	const rand = rngFor(seed);
	const pos = geo.getAttribute("position") as THREE.BufferAttribute;
	const moved = new Map<string, [number, number, number]>();
	for (let i = 0; i < pos.count; i++) {
		const key = `${pos.getX(i).toFixed(2)},${pos.getY(i).toFixed(2)},${pos.getZ(i).toFixed(2)}`;
		let d = moved.get(key);
		if (!d) {
			d = [
				(rand() - 0.5) * amount,
				(rand() - 0.5) * amount,
				(rand() - 0.5) * amount,
			];
			moved.set(key, d);
		}
		pos.setXYZ(i, pos.getX(i) + d[0], pos.getY(i) + d[1], pos.getZ(i) + d[2]);
	}
	return geo;
}

function coneTree(kind: "pine" | "tallPine"): THREE.BufferGeometry {
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
				GREENS[i % GREENS.length],
			),
		);
	});
	return finish(parts);
}

function roundTree(): THREE.BufferGeometry {
	const { trunk, canopy } = SHAPES.round;
	return finish([
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
				0.6,
				"canopy",
			).translate(0, canopy.y, 0),
			GREENS[2],
		),
	]);
}

/** Floating island: grass cap, crumpled rock body, a spike hanging below (sizes from SHAPES.skyRock). */
function skyRockGeo(): THREE.BufferGeometry {
	const k = SHAPES.skyRock;
	const spike = new THREE.ConeGeometry(k.spikeR, k.spikeLen, 6).rotateX(
		Math.PI,
	);
	spike.translate(0, k.spikeTop - k.spikeLen / 2, 0);
	return finish([
		part(
			crumple(
				new THREE.CylinderGeometry(0.95, 0.85, 0.25, 7),
				0.12,
				"cap",
			).translate(0, 0.55, 0),
			GREENS[2],
		),
		part(
			crumple(
				new THREE.DodecahedronGeometry(k.body, 0).scale(1, 0.75, 1),
				0.3,
				"skyRock",
			),
			ROCK,
		),
		part(crumple(spike, 0.15, "spike"), ROCK),
	]);
}

function rockGeo(): THREE.BufferGeometry {
	return finish([
		part(crumple(new THREE.DodecahedronGeometry(1, 0), 0.35, "rock"), ROCK),
	]);
}

function archGeo(kind: Arch["kind"]): THREE.BufferGeometry {
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
	return finish([part(crumple(torus, 1.6, kind), SANDSTONE)]);
}

export function createPropMeshes(
	scene: THREE.Scene,
	props: { trees: Tree[]; rocks: Rock[]; arches: Arch[]; skyRocks: SkyRock[] },
) {
	const material = createPaperMaterial({
		grainScale: config.paper.terrainGrainScale * 2,
		vertexColors: true,
	});
	const m = new THREE.Matrix4();
	const q = new THREE.Quaternion();
	const p = new THREE.Vector3();
	const s = new THREE.Vector3();
	const up = new THREE.Vector3(0, 1, 0);
	const tint = new THREE.Color();

	function instanced<T>(
		geo: THREE.BufferGeometry,
		items: T[],
		place: (item: T) => number,
	) {
		if (items.length === 0) return;
		const mesh = new THREE.InstancedMesh(geo, material, items.length);
		items.forEach((item, i) => {
			const t = place(item);
			mesh.setMatrixAt(i, m.compose(p, q, s));
			mesh.setColorAt(i, tint.setScalar(t));
		});
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		mesh.computeBoundingSphere();
		scene.add(mesh);
	}

	const geos: Record<TreeKind, THREE.BufferGeometry> = {
		pine: coneTree("pine"),
		tallPine: coneTree("tallPine"),
		round: roundTree(),
	};
	for (const kind of Object.keys(geos) as TreeKind[]) {
		instanced(
			geos[kind],
			props.trees.filter((t) => t.kind === kind),
			(t) => {
				p.set(t.x, t.y, t.z);
				q.setFromAxisAngle(up, t.yaw);
				s.setScalar(t.s);
				return t.tint;
			},
		);
	}

	instanced(skyRockGeo(), props.skyRocks, (k) => {
		p.set(k.x, k.y, k.z);
		q.setFromAxisAngle(up, k.yaw);
		s.setScalar(k.s);
		return k.tint;
	});

	instanced(rockGeo(), props.rocks, (r) => {
		p.set(r.x, r.y, r.z);
		q.setFromAxisAngle(up, r.yaw);
		s.set(r.sx, r.sy, r.sz);
		return r.tint;
	});

	for (const kind of ["arch", "ring"] as const) {
		instanced(
			archGeo(kind),
			props.arches.filter((a) => a.kind === kind),
			(a) => {
				p.set(a.x, a.y, a.z);
				q.setFromAxisAngle(up, a.yaw);
				s.setScalar(a.s);
				return 1;
			},
		);
	}
}
