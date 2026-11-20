import * as THREE from "three";
import { config } from "../config";

// A gradient sky dome that follows the camera. Its horizon matches the fog colour,
// so the end of the world fades into the sky.

export function createSky(scene: THREE.Scene) {
	const r = config.render;
	const material = new THREE.ShaderMaterial({
		side: THREE.BackSide,
		depthWrite: false,
		fog: false,
		uniforms: {
			horizon: { value: new THREE.Color(r.skyColor) },
			zenith: { value: new THREE.Color(r.zenithColor) },
		},
		vertexShader: `
			varying vec3 vDir;
			void main() {
				vDir = normalize(position);
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
			}`,
		fragmentShader: `
			uniform vec3 horizon;
			uniform vec3 zenith;
			varying vec3 vDir;
			void main() {
				float t = smoothstep(0.0, 0.55, vDir.y);
				gl_FragColor = vec4(mix(horizon, zenith, t), 1.0);
				#include <colorspace_fragment>
			}`,
	});
	const dome = new THREE.Mesh(
		new THREE.SphereGeometry(config.camera.far * 0.9, 24, 12),
		material,
	);
	dome.renderOrder = -1;
	dome.frustumCulled = false;
	scene.add(dome);
	return {
		update(camera: THREE.Camera) {
			dome.position.copy(camera.position);
		},
	};
}
