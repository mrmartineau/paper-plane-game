import { describe, expect, it } from "vitest";
import type { PlayerState } from "./protocol";
import { createRemotes, nlerp } from "./remotes";

const at = (x: number): PlayerState => ({
	p: [x, 0, 0],
	q: [0, 0, 0, 1],
	type: "dart",
	f: 0,
});

describe("remote players", () => {
	it("draws in between two states, a little in the past", () => {
		const r = createRemotes(0.1, 5);
		r.push(1, at(0), 1);
		r.push(1, at(10), 1.1);
		expect(r.sample(1, 1.15)?.p[0]).toBeCloseTo(5);
		expect(r.sample(1, 2)?.p[0]).toBe(10); // holds the newest
		expect(r.sample(2, 1)).toBeNull();
	});

	it("forgets players that go quiet", () => {
		const r = createRemotes(0.1, 5);
		r.push(1, at(0), 0);
		expect(r.prune(4)).toEqual([]);
		expect(r.prune(6)).toEqual([1]);
		expect(r.sample(1, 6)).toBeNull();
	});

	it("blends rotations the short way and keeps them unit length", () => {
		const q = nlerp([0, 0, 0, 1], [0, 0, 0, -1], 0.5); // same rotation, opposite sign
		expect(q[3]).toBeCloseTo(1);
		expect(Math.hypot(...nlerp([0, 0, 0, 1], [0, 1, 0, 0], 0.5))).toBeCloseTo(
			1,
		);
	});
});
