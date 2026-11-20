import * as THREE from "three";
import { config } from "../config";
import type { Hoop } from "../world/props";
import { addBarycentric, createPaperMaterial } from "./paperMaterial";

// Bright folded-paper hoops (an octagon with a square section) and their poles.
// Floating hoops bob a little. A hoop you fly through turns gold and pulses.

const PALETTE = [0xe8745a, 0xe9b949, 0x4fa3a5, 0x9b7fc8, 0xe58fb0].map(
	(c) => new THREE.Color(c),
);
const LIT = new THREE.Color(0xffe58a);
const POLE = new THREE.Color(0xf4efe4);

export function createHoopMeshes(scene: THREE.Scene, hoops: Hoop[]) {
	const tube = config.props.hoopTube;
	const ringGeo = addBarycentric(
		new THREE.TorusGeometry(1, tube, 4, 8).toNonIndexed(),
	);
	ringGeo.computeVertexNormals();
	const rings = new THREE.InstancedMesh(
		ringGeo,
		createPaperMaterial({
			grainScale: config.paper.planeGrainScale / 4,
			objectSpace: true,
			emissive: 0xffffff,
			emissiveIntensity: 0.12,
		}),
		Math.max(1, hoops.length),
	);
	rings.castShadow = true;
	rings.frustumCulled = false;

	const poleList = hoops.filter((h) => h.kind === "pole");
	const poleGeo = addBarycentric(
		new THREE.CylinderGeometry(1, 1, 1, 5).toNonIndexed(),
	);
	poleGeo.translate(0, 0.5, 0);
	poleGeo.computeVertexNormals();
	const poles = new THREE.InstancedMesh(
		poleGeo,
		createPaperMaterial({ grainScale: config.paper.terrainGrainScale * 4 }),
		Math.max(1, poleList.length),
	);
	poles.castShadow = true;
	poles.receiveShadow = true;
	poles.count = poleList.length;

	const m = new THREE.Matrix4();
	const q = new THREE.Quaternion();
	const p = new THREE.Vector3();
	const s = new THREE.Vector3();
	const up = new THREE.Vector3(0, 1, 0);
	const color = new THREE.Color();

	poleList.forEach((h, i) => {
		const r = config.props.poleRadius;
		poles.setMatrixAt(
			i,
			m.compose(
				p.set(h.x, h.base - 0.5, h.z),
				q.identity(),
				s.set(r, h.y - h.R - h.base + 0.5, r),
			),
		);
		poles.setColorAt(i, POLE);
	});
	scene.add(rings, poles);

	const passedAt = new Float64Array(hoops.length).fill(-Infinity);

	return {
		/** Mark a hoop as flown through. */
		pass(i: number, time: number) {
			passedAt[i] = time;
		},
		update(time: number) {
			hoops.forEach((h, i) => {
				const bob =
					h.kind === "float"
						? Math.sin(time * 0.6 + i) * config.props.hoopBob
						: 0;
				// TorusGeometry's hole faces local Z, same as the hoop.
				q.setFromAxisAngle(up, h.yaw);
				const since = time - passedAt[i];
				const pulse =
					since < 0.5 ? 1 + 0.15 * Math.sin((since / 0.5) * Math.PI) : 1;
				rings.setMatrixAt(
					i,
					m.compose(p.set(h.x, h.y + bob, h.z), q, s.setScalar(h.R * pulse)),
				);
				rings.setColorAt(
					i,
					passedAt[i] > -Infinity
						? LIT
						: color.copy(PALETTE[h.color % PALETTE.length]),
				);
			});
			rings.count = hoops.length;
			rings.instanceMatrix.needsUpdate = true;
			if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
		},
	};
}
