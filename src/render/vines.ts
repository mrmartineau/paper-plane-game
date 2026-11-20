import * as THREE from "three";
import { config } from "../config";
import type { Vine } from "../world/props";
import { addBarycentric, createPaperMaterial } from "./paperMaterial";
import { crumple } from "./templates";

// Pool of thick hanging vines (banded green paper) that sway a little.

const VINES = [0x5d8a55, 0x6f9a5c].map((c) => new THREE.Color(c));
const CAPACITY = 3000;

function vineGeo(): THREE.BufferGeometry {
	// Unit vine: radius 1 at the top tapering to 0.6, hanging from y = 0 to y = -1.
	const g = crumple(
		new THREE.CylinderGeometry(1, 0.6, 1, 5, 12)
			.translate(0, -0.5, 0)
			.toNonIndexed(),
		"vine",
		0.9,
		0,
		0.9,
	);
	g.deleteAttribute("uv");
	const pos = g.getAttribute("position");
	const colors = new Float32Array(pos.count * 3);
	for (let i = 0; i < pos.count; i += 3) {
		const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
		const c = VINES[Math.floor(-y * 12) % 2];
		for (let j = 0; j < 3; j++) c.toArray(colors, (i + j) * 3);
	}
	g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
	g.computeVertexNormals();
	return addBarycentric(g);
}

export function createVineMeshes(scene: THREE.Scene) {
	const vines = new THREE.InstancedMesh(
		vineGeo(),
		createPaperMaterial({
			grainScale: config.paper.terrainGrainScale * 2,
			vertexColors: true,
		}),
		CAPACITY,
	);
	vines.castShadow = true;
	vines.receiveShadow = true;
	vines.frustumCulled = false;
	vines.count = 0;
	scene.add(vines);

	const m = new THREE.Matrix4();
	const q = new THREE.Quaternion();
	const p = new THREE.Vector3();
	const s = new THREE.Vector3();
	const e = new THREE.Euler();

	return {
		update(list: Vine[], time: number) {
			const sway = config.props.vineSway;
			const n = Math.min(list.length, CAPACITY);
			for (let i = 0; i < n; i++) {
				const v = list[i];
				e.set(
					Math.sin(time * 0.5 + v.phase) * sway,
					0,
					Math.cos(time * 0.37 + v.phase) * sway,
				);
				vines.setMatrixAt(
					i,
					m.compose(
						p.set(v.x, v.top, v.z),
						q.setFromEuler(e),
						s.set(v.r, v.length, v.r),
					),
				);
			}
			vines.count = n;
			vines.instanceMatrix.needsUpdate = true;
		},
	};
}
