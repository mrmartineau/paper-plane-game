import * as THREE from "three";
import { config } from "../config";
import { paperBallGeometry, paperBallMaterial } from "../plane/model";

// While boosting, the plane puffs out little scrunched-up paper balls that tumble away and drop.
export function createBoostTrail(scene: THREE.Scene) {
	const b = config.boostTrail;
	const mesh = new THREE.InstancedMesh(
		paperBallGeometry(1, 0),
		paperBallMaterial(),
		b.count,
	);
	mesh.frustumCulled = false;
	mesh.castShadow = true;
	scene.add(mesh);

	const parts = Array.from({ length: b.count }, () => ({
		pos: new THREE.Vector3(),
		vel: new THREE.Vector3(),
		rot: new THREE.Euler(),
		spin: new THREE.Vector3(),
		size: 1,
		age: Infinity,
	}));
	let next = 0;
	let owed = 0;
	const m = new THREE.Matrix4();
	const q = new THREE.Quaternion();
	const s = new THREE.Vector3();
	const tail = new THREE.Vector3();
	const rnd = () => Math.random() - 0.5;

	return {
		update(
			dt: number,
			boosting: boolean,
			planePos: THREE.Vector3,
			forward: THREE.Vector3,
			planeVel: THREE.Vector3,
		) {
			if (boosting) {
				owed += b.rate * dt;
				tail.copy(planePos).addScaledVector(forward, -0.7 * config.plane.scale);
				for (; owed >= 1; owed--) {
					const p = parts[next];
					next = (next + 1) % parts.length;
					p.age = 0;
					p.size = b.size * (0.7 + Math.random() * 0.6);
					p.pos.copy(tail);
					p.vel
						.set(rnd(), rnd(), rnd())
						.multiplyScalar(b.spread * 2)
						.addScaledVector(forward, -b.puff)
						.addScaledVector(planeVel, b.inherit); // trail along behind, not straight at the camera
					p.vel.y -= b.drop;
					p.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
					p.spin.set(rnd(), rnd(), rnd()).multiplyScalar(12);
				}
			} else {
				owed = 0;
			}

			parts.forEach((p, i) => {
				p.age += dt;
				const k = p.age / b.life;
				if (k >= 1) {
					m.makeScale(0, 0, 0);
				} else {
					p.vel.y -= b.gravity * dt;
					p.vel.multiplyScalar(Math.exp(-b.drag * dt));
					p.pos.addScaledVector(p.vel, dt);
					p.rot.set(
						p.rot.x + p.spin.x * dt,
						p.rot.y + p.spin.y * dt,
						p.rot.z + p.spin.z * dt,
					);
					const shrink = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3; // full size, then shrink away at the end
					m.compose(p.pos, q.setFromEuler(p.rot), s.setScalar(p.size * shrink));
				}
				mesh.setMatrixAt(i, m);
			});
			mesh.instanceMatrix.needsUpdate = true;
		},
	};
}
