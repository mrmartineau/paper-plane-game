import * as THREE from "three";
import { config } from "../config";
import type { AirColumn } from "../world/thermals";

// Makes air visible: each column is a faint tinted tube full of paper confetti.
// Warm confetti rises (lift), blue confetti falls (sinking air).
// Particle positions come from time + fixed randoms, so there is no per-particle state.

const UP_TUBE = new THREE.Color(0xffd29a);
const DOWN_TUBE = new THREE.Color(0x8fb6e6);
const UP_BITS = [0xf6e7c8, 0xf2c48d, 0xe8a87c, 0xfff8ec].map(
	(c) => new THREE.Color(c),
);
const DOWN_BITS = [0xb7cde3, 0x8fb3d9, 0xdde8f2, 0x7d9fc8].map(
	(c) => new THREE.Color(c),
);

export function createAirColumns(
	scene: THREE.Scene,
	columnsNear: (x: number, z: number, r: number) => AirColumn[],
) {
	const a = config.air;
	const per = a.particlesPerColumn;

	const confetti = new THREE.InstancedMesh(
		new THREE.PlaneGeometry(a.particleSize, a.particleSize * 0.65),
		new THREE.MeshLambertMaterial({
			side: THREE.DoubleSide,
			emissive: 0xffffff,
			emissiveIntensity: 0.3, // keeps shaded bits from going muddy
		}),
		a.maxColumns * per,
	);
	confetti.frustumCulled = false;

	const tubeGeo = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true);
	tubeGeo.translate(0, 0.5, 0); // base at y = 0
	const tubes = new THREE.InstancedMesh(
		tubeGeo,
		new THREE.MeshBasicMaterial({
			transparent: true,
			opacity: a.columnOpacity,
			depthWrite: false,
			side: THREE.DoubleSide,
		}),
		a.maxColumns,
	);
	tubes.frustumCulled = false;
	confetti.setColorAt(0, UP_TUBE); // create the colour buffers up front
	tubes.setColorAt(0, UP_TUBE);
	scene.add(confetti, tubes);

	// Fixed randoms per particle slot: radius, angle, height phase, tumble, colour.
	const rnd = Float32Array.from({ length: per * 5 }, Math.random);

	const m = new THREE.Matrix4();
	const q = new THREE.Quaternion();
	const e = new THREE.Euler();
	const p = new THREE.Vector3();
	const s = new THREE.Vector3();
	let cols: AirColumn[] = [];
	let lastQuery = -Infinity;

	return {
		update(focus: THREE.Vector3, time: number) {
			// Re-pick the nearest columns twice a second, not every frame.
			if (time - lastQuery > 0.5) {
				lastQuery = time;
				cols = columnsNear(focus.x, focus.z, a.visibleRange)
					.sort((u, v) => dist2(u, focus) - dist2(v, focus))
					.slice(0, a.maxColumns);
			}

			let n = 0;
			cols.forEach((c, ci) => {
				const up = c.strength > 0;
				m.compose(
					p.set(c.x, c.base, c.z),
					q.identity(),
					s.set(c.radius, c.top, c.radius),
				);
				tubes.setMatrixAt(ci, m);
				tubes.setColorAt(ci, up ? UP_TUBE : DOWN_TUBE);

				const rate = (Math.abs(c.strength) * 2.5) / c.top; // visibly faster than the real air
				const bits = up ? UP_BITS : DOWN_BITS;
				for (let i = 0; i < per; i++) {
					const r = rnd.subarray(i * 5, i * 5 + 5);
					const f = fract(r[2] + time * rate + c.id * 0.137);
					const h = up ? f : 1 - f;
					const ang =
						r[1] * Math.PI * 2 + time * a.spin * (up ? 1 : -1) * (0.5 + r[3]);
					const rad = c.radius * Math.sqrt(r[0]);
					p.set(
						c.x + Math.cos(ang) * rad,
						c.base + h * c.top,
						c.z + Math.sin(ang) * rad,
					);
					e.set(time * (1 + r[3] * 3), time * (0.5 + r[4] * 2), r[0] * 6);
					const size = Math.sin(f * Math.PI); // fade in and out at the ends
					m.compose(p, q.setFromEuler(e), s.setScalar(size));
					confetti.setMatrixAt(n, m);
					confetti.setColorAt(n, bits[Math.floor(r[4] * bits.length)]);
					n++;
				}
			});

			confetti.count = n;
			tubes.count = cols.length;
			confetti.instanceMatrix.needsUpdate = true;
			tubes.instanceMatrix.needsUpdate = true;
			if (confetti.instanceColor) confetti.instanceColor.needsUpdate = true;
			if (tubes.instanceColor) tubes.instanceColor.needsUpdate = true;
		},
	};
}

function fract(x: number): number {
	return x - Math.floor(x); // unlike % 1, never negative
}

function dist2(c: AirColumn, p: THREE.Vector3): number {
	return (c.x - p.x) ** 2 + (c.z - p.z) ** 2;
}
