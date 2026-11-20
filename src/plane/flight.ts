// Arcade glider flight model. Pure: no Three.js, no globals.
//
// Orientation is a quaternion, so loops and rolls work. Stick pitch and roll
// rotate the plane in its own frame. Turning (from bank), the glide-angle
// relax and the stall nose-drop rotate it in the world frame.
// Conventions: nose is local -Z, up is local +Y, right wing is local +X.

import type { Config } from "../config";
import type { InputState } from "../core/input";

export interface Vec3 {
	x: number;
	y: number;
	z: number;
}

export interface Quat {
	x: number;
	y: number;
	z: number;
	w: number;
}

export interface FlightState {
	position: Vec3;
	velocity: Vec3;
	orientation: Quat;
	airspeed: number;
	sink: number; // m/s of downward slip when lift can't hold the plane up
	stickPitch: number; // smoothed input
	stickRoll: number;
}

export interface FlightEnv {
	groundAt: (x: number, z: number) => number;
	/** Vertical air speed (thermals > 0, sinking air < 0). */
	airAt: (x: number, y: number, z: number) => number;
	/** True inside a tree, rock or arch. */
	solidAt: (x: number, y: number, z: number) => boolean;
	/** Horizontal wind (m/s). The plane drifts with the air it flies in. */
	windAt: (x: number, y: number, z: number) => { x: number; z: number };
}

export type FlightConfig = Config["flight"];

const X = { x: 1, y: 0, z: 0 };
const Y = { x: 0, y: 1, z: 0 };
const Z = { x: 0, y: 0, z: 1 };

export function createFlightState(
	position: Vec3,
	yaw: number,
	airspeed: number,
): FlightState {
	return {
		position: { ...position },
		velocity: { x: 0, y: 0, z: 0 },
		orientation: fromEuler(yaw, 0, 0),
		airspeed,
		sink: 0,
		stickPitch: 0,
		stickRoll: 0,
	};
}

/** yaw (0 = facing -Z), pitch (> 0 nose up), roll (> 0 right wing down). */
export function fromEuler(yaw: number, pitch: number, roll: number): Quat {
	return qmul(qmul(qaxis(Y, yaw), qaxis(X, pitch)), qaxis(Z, -roll));
}

export function axes(q: Quat) {
	return {
		forward: rotate(q, { x: 0, y: 0, z: -1 }),
		up: rotate(q, Y),
		right: rotate(q, X),
	};
}

/** Compass heading in radians (0 = -Z). Stable even when the nose points straight up or down. */
export function heading(q: Quat): number {
	const { forward: f, up: u } = axes(q);
	if (f.x * f.x + f.z * f.z > 0.04) return Math.atan2(-f.x, -f.z);
	const s = f.y < 0 ? 1 : -1; // nose down: the belly faces back, so "up" points ahead
	return Math.atan2(-u.x * s, -u.z * s);
}

/** Fraction of full lift available: 1 at or above stall speed, falls off below it. */
export function liftFraction(airspeed: number, c: FlightConfig): number {
	return Math.min(1, (airspeed / c.stallSpeed) ** 2);
}

export interface StepResult {
	state: FlightState;
	crashed: boolean;
}

export function stepFlight(
	s: FlightState,
	input: InputState,
	dt: number,
	c: FlightConfig,
	env: FlightEnv,
): StepResult {
	const k = 1 - Math.exp(-c.inputSmoothing * dt);
	const stickPitch = s.stickPitch + (input.pitch - s.stickPitch) * k;
	const stickRoll = s.stickRoll + (input.roll - s.stickRoll) * k;
	const idlePitch = Math.abs(input.pitch) < 0.05;
	const idleRoll = Math.abs(input.roll) < 0.05;

	const v = s.airspeed;
	const liftFrac = liftFraction(v, c);
	const stall = 1 - liftFrac;
	const lift = Math.min(c.liftCoeff * v * v, c.maxLift) * liftFrac;

	let q = s.orientation;
	const { forward: f, up: u, right: r } = axes(q);
	const level = Math.sqrt(Math.max(0, 1 - f.y * f.y)); // cos(pitch)
	const bank = Math.atan2(-r.y, u.y); // 0 = wings level, ±π = upside down

	// 1. Stick input in the plane's own frame. Less pitch authority in a stall.
	// With both sticks idle the wings roll back to level (this also rolls you out of inverted).
	let roll = stickRoll * c.rollRate * dt;
	if (idleRoll && idlePitch)
		roll -= bank * Math.min(1, c.autoLevel * dt) * level;
	q = qmul(q, qaxis(X, stickPitch * c.pitchRate * dt * (0.4 + 0.6 * liftFrac)));
	q = qmul(q, qaxis(Z, -roll));

	// 2. Bank turns the plane (rotation about world up).
	q = qmul(qaxis(Y, c.turnCoeff * r.y * v * dt), q);

	// Glide-angle relax (upright, no pitch input) and stall nose-drop, about a world-horizontal axis.
	let nose = -stall * c.stallNoseDrop * dt;
	if (idlePitch && u.y > 0)
		nose +=
			(c.glidePitch - Math.asin(f.y)) * Math.min(1, c.pitchStability * dt);
	const pitchAxis =
		level > 0.05 ? { x: -f.z / level, y: 0, z: f.x / level } : r;
	q = qnorm(qmul(qaxis(pitchAxis, nose), q));

	const { forward: nf, up: nu } = axes(q);

	// 4 + 5. Speed trades with height; drag ∝ v². Boost is a push along the nose.
	let airspeed =
		v + (-c.gravity * nf.y - c.drag * v * v + (input.boost ? c.boost : 0)) * dt;
	airspeed = clamp(airspeed, 0, c.maxSpeed);

	// 3 + 6. Gravity vs lift across the path. Missing lift (stall, knife edge) builds sink.
	// |up.y| means lift holds you inverted too: arcade, and it keeps loops clean.
	const need = c.gravity * Math.sqrt(Math.max(0, 1 - nf.y * nf.y));
	const support = lift * Math.abs(nu.y);
	const sink = clamp(s.sink + (need - support) * dt, 0, c.maxSink);

	// 7. Rising or sinking air moves the plane up or down.
	const air = env.airAt(s.position.x, s.position.y, s.position.z);
	const wind = env.windAt(s.position.x, s.position.y, s.position.z);

	const velocity = {
		x: nf.x * airspeed + wind.x,
		y: nf.y * airspeed - sink + air,
		z: nf.z * airspeed + wind.z,
	};
	const position = {
		x: s.position.x + velocity.x * dt,
		y: s.position.y + velocity.y * dt,
		z: s.position.z + velocity.z * dt,
	};

	// 8. Collision with the ground, water, trees, rocks and arches.
	const crashed =
		position.y < env.groundAt(position.x, position.z) + c.clearance ||
		env.solidAt(position.x, position.y, position.z);

	return {
		state: {
			position,
			velocity,
			orientation: q,
			airspeed,
			sink,
			stickPitch,
			stickRoll,
		},
		crashed,
	};
}

// --- tiny quaternion helpers ---

function qaxis(a: Vec3, angle: number): Quat {
	const h = angle / 2;
	const s = Math.sin(h);
	return { x: a.x * s, y: a.y * s, z: a.z * s, w: Math.cos(h) };
}

function qmul(a: Quat, b: Quat): Quat {
	return {
		x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
		y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
		z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
		w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
	};
}

function qnorm(q: Quat): Quat {
	const l = Math.hypot(q.x, q.y, q.z, q.w);
	return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l };
}

function rotate(q: Quat, v: Vec3): Vec3 {
	// v' = v + 2w(q×v) + 2q×(q×v)
	const tx = 2 * (q.y * v.z - q.z * v.y);
	const ty = 2 * (q.z * v.x - q.x * v.z);
	const tz = 2 * (q.x * v.y - q.y * v.x);
	return {
		x: v.x + q.w * tx + (q.y * tz - q.z * ty),
		y: v.y + q.w * ty + (q.z * tx - q.x * tz),
		z: v.z + q.w * tz + (q.x * ty - q.y * tx),
	};
}

function clamp(x: number, lo: number, hi: number): number {
	return Math.min(Math.max(x, lo), hi);
}
