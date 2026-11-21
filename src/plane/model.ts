import * as THREE from "three";
import { config } from "../config";
import { addBarycentric, createPaperMaterial } from "../render/paperMaterial";
import { LEG, PLANES, type PlaneId, type Tri } from "./types";

// The plane's mesh, built from a plane type's origami fold (see types.ts).
// Two-sided paper, a little emissive so the underside isn't grey. Wing tips flutter.

export interface PlaneModel {
	mesh: THREE.Mesh;
	/** Wobble the wing tips. `speed01` is 0..1. */
	flutter(time: number, speed01: number): void;
	/** Swap to another plane type's fold. */
	setType(id: PlaneId): void;
	/** Swing the legs (paper animals): `phase` advances as it runs; `amount` 1 = running, 0 = legs tucked for flight. */
	runPose(phase: number, amount: number): void;
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

	// Leg vertices (marked by their colour), so a paper animal can swing them when it runs.
	let legs: { i: number; y: number; z: number; side: number }[] = [];
	const findLegs = () => {
		const attr = mesh.geometry.getAttribute(
			"position",
		) as THREE.BufferAttribute;
		const col = mesh.geometry.getAttribute("color") as THREE.BufferAttribute;
		legs = [];
		for (let i = 0; i < attr.count; i++) {
			if (
				Math.abs(col.getX(i) - LEG[0]) +
					Math.abs(col.getY(i) - LEG[1]) +
					Math.abs(col.getZ(i) - LEG[2]) <
				0.02
			) {
				legs.push({
					i,
					y: attr.getY(i),
					z: attr.getZ(i),
					side: Math.sign(attr.getX(i)),
				});
			}
		}
	};
	findLegs();

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
			findLegs();
		},
		runPose(phase, amount) {
			if (legs.length === 0) return;
			const attr = mesh.geometry.getAttribute(
				"position",
			) as THREE.BufferAttribute;
			const tuck = 1 - amount; // in flight the legs fold back and up
			for (const l of legs) {
				const k = Math.min(1, Math.max(0, -l.y / 0.5)); // feet move most, hips stay put
				const swing = Math.sin(phase + l.side * 1.6) * 0.28 * amount;
				attr.setZ(l.i, l.z + k * (swing + tuck * 0.3));
				attr.setY(l.i, l.y + k * (tuck * 0.3 + Math.max(0, swing) * 0.12));
			}
			attr.needsUpdate = true;
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
