// Landing on floating islands. Come down gently on a grassy top (wings level, not
// diving, not dropping fast) and you land instead of crashing. Parked, you slide to a
// stop and the boost tank refills fast. Boost to take off; slide off the edge and you fly.
// Pure, no Three.js.
import type { Config } from "../config";
import type { Pad } from "../world/props";
import {
	axes,
	createFlightState,
	type FlightState,
	fromEuler,
	heading,
} from "./flight";

export interface Parked {
	pad: Pad;
	speed: number; // m/s, sliding along the heading
	yaw: number;
}

type Flight = Config["flight"];

/** Is this a landing (true) or a crash (false)? */
export function touchdownOk(s: FlightState, c: Flight): boolean {
	const { forward, up } = axes(s.orientation);
	return (
		up.y > c.landLevel &&
		forward.y > -c.landMaxDive &&
		s.velocity.y > -c.landMaxSink
	);
}

/** Settle onto the pad: wings level, nose resting slightly up, keep the ground speed. */
export function land(
	s: FlightState,
	pad: Pad,
	c: Flight,
): { state: FlightState; parked: Parked } {
	const yaw = heading(s.orientation);
	const speed = Math.hypot(s.velocity.x, s.velocity.z);
	const state = rest(
		s,
		s.position.x,
		pad.y + c.clearance,
		s.position.z,
		yaw,
		speed,
		c,
	);
	return { state, parked: { pad, speed, yaw } };
}

/** One step parked: slide, slow down, refill the tank. `off` = slid off the edge. */
export function slide(
	s: FlightState,
	p: Parked,
	dt: number,
	c: Flight,
): { state: FlightState; off: boolean } {
	p.speed *= Math.exp(-c.landFriction * dt);
	const x = s.position.x - Math.sin(p.yaw) * p.speed * dt;
	const z = s.position.z - Math.cos(p.yaw) * p.speed * dt;
	const off = (x - p.pad.x) ** 2 + (z - p.pad.z) ** 2 > p.pad.r * p.pad.r;
	const state = rest(s, x, p.pad.y + c.clearance, z, p.yaw, p.speed, c);
	state.fuel = Math.min(1, s.fuel + c.boostRefill * c.landRefill * dt);
	state.boostLocked = s.boostLocked && state.fuel < c.boostRestart;
	return { state, off };
}

/** Lift off: nose up, at least take-off speed. Boost carries it from there. */
export function takeOff(s: FlightState, p: Parked, c: Flight): FlightState {
	const t = createFlightState(
		{ x: s.position.x, y: s.position.y + 1, z: s.position.z },
		p.yaw,
		Math.max(p.speed, c.takeoffSpeed),
	);
	const lift = rest(
		t,
		t.position.x,
		t.position.y,
		t.position.z,
		p.yaw,
		t.airspeed,
		c,
		c.takeoffPitch,
	);
	return { ...lift, fuel: s.fuel, boostLocked: s.boostLocked };
}

function rest(
	s: FlightState,
	x: number,
	y: number,
	z: number,
	yaw: number,
	speed: number,
	c: Flight,
	pitch = c.restPitch,
): FlightState {
	const fresh = createFlightState({ x, y, z }, yaw, speed);
	fresh.orientation = fromEuler(yaw, pitch, 0); // nose resting a little up
	return {
		...fresh,
		fuel: s.fuel,
		boostLocked: s.boostLocked,
		velocity: { x: -Math.sin(yaw) * speed, y: 0, z: -Math.cos(yaw) * speed },
	};
}
