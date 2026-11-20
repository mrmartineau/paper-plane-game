import * as THREE from "three";
import { config } from "../config";
import { rngFor } from "../core/rng";

// A gradient sky dome that follows the camera, plus stars that fade in at night.
// The horizon colour is also the fog colour, so the end of the world fades into the sky.

export function createSky(scene: THREE.Scene) {
	const r = config.render;
	const radius = config.camera.far * 0.9;
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
		new THREE.SphereGeometry(radius, 24, 12),
		material,
	);
	dome.renderOrder = -1;
	dome.frustumCulled = false;

	// Stars: points on the upper part of the dome.
	const rand = rngFor("stars");
	const pts = new Float32Array(900 * 3);
	for (let i = 0; i < 900; i++) {
		const a = rand() * Math.PI * 2;
		const y = 0.08 + rand() * 0.92;
		const ring = Math.sqrt(1 - y * y);
		pts.set(
			[
				Math.cos(a) * ring * radius * 0.95,
				y * radius * 0.95,
				Math.sin(a) * ring * radius * 0.95,
			],
			i * 3,
		);
	}
	const starGeo = new THREE.BufferGeometry();
	starGeo.setAttribute("position", new THREE.BufferAttribute(pts, 3));
	const starMaterial = new THREE.PointsMaterial({
		color: 0xfff6e0,
		size: 2,
		sizeAttenuation: false,
		transparent: true,
		opacity: 0,
		depthWrite: false,
		fog: false,
	});
	const stars = new THREE.Points(starGeo, starMaterial);
	stars.renderOrder = -1;
	stars.frustumCulled = false;
	dome.add(stars);
	scene.add(dome);

	return {
		update(
			camera: THREE.Camera,
			horizon: THREE.Color,
			zenith: THREE.Color,
			night: number,
		) {
			dome.position.copy(camera.position);
			material.uniforms.horizon.value.copy(horizon);
			material.uniforms.zenith.value.copy(zenith);
			starMaterial.opacity = night * 0.9;
			stars.visible = night > 0.01;
		},
	};
}
