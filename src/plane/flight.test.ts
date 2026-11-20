import { describe, expect, it } from "vitest";
import { config } from "../config";
import type { InputState } from "../core/input";
import {
	axes,
	createFlightState,
	type FlightEnv,
	type FlightState,
	fromEuler,
	heading,
	liftFraction,
	stepFlight,
} from "./flight";

const c = config.flight;
const dt = 1 / 60;
const stillAir: FlightEnv = {
	groundAt: () => -Infinity,
	airAt: () => 0,
	solidAt: () => false,
	windAt: () => ({ x: 0, z: 0 }),
};
const idle: InputState = { pitch: 0, roll: 0, boost: false };

function fly(
	s: FlightState,
	seconds: number,
	input: InputState = idle,
	env = stillAir,
): FlightState {
	for (let i = 0; i < seconds * 60; i++)
		s = stepFlight(s, input, dt, c, env).state;
	return s;
}

const start = () => createFlightState({ x: 0, y: 1000, z: 0 }, 0, 18);
const pitchOf = (s: FlightState) => Math.asin(axes(s.orientation).forward.y);

describe("flight", () => {
	it("no input → steady glide descent", () => {
		const a = fly(start(), 30);
		const b = fly(a, 10);
		expect(b.velocity.y).toBeLessThan(0); // descending
		expect(b.velocity.y).toBeGreaterThan(-4); // gently
		expect(Math.abs(b.velocity.y - a.velocity.y)).toBeLessThan(0.1); // steady
		expect(Math.abs(b.airspeed - a.airspeed)).toBeLessThan(0.2);
		expect(b.airspeed).toBeGreaterThan(c.stallSpeed);
		expect(b.sink).toBe(0);
	});

	it("stall recovers on its own", () => {
		let s = start();
		s = { ...s, airspeed: 4, orientation: fromEuler(0, 0.8, 0) };
		expect(liftFraction(s.airspeed, c)).toBeLessThan(0.2);
		s = fly(s, 12);
		expect(s.airspeed).toBeGreaterThan(c.stallSpeed);
		expect(s.sink).toBeLessThan(1);
		expect(Math.abs(pitchOf(s) - c.glidePitch)).toBeLessThan(0.1);
	});

	it("diving gains speed, climbing loses it", () => {
		const dive = fly(start(), 1.5, { pitch: -1, roll: 0, boost: false });
		const climb = fly(start(), 1.5, { pitch: 1, roll: 0, boost: false });
		expect(dive.airspeed).toBeGreaterThan(18);
		expect(climb.airspeed).toBeLessThan(18);
		expect(climb.position.y).toBeGreaterThan(dive.position.y);
	});

	it("banking right turns right, then auto-levels", () => {
		const banked = fly(start(), 0.6, { pitch: 0, roll: 1, boost: false });
		expect(axes(banked.orientation).right.y).toBeLessThan(-0.5); // right wing down
		const turned = fly(banked, 1);
		expect(heading(turned.orientation)).toBeLessThan(-0.1); // heading decreasing = right
		const levelled = fly(turned, 6);
		expect(Math.abs(axes(levelled.orientation).right.y)).toBeLessThan(0.05);
	});

	it("can fly a full loop", () => {
		let s = { ...start(), airspeed: 30 };
		const pull: InputState = { pitch: 1, roll: 0, boost: true };
		let vertical = false;
		let inverted = false;
		let diving = false;
		for (let i = 0; i < 8 * 60 && !diving; i++) {
			s = stepFlight(s, pull, dt, c, stillAir).state;
			const { forward: f, up: u } = axes(s.orientation);
			if (f.y > 0.9) vertical = true;
			if (vertical && u.y < -0.9) inverted = true;
			if (inverted && f.y < -0.7) diving = true;
		}
		expect([vertical, inverted, diving]).toEqual([true, true, true]);
		// Let go after the loop: it rolls upright and settles into a glide.
		s = fly(s, 8);
		expect(axes(s.orientation).up.y).toBeGreaterThan(0.95);
	});

	it("boost is a rocket: straight up, no stall, then gliding resumes", () => {
		const up = { ...start(), orientation: fromEuler(0, Math.PI / 2 - 0.02, 0) };
		const rocket = fly(up, 4, { pitch: 0, roll: 0, boost: true });
		expect(rocket.position.y - up.position.y).toBeGreaterThan(150); // shot up
		expect(rocket.airspeed).toBeGreaterThan(40);
		expect(rocket.sink).toBe(0);
		expect(axes(rocket.orientation).forward.y).toBeGreaterThan(0.95); // still pointing up
		// Let go: it slows, the nose comes over, and it glides again.
		const after = fly(rocket, 25);
		expect(after.airspeed).toBeLessThan(c.maxSpeed);
		expect(Math.abs(pitchOf(after) - c.glidePitch)).toBeLessThan(0.15);
	});

	it("boost tops out at boostMaxSpeed, and the extra speed bleeds off after", () => {
		const fast = fly(start(), 5.5, { pitch: 0, roll: 0, boost: true });
		expect(fast.airspeed).toBeGreaterThan(c.maxSpeed);
		expect(fast.airspeed).toBeLessThanOrEqual(c.boostMaxSpeed);
		const coast = fly(fast, 0.2);
		expect(coast.airspeed).toBeGreaterThan(c.maxSpeed); // no sudden stop
	});

	it("boost runs out, locks until refilled, and gliding refills it", () => {
		const hold = { pitch: 0, roll: 0, boost: true };
		const dry = fly(start(), 1 / c.boostDrain + 0.5, hold);
		expect(dry.fuel).toBeLessThan(0.05); // empty, and just starting to refill
		expect(dry.boostLocked).toBe(true);
		const still = fly(dry, 0.5, hold); // holding boost does nothing while locked
		expect(still.boosting).toBe(false);
		expect(still.fuel).toBeGreaterThan(0); // and it still refills
		const refilled = fly(dry, c.boostRestart / c.boostRefill + 0.2); // glide
		const again = stepFlight(refilled, hold, dt, c, stillAir).state;
		expect(again.boosting).toBe(true);
	});

	it("rising air refills boost faster", () => {
		const empty = { ...start(), fuel: 0 };
		const calm = fly(empty, 2);
		const thermal = fly(empty, 2, idle, { ...stillAir, airAt: () => 5 });
		expect(thermal.fuel).toBeCloseTo(calm.fuel * c.boostRefillLift, 5);
	});

	it("rising air lifts the plane, sinking air pushes it down", () => {
		const up = fly(start(), 5, idle, { ...stillAir, airAt: () => 5 });
		const down = fly(start(), 5, idle, { ...stillAir, airAt: () => -5 });
		const still = fly(start(), 5);
		expect(up.position.y).toBeGreaterThan(1000); // climbing
		expect(down.position.y).toBeLessThan(still.position.y - 20);
	});

	it("crashes below ground + clearance", () => {
		const s = createFlightState({ x: 0, y: 10.5, z: 0 }, 0, 18);
		const pitchedDown = { ...s, orientation: fromEuler(0, -1, 0) };
		const ground = (h: number): FlightEnv => ({
			groundAt: () => h,
			airAt: () => 0,
			solidAt: () => false,
			windAt: () => ({ x: 0, z: 0 }),
		});
		expect(stepFlight(pitchedDown, idle, dt, c, ground(10)).crashed).toBe(true);
		expect(stepFlight(s, idle, dt, c, ground(0)).crashed).toBe(false);
		const tree: FlightEnv = { ...ground(0), solidAt: () => true };
		expect(stepFlight(s, idle, dt, c, tree).crashed).toBe(true);
	});
});
