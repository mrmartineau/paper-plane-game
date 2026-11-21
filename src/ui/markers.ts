// Markers for other players, drawn over the 3D view:
// - in view: a bright ring around the plane with the distance under it
// - out of view: an arrow on the screen edge pointing the way, with the distance
// The nearest player is the "target": bigger and pulsing, so you know who to follow.
import type * as THREE from "three";

export interface Peer {
	id: number;
	x: number;
	y: number;
	z: number;
	colour: string;
}

interface Marker {
	el: HTMLElement;
	ring: HTMLElement;
	arrow: HTMLElement;
	label: HTMLElement;
}

// Space kept clear around the screen edge for arrows. On touch screens, keep out from under
// the pause button and radar (top) and the boost and fire buttons (bottom).
const coarse = matchMedia("(pointer: coarse)").matches;
const EDGE = { l: 44, r: 44, t: coarse ? 84 : 44, b: coarse ? 104 : 44 };

export function createMarkers(camera: THREE.PerspectiveCamera) {
	const root = document.getElementById("markers") as HTMLElement;
	const marks = new Map<number, Marker>();
	const v = { x: 0, y: 0, z: 0 };

	function make(): Marker {
		const el = document.createElement("div");
		el.className = "marker";
		el.innerHTML =
			'<span class="m-ring"></span><span class="m-arrow"></span><span class="m-label"></span>';
		root.append(el);
		return {
			el,
			ring: el.querySelector(".m-ring") as HTMLElement,
			arrow: el.querySelector(".m-arrow") as HTMLElement,
			label: el.querySelector(".m-label") as HTMLElement,
		};
	}

	return {
		/** Call every frame after the camera has moved. `me` = your position. */
		update(
			me: { x: number; y: number; z: number },
			peers: Peer[],
			lockedId: number | null = null,
		) {
			const seen = new Set<number>();
			const w = innerWidth;
			const h = innerHeight;
			let nearest = -1;
			let nearestD = Infinity;
			for (const p of peers) {
				const d = Math.hypot(p.x - me.x, p.y - me.y, p.z - me.z);
				if (d < nearestD) {
					nearestD = d;
					nearest = p.id;
				}
			}
			camera.updateMatrixWorld();
			for (const p of peers) {
				seen.add(p.id);
				let m = marks.get(p.id);
				if (!m) {
					m = make();
					marks.set(p.id, m);
				}
				// Position in camera space: z > 0 means behind the camera.
				const e = camera.matrixWorldInverse.elements;
				const cz = e[2] * p.x + e[6] * p.y + e[10] * p.z + e[14];
				v.x = p.x;
				v.y = p.y;
				v.z = p.z;
				const ndc = project(camera, v);
				const behind = cz > 0;
				let sx = (ndc.x * 0.5 + 0.5) * w;
				let sy = (-ndc.y * 0.5 + 0.5) * h;
				const inView =
					!behind &&
					sx > EDGE.l &&
					sx < w - EDGE.r &&
					sy > EDGE.t &&
					sy < h - EDGE.b;
				let angle = 0;
				if (!inView) {
					// Aim from the middle of the screen toward the player, clamp to the edge.
					let dx = sx - w / 2;
					let dy = sy - h / 2;
					if (behind) {
						dx = -dx;
						dy = -dy;
					}
					if (Math.abs(dx) < 1 && Math.abs(dy) < 1) dy = h; // dead behind: point down
					const k = Math.min(
						(dx > 0 ? w - EDGE.r - w / 2 : w / 2 - EDGE.l) /
							(Math.abs(dx) || 1e-6),
						(dy > 0 ? h - EDGE.b - h / 2 : h / 2 - EDGE.t) /
							(Math.abs(dy) || 1e-6),
					);
					sx = w / 2 + dx * k;
					sy = h / 2 + dy * k;
					angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
				}
				m.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
				m.el.style.setProperty("--c", p.colour);
				m.el.classList.toggle("target", p.id === nearest);
				m.el.classList.toggle("locked", p.id === lockedId);
				m.ring.hidden = !inView;
				m.arrow.hidden = inView;
				if (!inView) m.arrow.style.transform = `rotate(${angle.toFixed(0)}deg)`;
				m.label.textContent =
					d(me, p) < 1000
						? `${Math.round(d(me, p))} m`
						: `${(d(me, p) / 1000).toFixed(1)} km`;
			}
			for (const [id, m] of marks)
				if (!seen.has(id)) {
					m.el.remove();
					marks.delete(id);
				}
		},
	};
}

const d = (
	a: { x: number; y: number; z: number },
	b: { x: number; y: number; z: number },
) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);

/** World point → normalised screen coordinates (-1..1), using the camera's own matrices. */
function project(
	camera: THREE.PerspectiveCamera,
	p: { x: number; y: number; z: number },
) {
	const m = camera.matrixWorldInverse.elements;
	const x = m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12];
	const y = m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13];
	const z = m[2] * p.x + m[6] * p.y + m[10] * p.z + m[14];
	const f = 1 / Math.tan((camera.fov * Math.PI) / 360);
	const w = -z || 1e-6;
	return { x: (x * f) / camera.aspect / w, y: (y * f) / w };
}
