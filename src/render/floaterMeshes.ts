import * as THREE from "three";
import { config } from "../config";
import { rngFor } from "../core/rng";
import {
	type Floater,
	SHAPES,
	type Vine,
	type Waterfall,
} from "../world/props";
import { addBarycentric, createPaperMaterial } from "./paperMaterial";

// Floating mountains (grassy top, crumpled rock body), paper waterfalls that
// pour off the edge and fade in mid-air, and thick hanging vines that sway.

const GRASS = 0x7fa564;
const ROCK = 0x9d958a;
const VINES = [0x5d8a55, 0x6f9a5c];

function paint(
	g: THREE.BufferGeometry,
	color: (y: number) => number,
): THREE.BufferGeometry {
	const pos = g.getAttribute("position");
	const c = new THREE.Color();
	const colors = new Float32Array(pos.count * 3);
	for (let i = 0; i < pos.count; i += 3) {
		c.set(color((pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3)); // one colour per face
		for (let j = 0; j < 3; j++) c.toArray(colors, (i + j) * 3);
	}
	g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
	return g;
}

/** Move every vertex by a seeded amount; shared corners move together. `scale` per axis. */
function jitter(
	g: THREE.BufferGeometry,
	seed: string,
	sx: number,
	sy: number,
	sz: number,
) {
	const rand = rngFor(seed);
	const pos = g.getAttribute("position") as THREE.BufferAttribute;
	const moved = new Map<string, number[]>();
	for (let i = 0; i < pos.count; i++) {
		const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
		let d = moved.get(key);
		if (!d) {
			d = [(rand() - 0.5) * sx, (rand() - 0.5) * sy, (rand() - 0.5) * sz];
			moved.set(key, d);
		}
		pos.setXYZ(i, pos.getX(i) + d[0], pos.getY(i) + d[1], pos.getZ(i) + d[2]);
	}
	return g;
}

function floaterGeo(): THREE.BufferGeometry {
	// Lathe from the tip up to the top edge, then the flat top. Points go bottom → top.
	const profile = [...SHAPES.floater.profile]
		.reverse()
		.map(([r, y]) => new THREE.Vector2(r, y));
	profile.push(new THREE.Vector2(0.97, 0), new THREE.Vector2(0, 0));
	const g = new THREE.LatheGeometry(profile, 9).toNonIndexed();
	jitter(g, "floater", 0.09, 0.04, 0.09);
	paint(g, (y) => (y > -0.07 ? GRASS : ROCK));
	g.deleteAttribute("uv");
	g.computeVertexNormals();
	return addBarycentric(g);
}

function vineGeo(): THREE.BufferGeometry {
	// Unit vine: radius 1 at the top tapering to 0.6, hanging from y = 0 to y = -1. Banded greens.
	const g = new THREE.CylinderGeometry(1, 0.6, 1, 5, 12)
		.translate(0, -0.5, 0)
		.toNonIndexed();
	jitter(g, "vine", 0.9, 0, 0.9);
	paint(g, (y) => VINES[Math.floor(-y * 12) % 2]);
	g.deleteAttribute("uv");
	g.computeVertexNormals();
	return addBarycentric(g);
}

function waterfallTexture(): THREE.CanvasTexture {
	// Streaky white/pale-blue paper strips; scrolled down to look like falling water.
	const cv = document.createElement("canvas");
	cv.width = 64;
	cv.height = 256;
	const ctx = cv.getContext("2d");
	if (ctx) {
		ctx.fillStyle = "#e4f2f8";
		ctx.fillRect(0, 0, 64, 256);
		const rand = rngFor("waterfall");
		for (let i = 0; i < 70; i++) {
			ctx.fillStyle = rand() < 0.6 ? "#ffffff" : "#9cc8e0";
			ctx.fillRect(
				Math.floor(rand() * 64),
				Math.floor(rand() * 256),
				2 + Math.floor(rand() * 6),
				20 + rand() * 70,
			);
		}
	}
	const t = new THREE.CanvasTexture(cv);
	t.wrapS = t.wrapT = THREE.RepeatWrapping;
	t.repeat.set(2, 3);
	t.colorSpace = THREE.SRGBColorSpace;
	return t;
}

function fadeTexture(): THREE.CanvasTexture {
	// Alpha: solid at the top, fading out at the bottom (alphaMap reads the green channel).
	const cv = document.createElement("canvas");
	cv.width = 1;
	cv.height = 128;
	const ctx = cv.getContext("2d");
	if (ctx) {
		const g = ctx.createLinearGradient(0, 0, 0, 128);
		g.addColorStop(0, "#fff");
		g.addColorStop(0.6, "#eee");
		g.addColorStop(1, "#000");
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, 1, 128);
	}
	return new THREE.CanvasTexture(cv);
}

function waterfallGeo(): THREE.BufferGeometry {
	// Unit sheet from y = 0 down to y = -1, bowing outward (+Z) as it falls.
	const g = new THREE.PlaneGeometry(1, 1, 1, 10).translate(0, -0.5, 0);
	const pos = g.getAttribute("position");
	for (let i = 0; i < pos.count; i++) pos.setZ(i, 6 * Math.sqrt(-pos.getY(i)));
	return g;
}

export function createFloaterMeshes(
	scene: THREE.Scene,
	props: { floaters: Floater[]; vines: Vine[]; waterfalls: Waterfall[] },
) {
	const m = new THREE.Matrix4();
	const q = new THREE.Quaternion();
	const p = new THREE.Vector3();
	const s = new THREE.Vector3();
	const up = new THREE.Vector3(0, 1, 0);
	const tint = new THREE.Color();
	const add = (mesh: THREE.InstancedMesh) => {
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		mesh.frustumCulled = false;
		scene.add(mesh);
		return mesh;
	};

	// Mountains
	const rock = createPaperMaterial({
		grainScale: config.paper.terrainGrainScale,
		vertexColors: true,
		side: THREE.DoubleSide,
	});
	const mountains = add(
		new THREE.InstancedMesh(
			floaterGeo(),
			rock,
			Math.max(1, props.floaters.length),
		),
	);
	mountains.count = props.floaters.length;
	props.floaters.forEach((f, i) => {
		mountains.setMatrixAt(
			i,
			m.compose(
				p.set(f.x, f.y, f.z),
				q.setFromAxisAngle(up, f.yaw),
				s.set(f.R, f.H, f.R),
			),
		);
		mountains.setColorAt(i, tint.setScalar(f.tint));
	});

	// Vines
	const vines = add(
		new THREE.InstancedMesh(
			vineGeo(),
			createPaperMaterial({
				grainScale: config.paper.terrainGrainScale * 2,
				vertexColors: true,
			}),
			Math.max(1, props.vines.length),
		),
	);
	vines.count = props.vines.length;

	// Waterfalls
	const flow = waterfallTexture();
	const falls = new THREE.InstancedMesh(
		waterfallGeo(),
		new THREE.MeshBasicMaterial({
			map: flow,
			alphaMap: fadeTexture(),
			transparent: true,
			depthWrite: false,
			side: THREE.DoubleSide,
		}),
		Math.max(1, props.waterfalls.length),
	);
	falls.count = props.waterfalls.length;
	falls.frustumCulled = false;
	props.waterfalls.forEach((w, i) => {
		falls.setMatrixAt(
			i,
			m.compose(
				p.set(w.x, w.y, w.z),
				q.setFromAxisAngle(up, w.yaw),
				s.set(w.width, w.length, 1),
			),
		);
	});
	scene.add(falls);

	const e = new THREE.Euler();
	return {
		update(time: number) {
			flow.offset.y = time * 0.45; // water runs down the sheet
			const sway = config.props.vineSway;
			props.vines.forEach((v, i) => {
				e.set(
					Math.sin(time * 0.5 + v.phase) * sway,
					0,
					Math.cos(time * 0.37 + v.phase) * sway,
				);
				m.compose(
					p.set(v.x, v.top, v.z),
					q.setFromEuler(e),
					s.set(v.r, v.length, v.r),
				);
				vines.setMatrixAt(i, m);
			});
			vines.instanceMatrix.needsUpdate = true;
		},
	};
}
