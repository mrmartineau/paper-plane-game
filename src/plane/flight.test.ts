import { describe, expect, it } from "vitest";
import { config } from "../config";
import type { InputState } from "../core/input";
import {
	createFlightState,
	type FlightState,
	liftFraction,
	stepFlight,
} from "./flight";

const c = config.flight;
const dt = 1 / 60;
const noGround = () => -Infinity;
const idle: InputState = { pitch: 0, roll: 0, boost: false };

function fly(
	s: FlightState,
	seconds: number,
	input: InputState = idle,
): FlightState {
	for (let i = 0; i < seconds * 60; i++)
		s = stepFlight(s, input, dt, c, noGround).state;
	return s;
}

const start = () => createFlightState({ x: 0, y: 1000, z: 0 }, 0, 18);

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
		s = { ...s, airspeed: 4, pitch: 0.8 };
		expect(liftFraction(s.airspeed, c)).toBeLessThan(0.2);
		s = fly(s, 12);
		expect(s.airspeed).toBeGreaterThan(c.stallSpeed);
		expect(s.sink).toBeLessThan(1);
		expect(Math.abs(s.pitch - c.glidePitch)).toBeLessThan(0.1);
	});

	it("diving gains speed, climbing loses it", () => {
		const dive = fly(start(), 2, { pitch: -1, roll: 0, boost: false });
		const climb = fly(start(), 2, { pitch: 1, roll: 0, boost: false });
		expect(dive.airspeed).toBeGreaterThan(18);
		expect(climb.airspeed).toBeLessThan(18);
		expect(climb.position.y).toBeGreaterThan(dive.position.y);
	});

	it("banking right turns right, then auto-levels", () => {
		const banked = fly(start(), 1, { pitch: 0, roll: 1, boost: false });
		expect(banked.roll).toBeGreaterThan(0.5);
		expect(banked.yaw).toBeLessThan(0); // yaw decreasing = turning right
		const levelled = fly(banked, 5);
		expect(Math.abs(levelled.roll)).toBeLessThan(0.05);
	});

	it("never exceeds the pitch and roll limits", () => {
		const s = fly(start(), 10, { pitch: 1, roll: 1, boost: true });
		expect(Math.abs(s.pitch)).toBeLessThanOrEqual(c.maxPitch);
		expect(Math.abs(s.roll)).toBeLessThanOrEqual(c.maxRoll);
	});

	it("crashes below ground + clearance", () => {
		const s = createFlightState({ x: 0, y: 10.5, z: 0 }, 0, 18);
		const pitchedDown = { ...s, pitch: -1 };
		expect(stepFlight(pitchedDown, idle, dt, c, () => 10).crashed).toBe(true);
		expect(stepFlight(s, idle, dt, c, () => 0).crashed).toBe(false);
	});
});
