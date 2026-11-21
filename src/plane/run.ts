// A paper animal on the ground: run with the stick, step up small ledges, get stopped by
// steep slopes and solid things, drop off edges into a glide, and take off with Space.
// Reuses FlightState so rendering, HUD and camera need nothing special. Pure, no Three.js.
import type { Config } from "../config";
import type { InputState } from "../core/input";
import {
	createFlightState,
	type FlightState,
	fromEuler,
	heading,
} from "./flight";

type Flight = Config["flight"];

export interface RunEnv {
	/** Ground height under (x, z) for a body at height y: terrain, or a landing pad's top. */
	floorAt: (x: number, y: number, z: number) => number;
	solidAt: (x: number, y: number, z: number) => boolean;
}

export type RunResult = { state: FlightState; mode: "run" | "fly" };

/** Touch down on a floor and start running, keeping some of the speed. */
export function landRun(s: FlightState, floor: number, c: Flight): FlightState {
	const speed = Math.min(
		c.runSpeed,
		Math.hypot(s.velocity.x, s.velocity.z) * c.landCarry,
	);
	return standing(
		s,
		s.position.x,
		floor + c.runHeight,
		s.position.z,
		heading(s.orientation),
		speed,
		c,
	);
}

/** Leave the ground: nose up, at least take-off speed. */
export function runTakeOff(s: FlightState, c: Flight): FlightState {
	const yaw = heading(s.orientation);
	const airspeed = Math.max(s.airspeed, c.takeoffSpeed);
	const t = createFlightState(
		{ x: s.position.x, y: s.position.y + 1, z: s.position.z },
		yaw,
		airspeed,
	);
	t.orientation = fromEuler(yaw, c.takeoffPitch, 0);
	t.velocity = {
		x: -Math.sin(yaw) * airspeed,
		y: 0,
		z: -Math.cos(yaw) * airspeed,
	};
	return { ...t, fuel: s.fuel, boostLocked: s.boostLocked };
}

export function stepRun(
	s: FlightState,
	input: InputState,
	dt: number,
	c: Flight,
	env: RunEnv,
): RunResult {
	const yaw = heading(s.orientation);
	if (input.boost) return { state: runTakeOff(s, c), mode: "fly" }; // Space: take off

	// Push forward to run; pull back to brake. You can turn on the spot, a bit slower.
	const want = Math.max(0, -input.pitch) * c.runSpeed;
	const brake = input.pitch > 0.05 ? 2 : 1;
	let speed = s.airspeed;
	speed +=
		want > speed
			? Math.min(want - speed, c.runAccel * dt)
			: -Math.min(speed - want, c.runBrake * brake * dt);
	const newYaw =
		yaw -
		input.roll *
			c.runTurn *
			dt *
			(0.4 + 0.6 * Math.min(1, speed / (c.runSpeed * 0.5)));

	let x = s.position.x - Math.sin(newYaw) * speed * dt;
	let z = s.position.z - Math.cos(newYaw) * speed * dt;
	const footY = s.position.y - c.runHeight;
	let floor = env.floorAt(x, s.position.y, z);

	// Blocked by a steep rise or something solid at body or knee height?
	const maxRise = c.runStep + speed * dt * c.runSlope;
	if (
		floor - footY > maxRise ||
		env.solidAt(x, floor + c.runHeight, z) ||
		env.solidAt(x, floor + 0.3, z)
	) {
		x = s.position.x;
		z = s.position.z;
		speed = 0;
		floor = env.floorAt(x, s.position.y, z);
	}

	// Ran off a ledge: take to the air.
	if (footY - floor > c.runFall) {
		const t = createFlightState(
			{ x, y: s.position.y, z },
			newYaw,
			Math.max(speed, c.takeoffSpeed * 0.6),
		);
		return {
			state: { ...t, fuel: s.fuel, boostLocked: s.boostLocked },
			mode: "fly",
		};
	}

	// Follow the ground smoothly, never sinking into it.
	const wantY = floor + c.runHeight;
	const y = Math.max(
		wantY - 0.2,
		s.position.y + (wantY - s.position.y) * Math.min(1, 14 * dt),
	);
	const next = standing(s, x, y, z, newYaw, speed, c);
	next.fuel = Math.min(1, s.fuel + c.boostRefill * c.landRefill * dt);
	next.boostLocked = s.boostLocked && next.fuel < c.boostRestart;
	return { state: next, mode: "run" };
}

function standing(
	s: FlightState,
	x: number,
	y: number,
	z: number,
	yaw: number,
	speed: number,
	c: Flight,
): FlightState {
	const t = createFlightState({ x, y, z }, yaw, speed);
	t.orientation = fromEuler(yaw, c.restPitch, 0);
	t.velocity = { x: -Math.sin(yaw) * speed, y: 0, z: -Math.cos(yaw) * speed };
	return { ...t, fuel: s.fuel, boostLocked: s.boostLocked };
}
