// A paper animal on the ground: run with the stick, step up small ledges, get stopped by
// steep slopes and solid things. A flier (the crane) drops off edges into a glide and takes
// off with Space. A land animal (cheetah, dog) never flies: it falls off edges and keeps
// running, and Space makes it sprint (legs very fast, speed up, uses the boost tank).
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

export type RunResult = {
	state: FlightState;
	mode: "run" | "fly";
	air?: boolean;
};

const FALL_GRAVITY = 22; // m/s², a land animal dropping off a ledge (snappy, paper-light)

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
	walker = false,
): RunResult {
	const yaw = heading(s.orientation);
	if (input.boost && !walker) return { state: runTakeOff(s, c), mode: "fly" }; // Space: take off

	// Land animals: Space sprints while there's fuel (and it isn't locked after running dry).
	const sprinting = walker && input.boost && s.fuel > 0 && !s.boostLocked;
	const boost = sprinting ? c.runSprint : 1;

	// Push forward to run. Pull back to brake, and once stopped, walk backwards. Speed is
	// signed here: negative = backwards (FlightState.airspeed stays the size of it).
	const back = Math.max(0, input.pitch);
	const want =
		Math.max(0, -input.pitch) * c.runSpeed * boost -
		back * c.runSpeed * c.runReverse;
	let speed = -(s.velocity.x * Math.sin(yaw) + s.velocity.z * Math.cos(yaw)); // along the heading
	const diff = want - speed;
	const rate =
		diff > 0
			? speed < 0
				? c.runBrake
				: c.runAccel * boost
			: speed > 0
				? c.runBrake * (back > 0.05 ? 2 : 1)
				: c.runAccel;
	speed += Math.sign(diff) * Math.min(Math.abs(diff), rate * dt);
	const newYaw =
		yaw -
		input.roll *
			c.runTurn *
			dt *
			(0.4 + 0.6 * Math.min(1, Math.abs(speed) / (c.runSpeed * 0.5)));

	let x = s.position.x - Math.sin(newYaw) * speed * dt;
	let z = s.position.z - Math.cos(newYaw) * speed * dt;
	const footY = s.position.y - c.runHeight;
	let floor = env.floorAt(x, s.position.y, z);

	// Blocked by a steep rise or something solid at body or knee height?
	const maxRise = c.runStep + Math.abs(speed) * dt * c.runSlope;
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

	const wantY = floor + c.runHeight;
	let y: number;
	let fall = 0;
	if (walker && footY - floor > 0.1) {
		// Off the ground: fall, then land and keep running.
		fall = s.velocity.y - FALL_GRAVITY * dt;
		y = s.position.y + fall * dt;
		if (y <= wantY) {
			y = wantY;
			fall = 0;
		}
	} else if (!walker && footY - floor > c.runFall) {
		// A flier ran off a ledge: take to the air.
		const t = createFlightState(
			{ x, y: s.position.y, z },
			newYaw,
			Math.max(Math.abs(speed), c.takeoffSpeed * 0.6),
		);
		return {
			state: { ...t, fuel: s.fuel, boostLocked: s.boostLocked },
			mode: "fly",
		};
	} else {
		// Follow the ground smoothly, never sinking into it.
		y = Math.max(
			wantY - 0.2,
			s.position.y + (wantY - s.position.y) * Math.min(1, 14 * dt),
		);
	}

	const next = standing(s, x, y, z, newYaw, speed, c);
	next.velocity.y = fall;
	next.boosting = sprinting;
	if (sprinting) {
		next.fuel = Math.max(0, s.fuel - c.boostDrain * dt);
		next.boostLocked = next.fuel <= 0;
	} else {
		next.fuel = Math.min(
			1,
			s.fuel + c.boostRefill * (walker ? c.walkRefill : c.landRefill) * dt,
		);
		next.boostLocked = s.boostLocked && next.fuel < c.boostRestart;
	}
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
	const t = createFlightState({ x, y, z }, yaw, Math.abs(speed)); // airspeed is the size; velocity has the direction
	t.orientation = fromEuler(yaw, c.restPitch, 0);
	t.velocity = { x: -Math.sin(yaw) * speed, y: 0, z: -Math.cos(yaw) * speed };
	return { ...t, fuel: s.fuel, boostLocked: s.boostLocked };
}

/**
 * A paper skateboard: rolls on momentum. W kicks you up to a cruising speed, S brakes,
 * slopes speed you up or slow you down, A D carve (slowly at a standstill). Space is an
 * ollie. Crests launch you with the slope's upward speed; solid things stop you dead.
 * Never flies off on its own, just ballistic hops.
 */
export function stepSkate(
	s: FlightState,
	input: InputState,
	dt: number,
	c: Flight,
	env: RunEnv,
): RunResult {
	const yaw = heading(s.orientation);
	const py = s.position.y;
	const footY = py - c.runHeight;
	const here = env.floorAt(s.position.x, py, s.position.z);
	const onGround = footY - here <= 0.12;

	let speed = s.airspeed;
	if (onGround) {
		const push = Math.max(0, -input.pitch);
		if (push > 0 && speed < c.skatePush) speed += c.skateAccel * push * dt; // kick
		if (input.pitch > 0.05) speed -= c.skateBrake * dt;
		speed -= speed * c.skateFriction * dt;
		// Slope along the heading: downhill speeds you up, uphill slows you.
		const ahead = env.floorAt(
			s.position.x - Math.sin(yaw) * 1.5,
			py,
			s.position.z - Math.cos(yaw) * 1.5,
		);
		speed -= ((ahead - here) / 1.5) * c.skateGravity * dt;
		speed = Math.min(c.skateMax, Math.max(0, speed));
	}
	const carve = onGround ? 0.25 + 0.75 * Math.min(1, speed / 10) : 0.7;
	const newYaw = yaw - input.roll * c.runTurn * dt * carve;

	let x = s.position.x - Math.sin(newYaw) * speed * dt;
	let z = s.position.z - Math.cos(newYaw) * speed * dt;
	let floor = env.floorAt(x, py, z);
	const maxRise = c.runStep + speed * dt * c.runSlope;
	if (
		floor - footY > maxRise ||
		env.solidAt(x, floor + c.runHeight, z) ||
		env.solidAt(x, floor + 0.3, z)
	) {
		x = s.position.x; // bonk: stopped dead
		z = s.position.z;
		speed = 0;
		floor = env.floorAt(x, py, z);
	}

	const launched = onGround && input.boost; // ollie
	const wantY = floor + c.runHeight;
	let y: number;
	let vy: number;
	let air = false;
	if (launched || footY - floor > 0.1) {
		air = true;
		vy = (launched ? c.skateJump : s.velocity.y) - FALL_GRAVITY * dt;
		y = py + vy * dt;
		if (y <= wantY && vy <= 0) {
			y = wantY; // landed
			vy = 0;
			air = false;
		}
	} else {
		y = Math.max(wantY - 0.2, py + (wantY - py) * Math.min(1, 18 * dt));
		// Carry the slope's vertical speed, so a crest launches you.
		vy = Math.min(speed * 0.8, Math.max(-speed, (floor - here) / dt));
	}

	const next = standing(s, x, y, z, newYaw, speed, c);
	next.velocity.y = vy;
	next.fuel = 1;
	return { state: next, mode: "run", air };
}
