import * as THREE from "three";
import { config } from "../config";

// Sits behind and above the plane. Lerps position, slerps rotation,
// widens FOV with speed (and boost) and never dips into the terrain.
// In normal flight the horizon stays level. In a loop or upside down the
// camera rolls with the plane so the loop reads clearly.
export function createChaseCam(
	camera: THREE.PerspectiveCamera,
	groundAt: (x: number, z: number) => number,
) {
	const desired = new THREE.Vector3();
	const offset = new THREE.Vector3();
	let boostAmount = 0;
	const look = new THREE.Vector3();
	const fwd = new THREE.Vector3();
	const planeUp = new THREE.Vector3();
	const camUp = new THREE.Vector3(0, 1, 0);
	const worldUp = new THREE.Vector3(0, 1, 0);
	const target = new THREE.Quaternion();
	const m = new THREE.Matrix4();

	function update(
		pos: THREE.Vector3,
		q: THREE.Quaternion,
		airspeed: number,
		boosting: boolean,
		air: number,
		dt: number,
	) {
		const c = config.camera;
		fwd.set(0, 0, -1).applyQuaternion(q);
		planeUp.set(0, 1, 0).applyQuaternion(q);

		const looping = Math.abs(fwd.y) > 0.5 || planeUp.y < 0;
		camUp
			.lerp(looping ? planeUp : worldUp, 1 - Math.exp(-c.upLerp * dt))
			.normalize();

		// Smooth the offset from the plane, not the world position, so speed doesn't add lag.
		desired
			.copy(fwd)
			.multiplyScalar(-c.distance)
			.addScaledVector(camUp, c.height);
		desired.y -= air * c.airLag; // camera trails vertical air movement, so the plane visibly lifts or drops
		offset.lerp(desired, 1 - Math.exp(-c.positionLerp * dt));
		camera.position.copy(pos).add(offset);
		// Rocket rumble: a little shake while boosting (smooth sines, not random jitter).
		boostAmount += ((boosting ? 1 : 0) - boostAmount) * (1 - Math.exp(-6 * dt));
		if (boostAmount > 0.01) {
			const t = performance.now() / 1000;
			const a = config.boostTrail.shake * boostAmount;
			camera.position.x += Math.sin(t * 37) * a;
			camera.position.y += Math.sin(t * 43 + 1) * a;
			camera.position.z += Math.sin(t * 29 + 2) * a;
		}
		const floor =
			groundAt(camera.position.x, camera.position.z) + c.groundMargin;
		if (camera.position.y < floor) camera.position.y = floor;

		look.copy(pos).addScaledVector(fwd, c.lookAhead);
		m.lookAt(camera.position, look, camUp);
		target.setFromRotationMatrix(m);
		camera.quaternion.slerp(target, 1 - Math.exp(-c.rotationLerp * dt));

		const k = THREE.MathUtils.clamp(
			(airspeed - c.fovSpeedMin) / (c.fovSpeedMax - c.fovSpeedMin),
			0,
			1,
		);
		const fov =
			THREE.MathUtils.lerp(c.fovMin, c.fovMax, k) +
			(boosting ? config.boostTrail.fovKick : 0);
		if (Math.abs(camera.fov - fov) > 0.01) {
			camera.fov += (fov - camera.fov) * (1 - Math.exp(-3 * dt));
			camera.updateProjectionMatrix();
		}
	}

	return {
		update,
		/** Jump straight to the target (on spawn). */
		snap(pos: THREE.Vector3, q: THREE.Quaternion) {
			camUp.copy(worldUp);
			update(pos, q, 0, false, 0, Infinity);
		},
	};
}
