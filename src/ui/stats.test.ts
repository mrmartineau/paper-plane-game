import { describe, expect, it } from "vitest";
import { config } from "../config";
import { createFlightState, type FlightEnv, stepFlight } from "../plane/flight";
import { createStats } from "./stats";

const env: FlightEnv = {
	groundAt: () => -Infinity,
	airAt: () => 0,
	solidAt: () => false,
	windAt: () => ({ x: 0, z: 0 }),
};
const dt = 1 / 60;

function fly(
	seconds: number,
	pitch: number,
	roll: number,
	boost: boolean,
	airspeed = 18,
) {
	const tracker = createStats();
	let s = { ...createFlightState({ x: 0, y: 1000, z: 0 }, 0, 18), airspeed };
	for (let i = 0; i < seconds * 60; i++) {
		s = stepFlight(s, { pitch, roll, boost }, dt, config.flight, env).state;
		tracker.step(dt, s, 100, 0);
	}
	return tracker.stats;
}

describe("stats", () => {
	it("counts loops", () => {
		expect(fly(7, 1, 0, true, 30).loops).toBe(1);
	});

	it("does not count a steep turn as a loop", () => {
		expect(fly(20, 0.4, 1, false).loops).toBe(0);
	});

	it("tracks time and distance, and resets them on a crash", () => {
		const t = createStats();
		const s = createFlightState({ x: 0, y: 100, z: 0 }, 0, 18);
		s.velocity = { x: 0, y: 0, z: -20 };
		t.step(1, s, 50, 2);
		expect(t.stats.flightTime).toBe(1);
		expect(t.stats.distance).toBe(20);
		expect(t.stats.liftTime).toBe(1);
		t.crash();
		expect(t.stats).toMatchObject({
			flightTime: 0,
			distance: 0,
			crashes: 1,
			bestAltitude: 50,
		});
	});
});
