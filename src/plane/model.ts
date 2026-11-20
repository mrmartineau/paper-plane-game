import * as THREE from "three";
import { config } from "../config";

// Origami dart: 6 triangles (two-sided material shows the undersides). Nose at -Z. Two-tone paper: white outer wings,
// slightly shaded inner panels so the fold line reads.
const N = [0, 0, -1.0]; // nose
const T = [0, 0.02, 0.6]; // tail spine (top)
const KL = [-0.03, -0.2, 0.6]; // keel bottom, folded as a thin V
const KR = [0.03, -0.2, 0.6];
const LI = [-0.18, 0.03, 0.6]; // left fold line end
const RI = [0.18, 0.03, 0.6];
const LT = [-0.6, 0.1, 0.6]; // left wing tip
const RT = [0.6, 0.1, 0.6];

const WHITE = [0.97, 0.96, 0.93];
const FOLD = [0.88, 0.87, 0.84];
const KEEL = [0.8, 0.79, 0.76];

const tris: [number[], number[], number[], number[]][] = [
	[N, LT, LI, WHITE], // left outer wing
	[N, LI, T, FOLD], // left inner panel
	[N, T, RI, FOLD], // right inner panel
	[N, RI, RT, WHITE], // right outer wing
	[N, T, KL, KEEL], // keel left face
	[N, KR, T, KEEL], // keel right face
];

export interface PlaneModel {
	mesh: THREE.Mesh;
	/** Wobble the wing tips. `speed01` is 0..1. */
	flutter(time: number, speed01: number): void;
}

export function createPlaneModel(): PlaneModel {
	const pos: number[] = [];
	const col: number[] = [];
	for (const [a, b, c, color] of tris) {
		for (const p of [a, b, c]) {
			pos.push(...p);
			col.push(...color);
		}
	}

	const geo = new THREE.BufferGeometry();
	geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
	geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
	geo.computeVertexNormals();

	const mesh = new THREE.Mesh(
		geo,
		new THREE.MeshLambertMaterial({
			vertexColors: true,
			side: THREE.DoubleSide,
			flatShading: true,
		}),
	);
	mesh.castShadow = true;
	mesh.scale.setScalar(config.plane.scale);

	// Remember which vertices are wing tips so flutter can move them.
	const attr = geo.getAttribute("position") as THREE.BufferAttribute;
	const tips: { i: number; y: number; side: number }[] = [];
	for (let i = 0; i < attr.count; i++) {
		const x = attr.getX(i);
		if (Math.abs(x) > 0.5)
			tips.push({ i, y: attr.getY(i), side: Math.sign(x) });
	}

	return {
		mesh,
		flutter(time, speed01) {
			const p = config.plane;
			const a = p.flutterAmp * speed01;
			for (const t of tips) {
				attr.setY(t.i, t.y + Math.sin(time * p.flutterFreq + t.side) * a);
			}
			attr.needsUpdate = true;
		},
	};
}
