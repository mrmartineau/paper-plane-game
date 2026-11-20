import * as THREE from "three";
import { config } from "../config";
import type { Course } from "../courses/generate";
import type { GhostSample } from "../courses/ghost";
import type { RingState } from "../courses/run";
import { addBarycentric, createPaperMaterial } from "./paperMaterial";

// Course visuals: rings (coloured by state in the run), start gates with a tall
// striped ribbon so you can find them from far away, and the ghost of your best run.

const IDLE = new THREE.Color(0xf6efe0);
const COLOURS: Record<RingState, THREE.Color> = {
	next: new THREE.Color(0xffcf4d),
	ahead: new THREE.Color(0xffffff),
	passed: new THREE.Color(0x8fc98a),
	missed: new THREE.Color(0xb0aca4),
};
const GATE = new THREE.Color(0xd8574a);
const WHITE = new THREE.Color(0xffffff);
const RINGS = 512;
const GATES = 32;

function ringGeo(): THREE.BufferGeometry {
	const g = addBarycentric(
		new THREE.TorusGeometry(1, config.courses.tube, 4, 10).toNonIndexed(),
	);
	g.computeVertexNormals();
	return g;
}

/** A tall twisted paper ribbon, red and white bands, from y = 0 up to y = 1. */
function ribbonGeo(): THREE.BufferGeometry {
	const g = new THREE.PlaneGeometry(1, 1, 1, 24).translate(0, 0.5, 0);
	const pos = g.getAttribute("position");
	for (let i = 0; i < pos.count; i++) {
		const y = pos.getY(i);
		const a = y * Math.PI * 3; // a few twists
		const x = pos.getX(i);
		pos.setXYZ(i, x * Math.cos(a), y, x * Math.sin(a));
	}
	const flat = g.toNonIndexed();
	flat.deleteAttribute("uv");
	const p = flat.getAttribute("position");
	const colors = new Float32Array(p.count * 3);
	const red = new THREE.Color(0xd8574a);
	const white = new THREE.Color(0xfbf8f1);
	for (let i = 0; i < p.count; i += 3) {
		const band =
			Math.floor(((p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3) * 12) % 2;
		for (let j = 0; j < 3; j++)
			(band ? red : white).toArray(colors, (i + j) * 3);
	}
	flat.setAttribute("color", new THREE.BufferAttribute(colors, 3));
	flat.computeVertexNormals();
	return addBarycentric(flat);
}

export function createCourseMeshes(
	scene: THREE.Scene,
	planeGeometry: THREE.BufferGeometry,
) {
	const paper = (extra: THREE.MeshLambertMaterialParameters = {}) =>
		createPaperMaterial({
			grainScale: config.paper.planeGrainScale / 4,
			objectSpace: true,
			emissive: 0xffffff,
			emissiveIntensity: 0.15,
			...extra,
		});
	const pool = (
		geo: THREE.BufferGeometry,
		material: THREE.Material,
		n: number,
	) => {
		const m = new THREE.InstancedMesh(geo, material, n);
		m.count = 0;
		m.frustumCulled = false;
		m.castShadow = true;
		m.setColorAt(0, IDLE); // create the colour buffer up front
		scene.add(m);
		return m;
	};
	const rings = pool(ringGeo(), paper(), RINGS);
	const gates = pool(ringGeo(), paper(), GATES);
	const ribbons = pool(
		ribbonGeo(),
		paper({ vertexColors: true, side: THREE.DoubleSide }),
		GATES,
	);

	const ghost = new THREE.Mesh(
		planeGeometry,
		new THREE.MeshBasicMaterial({
			color: 0xffffff,
			transparent: true,
			opacity: 0.35,
			depthWrite: false,
			side: THREE.DoubleSide,
		}),
	);
	ghost.scale.setScalar(config.plane.scale);
	ghost.visible = false;
	scene.add(ghost);

	const m = new THREE.Matrix4();
	const q = new THREE.Quaternion();
	const p = new THREE.Vector3();
	const s = new THREE.Vector3();
	const up = new THREE.Vector3(0, 1, 0);

	return {
		update(
			courses: Course[],
			active: Course | null,
			states: RingState[],
			time: number,
			ghostAt: GhostSample | null,
		) {
			let r = 0;
			let g = 0;
			for (const course of courses) {
				const isActive = active?.id === course.id;
				course.rings.forEach((ring, i) => {
					if (r >= RINGS) return;
					const state = isActive ? states[i] : null;
					const pulse = state === "next" ? 1 + 0.08 * Math.sin(time * 6) : 1;
					rings.setMatrixAt(
						r,
						m.compose(
							p.set(ring.x, ring.y, ring.z),
							q.setFromAxisAngle(up, ring.yaw),
							s.setScalar(ring.R * pulse),
						),
					);
					rings.setColorAt(r, state ? COLOURS[state] : IDLE);
					r++;
				});
				if (g >= GATES) continue;
				const gate = course.gate;
				q.setFromAxisAngle(up, gate.yaw);
				gates.setMatrixAt(
					g,
					m.compose(p.set(gate.x, gate.y, gate.z), q, s.setScalar(gate.R)),
				);
				gates.setColorAt(g, GATE);
				// The ribbon spins slowly above the gate.
				q.setFromAxisAngle(up, time * 0.6 + g);
				const h = config.courses.beaconHeight;
				ribbons.setMatrixAt(
					g,
					m.compose(p.set(gate.x, gate.y + gate.R, gate.z), q, s.set(3, h, 3)),
				);
				ribbons.setColorAt(g, WHITE); // its own red and white bands show through
				g++;
			}
			for (const [mesh, n] of [
				[rings, r],
				[gates, g],
				[ribbons, g],
			] as const) {
				mesh.count = n;
				mesh.instanceMatrix.needsUpdate = true;
				if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
			}

			ghost.visible = ghostAt !== null;
			if (ghostAt) {
				ghost.position.set(ghostAt.x, ghostAt.y, ghostAt.z);
				ghost.quaternion
					.set(ghostAt.qx, ghostAt.qy, ghostAt.qz, ghostAt.qw)
					.normalize();
			}
		},
	};
}
