import * as THREE from "three";
import { config } from "../config";
import { createFlightState, type FlightState, heading } from "./flight";
import { createPaperBall } from "./model";

// Crash: the plane scrunches into a paper ball that rolls along the ground,
// then a fresh plane respawns nearby and folds open.
export type CrashPhase = "flying" | "rolling" | "fold";

type Ground = (x: number, z: number) => number;
type Solid = (x: number, y: number, z: number) => boolean;

export function createCrash(
	scene: THREE.Scene,
	groundAt: Ground,
	solidAt: Solid,
) {
	const ball = createPaperBall();
	ball.visible = false;
	scene.add(ball);

	let phase: CrashPhase = "flying";
	let t = 0;
	let yaw = 0;
	const pos = new THREE.Vector3();
	const prevPos = new THREE.Vector3();
	const vel = new THREE.Vector3();
	const axis = new THREE.Vector3();
	const spin = new THREE.Quaternion();
	const drawn = new THREE.Vector3();
	const lastDrawn = new THREE.Vector3();

	const radius = () => config.crash.ballRadius * config.plane.scale;
	const rest = (x: number, z: number) => groundAt(x, z) + radius();

	return {
		get phase() {
			return phase;
		},
		start(s: FlightState) {
			const c = config.crash;
			phase = "rolling";
			t = 0;
			yaw = heading(s.orientation);
			// Start where we hit (maybe up a tree); gravity brings the ball down.
			pos.set(
				s.position.x,
				Math.max(s.position.y, rest(s.position.x, s.position.z)),
				s.position.z,
			);
			prevPos.copy(pos);
			lastDrawn.copy(pos);
			vel.set(s.velocity.x, 0, s.velocity.z).multiplyScalar(c.carry);
			ball.quaternion.identity();
			ball.visible = true;
		},
		/** Fixed-step update. Returns a fresh flight state at the moment of respawn. */
		update(dt: number): FlightState | null {
			if (phase === "flying") return null;
			const c = config.crash;
			t += dt;
			if (phase === "rolling") {
				// Roll downhill: slope from the height field, plus friction.
				const e = 0.5;
				const gx =
					(groundAt(pos.x + e, pos.z) - groundAt(pos.x - e, pos.z)) / (2 * e);
				const gz =
					(groundAt(pos.x, pos.z + e) - groundAt(pos.x, pos.z - e)) / (2 * e);
				vel.x -= gx * c.slopeAccel * dt;
				vel.z -= gz * c.slopeAccel * dt;
				vel.multiplyScalar(Math.exp(-c.friction * dt));
				prevPos.copy(pos);
				pos.x += vel.x * dt;
				pos.z += vel.z * dt;
				vel.y -= 9.81 * dt;
				pos.y += vel.y * dt;
				const floor = rest(pos.x, pos.z);
				if (pos.y <= floor) {
					pos.y = floor;
					vel.y = 0;
				}
				if (t >= c.rollTime) {
					phase = "fold";
					t = 0;
					ball.visible = false;
					return respawnAt(pos.x, pos.z, yaw, groundAt, solidAt);
				}
			} else if (t >= c.foldTime) {
				phase = "flying";
			}
			return null;
		},
		/** Draw the ball; returns the plane's scale (0 = hidden). */
		render(alpha: number): number {
			const c = config.crash;
			if (phase === "flying") return 1;
			if (phase === "fold") {
				const k = Math.min(1, t / c.foldTime);
				return easeOutBack(k);
			}
			drawn.lerpVectors(prevPos, pos, alpha);
			// Spin by distance travelled: axis is horizontal, at right angles to the motion.
			const dx = drawn.x - lastDrawn.x;
			const dz = drawn.z - lastDrawn.z;
			const d = Math.hypot(dx, dz);
			if (d > 1e-5) {
				axis.set(dz / d, 0, -dx / d);
				ball.quaternion.premultiply(spin.setFromAxisAngle(axis, d / radius()));
			}
			lastDrawn.copy(drawn);
			ball.position.copy(drawn);
			const grow = Math.min(1, t / c.ballGrow);
			ball.scale.setScalar(config.plane.scale * grow);
			return 1 - grow; // plane shrinks as the ball grows
		},
	};
}

/**
 * Respawn high above a point, backed up along the heading, at glide speed.
 * If anything (an island, a tree on a hill) is in the way of the first few seconds
 * of glide, try spots further out and other headings until the way is clear.
 */
export function respawnAt(
	x: number,
	z: number,
	yaw: number,
	groundAt: Ground,
	solidAt: Solid,
): FlightState {
	const c = config.crash;
	let fallback: FlightState | null = null;
	for (let k = 0; k < c.respawnTries; k++) {
		// First ring: the usual spot behind the crash, trying 8 headings.
		// Later rings: spots on wider circles around the crash.
		const ring = Math.floor(k / 8);
		const turn = (k % 8) * (Math.PI / 4);
		const out = c.respawnBack + ring * c.respawnStep;
		const dir = yaw + (ring === 0 ? 0 : turn);
		const rx = x + Math.sin(dir) * out;
		const rz = z + Math.cos(dir) * out;
		const heading = yaw + turn;
		const s = createFlightState(
			{ x: rx, y: groundAt(rx, rz) + config.spawn.altitude, z: rz },
			heading,
			config.spawn.speed,
		);
		fallback ??= s;
		if (pathClear(s, heading, groundAt, solidAt)) return s;
	}
	return fallback as FlightState;
}

/** Is the straight glide ahead clear of terrain and solid things? Checks the wing tips too. */
function pathClear(
	s: FlightState,
	yaw: number,
	groundAt: Ground,
	solidAt: Solid,
): boolean {
	const fx = -Math.sin(yaw);
	const fz = -Math.cos(yaw);
	const slope = Math.tan(-config.flight.glidePitch);
	for (let d = 0; d <= config.crash.respawnClear; d += 5) {
		const x = s.position.x + fx * d;
		const z = s.position.z + fz * d;
		const y = s.position.y - d * slope;
		if (y < groundAt(x, z) + 10) return false;
		for (const side of [-4, 0, 4]) {
			if (solidAt(x - fz * side, y, z + fx * side)) return false;
		}
	}
	return true;
}

function easeOutBack(x: number): number {
	const c = 1.70158;
	return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2;
}
