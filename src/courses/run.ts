// A course run: start at the gate, pass rings in order (missed rings are skipped,
// not a fail), finish at the last ring. Records a ghost; keeps the best run per course.
// Pure apart from the injected load/save.
import type { Config } from "../config";
import type { Vec3 } from "../plane/flight";
import type { Course } from "./generate";
import { type Ghost, type GhostSample, ghostAt } from "./ghost";
import { passedThrough } from "./rings";

export interface Best {
	time: number; // seconds
	rings: number; // rings passed
}

export interface RunView {
	courseId: string;
	elapsed: number;
	next: number; // index of the next ring
	passed: number;
	total: number;
	delta: number | null; // seconds vs the best run at the last ring (negative = ahead)
	best: Best | null;
	ghost: GhostSample | null;
}

export type RingState = "next" | "ahead" | "passed" | "missed";

export interface RunStore {
	loadBest(courseId: string): Best | null;
	loadGhost(courseId: string): Ghost | null;
	save(courseId: string, best: Best, ghost: Ghost): void;
}

/** Better = more rings, then faster. */
export function isBetter(a: Best, b: Best | null): boolean {
	if (!b) return true;
	return a.rings > b.rings || (a.rings === b.rings && a.time < b.time);
}

export function createRun(c: Config["courses"], store: RunStore) {
	let course: Course | null = null;
	let elapsed = 0;
	let next = 0;
	let passed = 0;
	let states: RingState[] = [];
	let ringTimes: number[] = [];
	let samples: GhostSample[] = [];
	let sampleClock = 0;
	let farFor = 0;
	let delta: number | null = null;
	let best: Best | null = null;
	let bestGhost: Ghost | null = null;
	let finished: { course: Course; best: Best; newBest: boolean } | null = null;

	const sample = (
		p: Vec3,
		q: { x: number; y: number; z: number; w: number },
	): GhostSample => ({
		x: p.x,
		y: p.y,
		z: p.z,
		qx: q.x,
		qy: q.y,
		qz: q.z,
		qw: q.w,
	});

	function start(
		next0: Course,
		p: Vec3,
		q: { x: number; y: number; z: number; w: number },
	) {
		course = next0;
		elapsed = 0;
		next = 0;
		passed = 0;
		states = course.rings.map((_, i) => (i === 0 ? "next" : "ahead"));
		ringTimes = course.rings.map(() => Number.NaN);
		samples = [sample(p, q)];
		sampleClock = 0;
		farFor = 0;
		delta = null;
		best = store.loadBest(course.id);
		bestGhost = store.loadGhost(course.id);
		finished = null;
	}

	function finish() {
		if (!course) return;
		const result: Best = { time: elapsed, rings: passed };
		const newBest = isBetter(result, best);
		if (newBest) {
			store.save(course.id, result, {
				interval: c.ghostInterval,
				origin: course.gate,
				samples,
				ringTimes,
			});
		}
		finished = { course, best: result, newBest };
		course = null;
	}

	return {
		/**
		 * One fixed step. `courses` are the ones nearby (to spot a start gate).
		 * Returns events for sound and messages.
		 */
		step(
			dt: number,
			a: Vec3,
			b: Vec3,
			q: { x: number; y: number; z: number; w: number },
			courses: Course[],
		) {
			const events: ("start" | "ring" | "miss" | "finish" | "abandon")[] = [];
			if (!course) {
				for (const candidate of courses) {
					if (passedThrough(candidate.gate, a, b)) {
						start(candidate, b, q);
						events.push("start");
						break;
					}
				}
				return events;
			}

			elapsed += dt;
			sampleClock += dt;
			if (sampleClock >= c.ghostInterval) {
				sampleClock -= c.ghostInterval;
				samples.push(sample(b, q));
			}

			// Through the next ring, or one of the two after it (the ones skipped count as missed).
			for (let k = next; k < Math.min(next + 3, course.rings.length); k++) {
				if (!passedThrough(course.rings[k], a, b)) continue;
				for (let m = next; m < k; m++) {
					states[m] = "missed";
					events.push("miss");
				}
				states[k] = "passed";
				ringTimes[k] = elapsed;
				passed++;
				next = k + 1;
				const ghostTime = bestGhost?.ringTimes[k];
				delta =
					ghostTime !== undefined && Number.isFinite(ghostTime)
						? elapsed - ghostTime
						: null;
				events.push("ring");
				if (next < course.rings.length) states[next] = "next";
				break;
			}
			if (next >= course.rings.length) {
				finish();
				events.push("finish");
				return events;
			}

			// Wandered off? Drop the run after a while.
			const r = course.rings[next];
			farFor =
				Math.hypot(b.x - r.x, b.z - r.z) > c.abandonDistance ? farFor + dt : 0;
			if (farFor > c.abandonAfter) {
				course = null;
				events.push("abandon");
			}
			return events;
		},

		/** For the HUD and ring colours; null when no run is on. */
		view(): RunView | null {
			if (!course) return null;
			return {
				courseId: course.id,
				elapsed,
				next,
				passed,
				total: course.rings.length,
				delta,
				best,
				ghost: bestGhost ? ghostAt(bestGhost, elapsed) : null,
			};
		},
		ringStates(): RingState[] {
			return states;
		},
		get active() {
			return course;
		},
		/** The last finished run, until read. */
		takeFinished() {
			const f = finished;
			finished = null;
			return f;
		},
	};
}
