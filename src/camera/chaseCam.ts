import * as THREE from "three";
import { config } from "../config";
import type { HeightFn } from "../world/height";

// Sits behind and above the plane. Lerps position, slerps rotation,
// widens FOV with speed and never dips into the terrain.
export function createChaseCam(
	camera: THREE.PerspectiveCamera,
	groundAt: HeightFn,
) {
	const desired = new THREE.Vector3();
	const look = new THREE.Vector3();
	const fwd = new THREE.Vector3();
	const target = new THREE.Quaternion();
	const m = new THREE.Matrix4();
	const up = new THREE.Vector3(0, 1, 0);

	return {
		/** Jump straight to the target (on spawn). */
		snap(planePos: THREE.Vector3, yaw: number) {
			this.update(planePos, yaw, 0, Infinity);
		},
		update(planePos: THREE.Vector3, yaw: number, airspeed: number, dt: number) {
			const c = config.camera;
			// Follow heading only, not pitch/roll: calmer and easier to read.
			fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
			desired.copy(planePos).addScaledVector(fwd, -c.distance);
			desired.y += c.height;
			const floor =
				Math.max(groundAt(desired.x, desired.z), config.world.seaLevel) +
				c.groundMargin;
			if (desired.y < floor) desired.y = floor;

			camera.position.lerp(desired, 1 - Math.exp(-c.positionLerp * dt));

			look.copy(planePos).addScaledVector(fwd, c.lookAhead);
			m.lookAt(camera.position, look, up);
			target.setFromRotationMatrix(m);
			camera.quaternion.slerp(target, 1 - Math.exp(-c.rotationLerp * dt));

			const k = THREE.MathUtils.clamp(
				(airspeed - c.fovSpeedMin) / (c.fovSpeedMax - c.fovSpeedMin),
				0,
				1,
			);
			const fov = THREE.MathUtils.lerp(c.fovMin, c.fovMax, k);
			if (Math.abs(camera.fov - fov) > 0.01) {
				camera.fov += (fov - camera.fov) * (1 - Math.exp(-2 * dt));
				camera.updateProjectionMatrix();
			}
		},
	};
}
