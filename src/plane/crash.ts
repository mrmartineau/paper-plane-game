import { config } from "../config";
import type { HeightFn } from "../world/height";
import { createFlightState, type FlightState } from "./flight";

// Crash sequence: crumple (plane squashes and tumbles) → respawn nearby → fold open.
export type CrashPhase = "flying" | "crumple" | "fold";

export function createCrash(groundAt: HeightFn) {
	let phase: CrashPhase = "flying";
	let t = 0;

	return {
		get phase() {
			return phase;
		},
		start() {
			phase = "crumple";
			t = 0;
		},
		/** Advance the timer. Returns a fresh flight state at the moment of respawn. */
		update(dt: number, current: FlightState): FlightState | null {
			if (phase === "flying") return null;
			t += dt;
			if (phase === "crumple" && t >= config.crash.crumpleTime) {
				phase = "fold";
				t = 0;
				return respawnState(current, groundAt);
			}
			if (phase === "fold" && t >= config.crash.foldTime) phase = "flying";
			return null;
		},
		/** Visual transform for the plane mesh: scale (xyz) and extra spin. */
		visual() {
			if (phase === "crumple") {
				const k = Math.min(1, t / config.crash.crumpleTime);
				return {
					sx: 1 - 0.7 * k,
					sy: 1 + 0.6 * k,
					sz: 1 - 0.6 * k,
					spin: k * 4,
				};
			}
			if (phase === "fold") {
				const k = easeOutBack(Math.min(1, t / config.crash.foldTime));
				return { sx: k, sy: 1, sz: k, spin: (1 - k) * -3 };
			}
			return { sx: 1, sy: 1, sz: 1, spin: 0 };
		},
	};
}

/** Back up along the heading, high above the ground, at glide speed. */
export function respawnState(s: FlightState, groundAt: HeightFn): FlightState {
	const back = config.crash.respawnBack;
	const x = s.position.x + Math.sin(s.yaw) * back;
	const z = s.position.z + Math.cos(s.yaw) * back;
	const ground = Math.max(groundAt(x, z), config.world.seaLevel);
	return createFlightState(
		{ x, y: ground + config.spawn.altitude, z },
		s.yaw,
		config.spawn.speed,
	);
}

function easeOutBack(x: number): number {
	const c = 1.70158;
	return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2;
}
