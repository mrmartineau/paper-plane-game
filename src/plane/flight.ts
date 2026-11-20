// Arcade glider flight model. Pure: no Three.js, no globals.
//
// Orientation is stored as yaw/pitch/roll, not a quaternion: pitch and roll are
// clamped (the plane never loops or spins), so Euler angles have no gimbal
// problem here and auto-level / nose-drop become one-line rules.
// Conventions: yaw 0 faces -Z, pitch > 0 is nose up, roll > 0 is right wing down.

import type { Config } from "../config";
import type { InputState } from "../core/input";

export interface Vec3 {
	x: number;
	y: number;
	z: number;
}

export interface FlightState {
	position: Vec3;
	velocity: Vec3;
	yaw: number;
	pitch: number;
	roll: number;
	airspeed: number;
	sink: number; // m/s of downward slip when lift can't hold the plane up
	stickPitch: number; // smoothed input
	stickRoll: number;
}

export type FlightConfig = Config["flight"];

export function createFlightState(
	position: Vec3,
	yaw: number,
	airspeed: number,
): FlightState {
	return {
		position: { ...position },
		velocity: { x: 0, y: 0, z: 0 },
		yaw,
		pitch: 0,
		roll: 0,
		airspeed,
		sink: 0,
		stickPitch: 0,
		stickRoll: 0,
	};
}

export function forward(yaw: number, pitch: number): Vec3 {
	const cp = Math.cos(pitch);
	return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
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
	groundAt: (x: number, z: number) => number,
): StepResult {
	const k = 1 - Math.exp(-c.inputSmoothing * dt);
	const stickPitch = s.stickPitch + (input.pitch - s.stickPitch) * k;
	const stickRoll = s.stickRoll + (input.roll - s.stickRoll) * k;

	const v = s.airspeed;
	const liftFrac = liftFraction(v, c);
	const stall = 1 - liftFrac;
	const lift = Math.min(c.liftCoeff * v * v, c.maxLift) * liftFrac;

	// 1. Roll, with gentle auto-level when the stick is centred.
	let roll = s.roll + stickRoll * c.rollRate * dt;
	if (Math.abs(input.roll) < 0.05) roll -= roll * Math.min(1, c.autoLevel * dt);
	roll = clamp(roll, -c.maxRoll, c.maxRoll);

	// Pitch: less authority in a stall; relaxes to the glide angle; nose drops when stalling.
	let pitch = s.pitch + stickPitch * c.pitchRate * dt * (0.4 + 0.6 * liftFrac);
	if (Math.abs(input.pitch) < 0.05)
		pitch += (c.glidePitch - pitch) * Math.min(1, c.pitchStability * dt);
	pitch -= stall * c.stallNoseDrop * dt;
	pitch = clamp(pitch, -c.maxPitch, c.maxPitch);

	// 2. Bank turns the plane.
	const yaw = s.yaw - c.turnCoeff * Math.sin(roll) * v * dt;

	// 4 + 5. Speed trades with height; drag ∝ v². Boost is a gentle push.
	let airspeed =
		v +
		(-c.gravity * Math.sin(pitch) -
			c.drag * v * v +
			c.boost * (input.boost ? 1 : 0)) *
			dt;
	airspeed = clamp(airspeed, 0, c.maxSpeed);

	// 3 + 6. Gravity vs lift across the path. Missing lift (stall, steep bank) builds sink.
	const need = c.gravity * Math.cos(pitch);
	const support = lift * Math.cos(roll);
	const sink = clamp(s.sink + (need - support) * dt, 0, c.maxSink);

	const f = forward(yaw, pitch);
	const velocity = {
		x: f.x * airspeed,
		y: f.y * airspeed - sink,
		z: f.z * airspeed,
	};
	const position = {
		x: s.position.x + velocity.x * dt,
		y: s.position.y + velocity.y * dt,
		z: s.position.z + velocity.z * dt,
	};

	// 8. Collision.
	const crashed = position.y < groundAt(position.x, position.z) + c.clearance;

	return {
		state: {
			position,
			velocity,
			yaw,
			pitch,
			roll,
			airspeed,
			sink,
			stickPitch,
			stickRoll,
		},
		crashed,
	};
}

function clamp(x: number, lo: number, hi: number): number {
	return Math.min(Math.max(x, lo), hi);
}
