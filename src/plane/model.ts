import * as THREE from "three";
import { config } from "../config";
import { addBarycentric, createPaperMaterial } from "../render/paperMaterial";
import { PLANES, type PlaneId, type Tri } from "./types";

// The plane's mesh, built from a plane type's origami fold (see types.ts).
// Two-sided paper, a little emissive so the underside isn't grey. Wing tips flutter.

export interface PlaneModel {
	mesh: THREE.Mesh;
	/** Wobble the wing tips. `speed01` is 0..1. */
	flutter(time: number, speed01: number): void;
	/** Swap to another plane type's fold. */
	setType(id: PlaneId): void;
}

function foldGeometry(tris: Tri[]): THREE.BufferGeometry {
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
	return addBarycentric(geo);
}

export function createPlaneModel(id: PlaneId): PlaneModel {
	const mesh = new THREE.Mesh(
		foldGeometry(PLANES[id].tris),
		createPaperMaterial({
			grainScale: config.paper.planeGrainScale,
			objectSpace: true,
			vertexColors: true,
			side: THREE.DoubleSide,
			emissive: 0xffffff,
			emissiveIntensity: 0.18, // paper lets a little light through, so the underside isn't grey
		}),
	);
	mesh.castShadow = true;
	mesh.scale.setScalar(config.plane.scale);

	// Which vertices are wing tips (the outer part of the span), so flutter can move them.
	let tips: { i: number; y: number; side: number }[] = [];
	const findTips = () => {
		const attr = mesh.geometry.getAttribute(
			"position",
		) as THREE.BufferAttribute;
		let span = 0;
		for (let i = 0; i < attr.count; i++)
			span = Math.max(span, Math.abs(attr.getX(i)));
		tips = [];
		for (let i = 0; i < attr.count; i++) {
			const x = attr.getX(i);
			if (Math.abs(x) > span * 0.7)
				tips.push({ i, y: attr.getY(i), side: Math.sign(x) });
		}
	};
	findTips();

	return {
		mesh,
		flutter(time, speed01) {
			const attr = mesh.geometry.getAttribute(
				"position",
			) as THREE.BufferAttribute;
			const p = config.plane;
			const a = p.flutterAmp * speed01;
			for (const t of tips)
				attr.setY(t.i, t.y + Math.sin(time * p.flutterFreq + t.side) * a);
			attr.needsUpdate = true;
		},
		setType(next) {
			const old = mesh.geometry;
			mesh.geometry = foldGeometry(PLANES[next].tris);
			old.dispose();
			findTips();
		},
	};
}

/** A scrunched-up paper ball shape: an icosphere with every corner pushed in or out. */
export function paperBallGeometry(
	radius: number,
	detail = 1,
): THREE.BufferGeometry {
	const geo = new THREE.IcosahedronGeometry(radius, detail); // non-indexed
	const pos = geo.getAttribute("position") as THREE.BufferAttribute;
	const jitter = new Map<string, number>(); // shared corners move together, so no cracks
	const v = new THREE.Vector3();
	for (let i = 0; i < pos.count; i++) {
		v.fromBufferAttribute(pos, i);
		const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
		let k = jitter.get(key);
		if (k === undefined) {
			k = 0.7 + Math.random() * 0.5;
			jitter.set(key, k);
		}
		v.multiplyScalar(k);
		pos.setXYZ(i, v.x, v.y, v.z);
	}
	geo.computeVertexNormals();
	return addBarycentric(geo);
}

export function paperBallMaterial(): THREE.MeshLambertMaterial {
	return createPaperMaterial({
		grainScale: config.paper.planeGrainScale,
		objectSpace: true,
		color: 0xf4f1ea,
		emissive: 0xffffff,
		emissiveIntensity: 0.15,
	});
}

export function createPaperBall(): THREE.Mesh {
	const mesh = new THREE.Mesh(
		paperBallGeometry(config.crash.ballRadius),
		paperBallMaterial(),
	);
	mesh.castShadow = true;
	return mesh;
}
