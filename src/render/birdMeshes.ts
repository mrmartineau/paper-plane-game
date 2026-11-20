import * as THREE from "three";
import { config } from "../config";
import { type Bird, type BirdPose, birdPose } from "../world/birds";
import { addBarycentric, createPaperMaterial } from "./paperMaterial";

// Origami birds: a thin folded body plus two wings that flap on a hinge along the body.
// Three InstancedMeshes (body, left wing, right wing). Nose is local -Z.

const PALETTE = [0xfbf8f1, 0xf6d5d5, 0xd6e4f0, 0xf3e6c4].map(
	(c) => new THREE.Color(c),
);

function tris(points: number[][]): THREE.BufferGeometry {
	const g = new THREE.BufferGeometry();
	g.setAttribute(
		"position",
		new THREE.Float32BufferAttribute(points.flat(), 3),
	);
	g.computeVertexNormals();
	return addBarycentric(g);
}

const H = [0, 0.25, -0.75]; // head
const T = [0, 0.2, 0.7]; // tail
const C = [0, 0.12, 0]; // back
const B = [0, -0.15, 0]; // belly
const HF = [0, 0.05, -0.2]; // wing hinge front
const HB = [0, 0.05, 0.3]; // wing hinge back

const CAPACITY = 512;

/** A pool of bird meshes; `update` is given the birds near the player each frame. */
export function createBirdMeshes(scene: THREE.Scene) {
	const material = createPaperMaterial({
		grainScale: config.paper.planeGrainScale,
		objectSpace: true,
		side: THREE.DoubleSide,
		emissive: 0xffffff,
		emissiveIntensity: 0.15,
	});
	const make = (geo: THREE.BufferGeometry) => {
		const mesh = new THREE.InstancedMesh(geo, material, CAPACITY);
		mesh.count = 0;
		mesh.setColorAt(0, PALETTE[0]); // create the colour buffer up front
		mesh.castShadow = true;
		mesh.frustumCulled = false;
		scene.add(mesh);
		return mesh;
	};
	const body = make(tris([H, C, B, T, B, C]));
	const left = make(tris([HF, [-0.65, 0.05, 0.15], HB]));
	const right = make(tris([HF, HB, [0.65, 0.05, 0.15]]));

	const pose: BirdPose = { x: 0, y: 0, z: 0, yaw: 0, bank: 0 };
	const base = new THREE.Matrix4();
	const wing = new THREE.Matrix4();
	const q = new THREE.Quaternion();
	const e = new THREE.Euler(0, 0, 0, "YXZ");
	const p = new THREE.Vector3();
	const s = new THREE.Vector3();
	const zAxis = new THREE.Vector3(0, 0, 1);

	return {
		update(all: Bird[], time: number) {
			const birds = all.length > CAPACITY ? all.slice(0, CAPACITY) : all;
			const size = config.birds.size;
			birds.forEach((b, i) => {
				birdPose(b, time, pose);
				base.compose(
					p.set(pose.x, pose.y, pose.z),
					q.setFromEuler(e.set(0, pose.yaw, -pose.bank)),
					s.setScalar(size),
				);
				body.setMatrixAt(i, base);
				const c = PALETTE[b.tint % PALETTE.length];
				body.setColorAt(i, c);
				left.setColorAt(i, c);
				right.setColorAt(i, c);
				const flap =
					(0.1 + 0.7 * b.flap) *
					Math.sin(time * config.birds.flapSpeed + b.phase * 7);
				left.setMatrixAt(
					i,
					wing.makeRotationAxis(zAxis, -flap).premultiply(base),
				);
				right.setMatrixAt(
					i,
					wing.makeRotationAxis(zAxis, flap).premultiply(base),
				);
			});
			for (const mesh of [body, left, right]) {
				mesh.count = birds.length;
				if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
			}
			body.instanceMatrix.needsUpdate = true;
			left.instanceMatrix.needsUpdate = true;
			right.instanceMatrix.needsUpdate = true;
		},
	};
}
