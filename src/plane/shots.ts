// Paper-ball shots. Pure, no Three.js: they fly fast, drop a little, stop on anything solid.
import type { Vec } from "../net/protocol";

export const SHOT = {
	speed: 120, // m/s on top of the plane's own speed
	life: 3, // s
	gravity: 4, // m/s², paper balls are light
	cooldown: 0.25, // s between shots
	hitRadius: 2.5, // m around a plane
	muzzle: 4, // m ahead of the plane's centre
	aimCone: 0.9, // cos of the half-angle (~26°) in which auto-aim locks on
	aimRange: 380, // m; a ball only flies about this far
};

export interface Shot {
	p: Vec;
	prev: Vec;
	v: Vec;
	age: number;
	/** Player id of the shooter; null = you. */
	by: number | null;
}

type Solid = (x: number, y: number, z: number) => boolean;
type Ground = (x: number, z: number) => number;

/** A new shot from a plane at `p` facing `fwd` (unit), moving at `vel`. */
export function fire(p: Vec, fwd: Vec, vel: Vec): { p: Vec; v: Vec } {
	return {
		p: [0, 1, 2].map((i) => p[i] + fwd[i] * SHOT.muzzle) as Vec,
		v: [0, 1, 2].map((i) => vel[i] + fwd[i] * SHOT.speed) as Vec,
	};
}

/** Move every shot one step; drop the old ones and the ones that hit the world. */
export function stepShots(
	shots: Shot[],
	dt: number,
	groundAt: Ground,
	solidAt: Solid,
): Shot[] {
	return shots.filter((s) => {
		s.age += dt;
		s.prev = [...s.p];
		s.v[1] -= SHOT.gravity * dt;
		for (let i = 0; i < 3; i++) s.p[i] += s.v[i] * dt;
		const [x, y, z] = s.p;
		return s.age < SHOT.life && y > groundAt(x, z) && !solidAt(x, y, z);
	});
}

/** Did the segment a→b pass within r of point c? (A fast ball moves ~2 m a step.) */
export function segmentHits(a: Vec, b: Vec, c: Vec, r: number): boolean {
	const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
	const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
	const dd = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
	const k =
		dd > 0
			? Math.max(0, Math.min(1, (w[0] * d[0] + w[1] * d[1] + w[2] * d[2]) / dd))
			: 0;
	const x = w[0] - d[0] * k;
	const y = w[1] - d[1] * k;
	const z = w[2] - d[2] * k;
	return x * x + y * y + z * z <= r * r;
}

/**
 * Auto-aim: the direction (unit) to throw so a ball meets a moving target, or null when the
 * target is outside the cone in front of you or too far. `rel` = target minus you, `relVel` =
 * target velocity minus yours. Leads the target and allows for the ball dropping.
 */
export function aimAt(fwd: Vec, rel: Vec, relVel: Vec): Vec | null {
	const dist = Math.hypot(...rel);
	if (dist < 1 || dist > SHOT.aimRange) return null;
	const facing = (rel[0] * fwd[0] + rel[1] * fwd[1] + rel[2] * fwd[2]) / dist;
	if (facing < SHOT.aimCone) return null;
	// Time for a ball (speed S in the shooter's frame) to reach the moving target: |rel + relVel t| = S t.
	const S = SHOT.speed;
	const a = relVel[0] ** 2 + relVel[1] ** 2 + relVel[2] ** 2 - S * S;
	const b = 2 * (rel[0] * relVel[0] + rel[1] * relVel[1] + rel[2] * relVel[2]);
	const c = dist * dist;
	let t = dist / S;
	if (Math.abs(a) < 1e-6) t = b !== 0 ? Math.max(0, -c / b) || t : t;
	else {
		const disc = b * b - 4 * a * c;
		if (disc >= 0) {
			const r = Math.sqrt(disc);
			const hits = [(-b - r) / (2 * a), (-b + r) / (2 * a)].filter(
				(x) => x > 0,
			);
			if (hits.length) t = Math.min(...hits);
		}
	}
	t = Math.min(t, SHOT.life);
	const d: Vec = [
		rel[0] + relVel[0] * t,
		rel[1] + relVel[1] * t + 0.5 * SHOT.gravity * t * t, // aim a little high: the ball drops
		rel[2] + relVel[2] * t,
	];
	const n = Math.hypot(...d) || 1;
	return [d[0] / n, d[1] / n, d[2] / n];
}
