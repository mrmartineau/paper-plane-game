import * as THREE from "three";
import { config } from "../config";
import type { Hoop } from "../world/props";
import { addBarycentric, createPaperMaterial } from "./paperMaterial";

// Pool of bright folded-paper hoop rings (an octagon with a square section).
// Floating hoops bob a little. A hoop you've flown through is gold, and pulses when you pass.
// The poles are static and streamed with the world.

const PALETTE = [0xe8745a, 0xe9b949, 0x4fa3a5, 0x9b7fc8, 0xe58fb0].map(
	(c) => new THREE.Color(c),
);
const LIT = new THREE.Color(0xffe58a);
const CAPACITY = 256;

export function createHoopMeshes(scene: THREE.Scene) {
	const geo = addBarycentric(
		new THREE.TorusGeometry(1, config.props.hoopTube, 4, 8).toNonIndexed(),
	);
	geo.computeVertexNormals();
	const rings = new THREE.InstancedMesh(
		geo,
		createPaperMaterial({
			grainScale: config.paper.planeGrainScale / 4,
			objectSpace: true,
			emissive: 0xffffff,
			emissiveIntensity: 0.12,
		}),
		CAPACITY,
	);
	rings.castShadow = true;
	rings.frustumCulled = false;
	rings.count = 0;
	rings.setColorAt(0, LIT); // create the colour buffer up front
	scene.add(rings);

	const m = new THREE.Matrix4();
	const q = new THREE.Quaternion();
	const p = new THREE.Vector3();
	const s = new THREE.Vector3();
	const up = new THREE.Vector3(0, 1, 0);

	return {
		/** `passedAt`: hoop id → time you last flew through it. */
		update(hoops: Hoop[], time: number, passedAt: Map<string, number>) {
			const n = Math.min(hoops.length, CAPACITY);
			for (let i = 0; i < n; i++) {
				const h = hoops[i];
				const bob =
					h.kind === "float"
						? Math.sin(time * 0.6 + h.color) * config.props.hoopBob
						: 0;
				const since = time - (passedAt.get(h.id) ?? -Infinity);
				const pulse =
					since < 0.5 ? 1 + 0.15 * Math.sin((since / 0.5) * Math.PI) : 1;
				// TorusGeometry's hole faces local Z, same as the hoop.
				rings.setMatrixAt(
					i,
					m.compose(
						p.set(h.x, h.y + bob, h.z),
						q.setFromAxisAngle(up, h.yaw),
						s.setScalar(h.R * pulse),
					),
				);
				rings.setColorAt(
					i,
					passedAt.has(h.id) ? LIT : PALETTE[h.color % PALETTE.length],
				);
			}
			rings.count = n;
			rings.instanceMatrix.needsUpdate = true;
			if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
		},
	};
}
