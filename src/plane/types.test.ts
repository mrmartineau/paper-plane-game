import { describe, expect, it } from "vitest";
import { config } from "../config";
import {
	axes,
	createFlightState,
	type FlightEnv,
	type FlightState,
	stepFlight,
} from "./flight";
import { PLANES, type PlaneId } from "./types";

const env: FlightEnv = {
	groundAt: () => -Infinity,
	airAt: () => 0,
	solidAt: () => false,
	windAt: () => ({ x: 0, z: 0 }),
};
const dt = 1 / 60;

describe.each(Object.keys(PLANES) as PlaneId[])("plane %s", (id) => {
	const c = { ...config.flight, ...PLANES[id].flight };
	const fly = (s: FlightState, seconds: number, pitch = 0, boost = false) => {
		for (let i = 0; i < seconds * 60; i++)
			s = stepFlight(s, { pitch, roll: 0, boost }, dt, c, env).state;
		return s;
	};

	it("has a small origami fold", () => {
		expect(PLANES[id].tris.length).toBeGreaterThanOrEqual(6);
		expect(PLANES[id].tris.length).toBeLessThanOrEqual(24);
	});

	it("settles into a steady glide above its stall speed", () => {
		const a = fly(createFlightState({ x: 0, y: 2000, z: 0 }, 0, 18), 40);
		const b = fly(a, 5);
		expect(b.airspeed).toBeGreaterThan(c.stallSpeed);
		expect(b.sink).toBe(0);
		expect(b.velocity.y).toBeLessThan(0);
		expect(Math.abs(b.velocity.y - a.velocity.y)).toBeLessThan(0.1);
	});

	it("can loop with boost", () => {
		let s = { ...createFlightState({ x: 0, y: 2000, z: 0 }, 0, 25) };
		let inverted = false;
		for (let i = 0; i < 6 * 60; i++) {
			s = stepFlight(s, { pitch: 1, roll: 0, boost: true }, dt, c, env).state;
			if (axes(s.orientation).up.y < -0.9) inverted = true;
		}
		expect(inverted).toBe(true);
	});
});
