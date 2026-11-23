import * as THREE from "three";

// A paper bubble around a plane while its shield is up: faceted, see-through, and it
// blinks in the last moments so you know it is about to drop.
export function createShield() {
	const mesh = new THREE.Mesh(
		new THREE.IcosahedronGeometry(1, 1),
		new THREE.MeshLambertMaterial({
			color: 0xffffff,
			emissive: 0xffffff,
			emissiveIntensity: 0.45,
			transparent: true,
			opacity: 0.28,
			flatShading: true,
			depthWrite: false,
			side: THREE.DoubleSide,
		}),
	);
	mesh.scale.setScalar(2.8); // in the plane's own units (it is a child of the plane mesh)
	mesh.visible = false;
	mesh.renderOrder = 2;
	const material = mesh.material as THREE.MeshLambertMaterial;
	return {
		mesh,
		/** `remaining` = seconds left (use a big number when you do not know). */
		update(active: boolean, remaining: number, time: number) {
			mesh.visible = active && (remaining > 0.8 || Math.sin(time * 40) > 0);
			if (!mesh.visible) return;
			material.opacity = 0.24 + 0.08 * Math.sin(time * 7);
			mesh.rotation.y = time * 0.8;
		},
	};
}
