// Other players: keep their last few states and draw them a little in the past,
// blending between two states so they move smoothly between 15 Hz updates.
import type { PlayerState, Quat, Vec } from "./protocol";

interface Snap {
	t: number;
	s: PlayerState;
}

export interface Pose {
	p: Vec;
	q: Quat;
	type: string;
	f: number;
}

export function createRemotes(delay = 0.1, timeout = 5) {
	const buf = new Map<number, Snap[]>();
	return {
		push(id: number, s: PlayerState, now: number) {
			const b = buf.get(id) ?? [];
			b.push({ t: now, s });
			if (b.length > 8) b.shift();
			buf.set(id, b);
		},
		remove(id: number) {
			buf.delete(id);
		},
		ids: () => buf.keys(),
		/** Pose at `now - delay`. Holds the newest state when the stream runs dry. */
		sample(id: number, now: number): Pose | null {
			const b = buf.get(id);
			if (!b?.length) return null;
			const t = now - delay;
			let i = b.length - 1;
			while (i > 0 && b[i - 1].t > t) i--;
			const a = b[Math.max(0, i - 1)];
			const c = b[i];
			if (i === 0 || t >= c.t) return { ...c.s };
			const k = Math.max(0, Math.min(1, (t - a.t) / (c.t - a.t || 1)));
			return {
				p: [0, 1, 2].map((j) => a.s.p[j] + (c.s.p[j] - a.s.p[j]) * k) as Vec,
				q: nlerp(a.s.q, c.s.q, k),
				type: c.s.type,
				f: c.s.f,
			};
		},
		/** Forget players we have not heard from for a while. Returns their ids. */
		prune(now: number): number[] {
			const gone: number[] = [];
			for (const [id, b] of buf)
				if (now - b[b.length - 1].t > timeout) {
					buf.delete(id);
					gone.push(id);
				}
			return gone;
		},
	};
}

/** Blend two rotations, taking the short way round. Good enough for 1/15 s steps. */
export function nlerp(a: Quat, b: Quat, k: number): Quat {
	const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
	const s = dot < 0 ? -1 : 1;
	const q = a.map((v, j) => v + (b[j] * s - v) * k) as Quat;
	const n = Math.hypot(...q) || 1;
	return q.map((v) => v / n) as Quat;
}
