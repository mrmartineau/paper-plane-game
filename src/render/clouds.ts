import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { config } from "../config";
import { rngFor } from "../core/rng";
import type { Cloud } from "../world/clouds";
import { addBarycentric, createPaperMaterial } from "./paperMaterial";

// Paper cut-out clouds: each is three puffy cut-out layers crossing at 60°, so it
// reads as a cloud from any side. A few shapes, pooled with InstancedMesh, drifting
// with the wind. You can fly through them.

const SHAPES = 4;
const CAPACITY = 96; // per shape

/** One puffy outline, 1 unit wide, flat bottom at y = 0. */
function layer(seed: string): THREE.BufferGeometry {
	const rand = rngFor(seed);
	const bumps = Array.from({ length: 4 + Math.floor(rand() * 3) }, () => ({
		x: -0.35 + rand() * 0.7,
		r: 0.12 + rand() * 0.18,
	}));
	const shape = new THREE.Shape();
	shape.moveTo(-0.5, 0);
	const steps = 28;
	for (let i = 0; i <= steps; i++) {
		const x = -0.5 + i / steps;
		let y = 0.02;
		for (const b of bumps) {
			const d = x - b.x;
			if (Math.abs(d) < b.r)
				y = Math.max(y, Math.sqrt(b.r * b.r - d * d) + b.r * 0.4);
		}
		shape.lineTo(x, y);
	}
	shape.lineTo(0.5, 0);
	return new THREE.ShapeGeometry(shape);
}

function cloudGeo(index: number): THREE.BufferGeometry {
	const parts = [0, 1, 2].map((k) => {
		const g = layer(`cloud${index}:${k}`).rotateY((k * Math.PI) / 3);
		g.scale(1 - k * 0.12, 1 - k * 0.1, 1 - k * 0.12);
		g.deleteAttribute("uv");
		return g.toNonIndexed();
	});
	const g = mergeGeometries(parts);
	// Lighter on top, a touch of blue-grey underneath.
	const pos = g.getAttribute("position");
	const top = new THREE.Color(0xffffff);
	const under = new THREE.Color(0xdde6ee);
	const colors = new Float32Array(pos.count * 3);
	const c = new THREE.Color();
	for (let i = 0; i < pos.count; i++)
		c.copy(under)
			.lerp(top, Math.min(1, pos.getY(i) * 3))
			.toArray(colors, i * 3);
	g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
	g.computeVertexNormals();
	return addBarycentric(g);
}

export function createClouds(scene: THREE.Scene) {
	const material = createPaperMaterial({
		grainScale: config.paper.terrainGrainScale,
		vertexColors: true,
		side: THREE.DoubleSide,
		emissive: 0xffffff,
		emissiveIntensity: 0.3,
	});
	const meshes = Array.from({ length: SHAPES }, (_, i) => {
		const m = new THREE.InstancedMesh(cloudGeo(i), material, CAPACITY);
		m.count = 0;
		m.frustumCulled = false;
		m.castShadow = true;
		scene.add(m);
		return m;
	});

	const m4 = new THREE.Matrix4();
	const q = new THREE.Quaternion();
	const p = new THREE.Vector3();
	const s = new THREE.Vector3();
	const up = new THREE.Vector3(0, 1, 0);

	return {
		update(clouds: Cloud[], drift: { x: number; z: number }) {
			const counts = new Array(SHAPES).fill(0);
			for (const c of clouds) {
				const k = c.shape % SHAPES;
				if (counts[k] >= CAPACITY) continue;
				m4.compose(
					p.set(c.x + drift.x, c.y, c.z + drift.z),
					q.setFromAxisAngle(up, c.yaw),
					s.setScalar(c.size),
				);
				meshes[k].setMatrixAt(counts[k]++, m4);
			}
			meshes.forEach((m, k) => {
				m.count = counts[k];
				m.instanceMatrix.needsUpdate = true;
			});
		},
	};
}
