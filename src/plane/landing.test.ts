import { describe, expect, it } from "vitest";
import { config } from "../config";
import { createClimate, createHeight } from "../world/height";
import { createFeatures, type Pad } from "../world/props";
import { axes, createFlightState, fromEuler } from "./flight";
import { land, slide, takeOff, touchdownOk } from "./landing";

const c = config.flight;
const pad: Pad = { x: 0, y: 300, z: 0, r: 40 };
const coming = (pitch: number, roll: number, sink: number) => ({
	...createFlightState({ x: 0, y: 300.2, z: 0 }, 0, 16),
	orientation: fromEuler(0, pitch, roll),
	velocity: { x: 0, y: -sink, z: -16 },
});

describe("landing", () => {
	it("gentle and level lands; steep, banked or fast-dropping crashes", () => {
		expect(touchdownOk(coming(-0.1, 0, 2), c)).toBe(true);
		expect(touchdownOk(coming(-0.8, 0, 2), c)).toBe(false); // diving
		expect(touchdownOk(coming(-0.1, 1.2, 2), c)).toBe(false); // banked hard
		expect(touchdownOk(coming(-0.1, 0, 15), c)).toBe(false); // dropping fast
	});

	it("slides to a stop on the pad and refills the tank", () => {
		const start = { ...coming(-0.1, 0, 2), fuel: 0.1 };
		let { state, parked } = land(start, pad, c);
		expect(state.position.y).toBeCloseTo(pad.y + c.clearance);
		for (let i = 0; i < 600; i++) state = slide(state, parked, 1 / 60, c).state;
		expect(parked.speed).toBeLessThan(0.1);
		expect(state.fuel).toBe(1); // 10 s parked fills it; 10 s gliding would not (0.1 + 10/12 < 1)
	});

	it("slides off the edge if it's moving fast near it", () => {
		const nearEdge = {
			...coming(-0.1, 0, 2),
			position: { x: 0, y: 300.2, z: -35 },
		};
		const { state, parked } = land(nearEdge, pad, c);
		let off = false;
		let s = state;
		for (let i = 0; i < 120 && !off; i++)
			({ state: s, off } = slide(s, parked, 1 / 60, c));
		expect(off).toBe(true);
	});

	it("takes off nose up at take-off speed", () => {
		const { state, parked } = land(coming(-0.1, 0, 2), pad, c);
		parked.speed = 0;
		const t = takeOff(state, parked, c);
		expect(t.airspeed).toBe(c.takeoffSpeed);
		expect(axes(t.orientation).forward.y).toBeGreaterThan(0.3);
	});

	it("finds pads on top of floating mountains, and nowhere in thin air", () => {
		const w = config.world;
		const height = createHeight("paper", w);
		const features = createFeatures(
			"paper",
			height,
			createClimate("paper", w),
			config.props,
			w,
		);
		const f = features.near(0, 0, 3000).floaters[0];
		expect(features.padAt(f.x, f.y + 1, f.z, 3)).not.toBeNull();
		expect(features.padAt(f.x, f.y + 50, f.z, 3)).toBeNull();
	});
});
