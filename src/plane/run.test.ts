import { describe, expect, it } from "vitest";
import { config } from "../config";
import type { InputState } from "../core/input";
import { axes, createFlightState, type FlightState, fromEuler } from "./flight";
import { landRun, type RunEnv, stepRun } from "./run";

const c = config.flight;
const dt = 1 / 60;
const idle: InputState = { pitch: 0, roll: 0, boost: false };
const forward: InputState = { pitch: -1, roll: 0, boost: false };

const flat = (y: number): RunEnv => ({
	floorAt: () => y,
	solidAt: () => false,
});
const start = (y = 0): FlightState =>
	landRun(
		{
			...createFlightState({ x: 0, y: 5, z: 0 }, 0, 16),
			velocity: { x: 0, y: -3, z: -16 },
		},
		y,
		c,
	);

function run(s: FlightState, seconds: number, input: InputState, env: RunEnv) {
	let mode: "run" | "fly" = "run";
	for (let i = 0; i < seconds * 60 && mode === "run"; i++)
		({ state: s, mode } = stepRun(s, input, dt, c, env));
	return { s, mode };
}

describe("paper animal running", () => {
	it("lands keeping some speed, standing on the ground", () => {
		const s = start(10);
		expect(s.position.y).toBeCloseTo(10 + c.runHeight);
		expect(s.airspeed).toBeCloseTo(Math.min(c.runSpeed, 16 * c.landCarry));
	});

	it("runs forward up to its top speed, and stops when you let go", () => {
		const { s } = run(start(), 4, forward, flat(0));
		expect(s.airspeed).toBeCloseTo(c.runSpeed, 0);
		expect(s.position.z).toBeLessThan(-30); // headed along -Z
		expect(s.position.y).toBeCloseTo(c.runHeight, 1);
		const stopped = run(s, 2, idle, flat(0)).s;
		expect(stopped.airspeed).toBeLessThan(0.5);
	});

	it("turns with the stick, even standing still", () => {
		const left = run(
			start(),
			1,
			{ pitch: 0, roll: -1, boost: false },
			flat(0),
		).s;
		const f = axes(left.orientation).forward;
		expect(f.x).not.toBeCloseTo(0, 1); // no longer facing straight ahead
	});

	it("is stopped by a steep wall and by solid things", () => {
		const wall: RunEnv = {
			floorAt: (_x, _y, z) => (z < -10 ? 5 : 0),
			solidAt: () => false,
		};
		const hit = run(start(), 4, forward, wall).s;
		expect(hit.position.z).toBeGreaterThan(-11);
		const tree: RunEnv = { floorAt: () => 0, solidAt: (_x, _y, z) => z < -12 };
		expect(run(start(), 4, forward, tree).s.position.z).toBeGreaterThan(-13);
	});

	it("steps up small ledges and follows slopes", () => {
		const slope: RunEnv = {
			floorAt: (_x, _y, z) => Math.max(0, -z * 0.3),
			solidAt: () => false,
		};
		const up = run(start(), 3, forward, slope).s;
		expect(up.position.z).toBeLessThan(-20);
		expect(up.position.y).toBeGreaterThan(5);
	});

	it("runs off an edge into the air, and Space takes off nose-up", () => {
		const edge: RunEnv = {
			floorAt: (_x, _y, z) => (z < -10 ? -30 : 0),
			solidAt: () => false,
		};
		expect(run(start(), 4, forward, edge).mode).toBe("fly");
		const t = stepRun(
			start(),
			{ pitch: 0, roll: 0, boost: true },
			dt,
			c,
			flat(0),
		);
		expect(t.mode).toBe("fly");
		expect(axes(t.state.orientation).forward.y).toBeGreaterThan(0.2);
		expect(t.state.airspeed).toBeGreaterThanOrEqual(c.takeoffSpeed);
	});

	it("refills the boost tank while running", () => {
		const empty = { ...start(), fuel: 0 };
		expect(run(empty, 2, idle, flat(0)).s.fuel).toBeGreaterThan(0.3);
	});

	it("orientation helper sanity: fromEuler faces -Z", () => {
		expect(axes(fromEuler(0, 0, 0)).forward.z).toBeCloseTo(-1);
	});

	describe("land animals (cheetah, dog)", () => {
		const sprint: InputState = { pitch: -1, roll: 0, boost: true };
		const walk = (
			s: FlightState,
			seconds: number,
			input: InputState,
			env: RunEnv,
		) => {
			for (let i = 0; i < seconds * 60; i++)
				s = stepRun(s, input, dt, c, env, true).state;
			return s;
		};

		it("Space sprints: faster, uses the tank, never takes off", () => {
			const jog = walk(start(), 4, forward, flat(0));
			const fast = walk(start(), 4, sprint, flat(0));
			expect(fast.airspeed).toBeGreaterThan(jog.airspeed * 1.4);
			expect(fast.boosting).toBe(true);
			expect(fast.fuel).toBeLessThan(0.5);
			expect(stepRun(start(), sprint, dt, c, flat(0), true).mode).toBe("run");
		});

		it("runs out of breath, locks, then recovers", () => {
			const tired = walk(start(), 1 / c.boostDrain + 1, sprint, flat(0));
			expect(tired.boostLocked).toBe(true);
			expect(tired.boosting).toBe(false);
			expect(tired.airspeed).toBeLessThan(c.runSpeed * 1.1); // back to a normal run
			const rested = walk(
				tired,
				c.boostRestart / (c.boostRefill * c.walkRefill) + 1,
				forward,
				flat(0),
			);
			expect(stepRun(rested, sprint, dt, c, flat(0), true).state.boosting).toBe(
				true,
			);
		});

		it("falls off a ledge and keeps running on the ground below", () => {
			const edge: RunEnv = {
				floorAt: (_x, _y, z) => (z < -10 ? -30 : 0),
				solidAt: () => false,
			};
			let s = start();
			let sawAir = false;
			for (let i = 0; i < 8 * 60; i++) {
				const r = stepRun(s, forward, dt, c, edge, true);
				expect(r.mode).toBe("run"); // never flies
				s = r.state;
				if (s.position.y - c.runHeight > -29)
					sawAir = sawAir || s.position.y < -1;
			}
			expect(sawAir).toBe(true);
			expect(s.position.y).toBeCloseTo(-30 + c.runHeight, 1);
		});
	});
});
