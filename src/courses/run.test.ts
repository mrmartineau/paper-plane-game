import { describe, expect, it } from "vitest";
import { config } from "../config";
import type { Course } from "./generate";
import { decodeGhost, encodeGhost, type Ghost, ghostAt } from "./ghost";
import { type Best, createRun, isBetter, type RunStore } from "./run";

// A straight course along -Z: gate at z=0, rings every 50 m.
const ring = (z: number, R = 8) => ({ x: 0, y: 50, z, yaw: 0, R, r: 0.5 });
const course: Course = {
	id: "c",
	gate: ring(0, 12),
	rings: [ring(-50), ring(-100), ring(-150)],
};
const q = { x: 0, y: 0, z: 0, w: 1 };

function memoryStore(): RunStore & {
	saved: { best: Best; ghost: Ghost } | null;
} {
	const s: RunStore & { saved: { best: Best; ghost: Ghost } | null } = {
		saved: null,
		loadBest: () => s.saved?.best ?? null,
		loadGhost: () => s.saved?.ghost ?? null,
		save: (_, best, ghost) => {
			s.saved = { best, ghost };
		},
	};
	return s;
}

/** Fly from z0 to z1 at 20 m/s at height y and offset x. */
function fly(
	run: ReturnType<typeof createRun>,
	z0: number,
	z1: number,
	x = 0,
	y = 50,
) {
	const events: string[] = [];
	const dt = 1 / 60;
	for (let z = z0; z > z1; z -= 20 * dt) {
		events.push(
			...run.step(dt, { x, y, z }, { x, y, z: z - 20 * dt }, q, [course]),
		);
	}
	return events;
}

describe("course run", () => {
	it("starts at the gate, counts rings, finishes and saves a best + ghost", () => {
		const store = memoryStore();
		const run = createRun(config.courses, store);
		const events = fly(run, 10, -160);
		expect(events.filter((e) => e === "start")).toHaveLength(1);
		expect(events.filter((e) => e === "ring")).toHaveLength(3);
		expect(events).toContain("finish");
		expect(store.saved?.best.rings).toBe(3);
		expect(store.saved?.best.time).toBeCloseTo(7.5, 0); // 150 m at 20 m/s
		expect(store.saved?.ghost.samples.length).toBeGreaterThan(60);
	});

	it("skips a missed ring without failing", () => {
		const store = memoryStore();
		const run = createRun(config.courses, store);
		fly(run, 10, -75); // gate + ring 0
		fly(run, -75, -125, 30); // miss ring 1 (fly beside it)
		const events = fly(run, -125, -160); // ring 2
		expect(events).toContain("miss");
		expect(events).toContain("finish");
		expect(store.saved?.best.rings).toBe(2);
	});

	it("better = more rings, then faster", () => {
		expect(isBetter({ rings: 3, time: 20 }, { rings: 2, time: 10 })).toBe(true);
		expect(isBetter({ rings: 3, time: 9 }, { rings: 3, time: 10 })).toBe(true);
		expect(isBetter({ rings: 3, time: 11 }, { rings: 3, time: 10 })).toBe(
			false,
		);
	});

	it("ghosts survive encoding and play back between samples", () => {
		const g: Ghost = {
			interval: 0.1,
			origin: { x: 1000, y: 50, z: -2000 },
			samples: [
				{ x: 1000, y: 50, z: -2000, qx: 0, qy: 0, qz: 0, qw: 1 },
				{ x: 1002, y: 51, z: -2004, qx: 0, qy: 0.1, qz: 0, qw: 0.995 },
			],
			ringTimes: [1.5, Number.NaN],
		};
		const back = decodeGhost(encodeGhost(g));
		if (!back) throw new Error("decode failed");
		expect(back.samples[1].x).toBeCloseTo(1002, 1);
		expect(back.samples[1].qy).toBeCloseTo(0.1, 3);
		expect(back.ringTimes[0]).toBe(1.5);
		expect(Number.isNaN(back.ringTimes[1])).toBe(true);
		expect(ghostAt(back, 0.05)?.x).toBeCloseTo(1001, 1);
		expect(ghostAt(back, 5)).toBeNull();
	});
});
