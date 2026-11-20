// Flight stats for the HUD. Pure: no DOM, no Three.js.
import { axes, type FlightState } from "../plane/flight";

export interface Stats {
	flightTime: number; // seconds since the last spawn
	distance: number; // metres flown since the last spawn
	liftTime: number; // seconds in rising air this flight
	loops: number;
	bestAltitude: number; // metres above ground, this session
	topSpeed: number; // m/s, this session
	crashes: number;
	hoops: number; // hoop passes, this session
}

export function createStats() {
	const stats: Stats = {
		flightTime: 0,
		distance: 0,
		liftTime: 0,
		loops: 0,
		bestAltitude: 0,
		topSpeed: 0,
		crashes: 0,
		hoops: 0,
	};
	// Loop = nose goes up past vertical, over the top upside down, down the back, and level again.
	let stage = 0;

	return {
		stats,
		step(dt: number, s: FlightState, altitude: number, air: number) {
			stats.flightTime += dt;
			stats.distance +=
				Math.hypot(s.velocity.x, s.velocity.y, s.velocity.z) * dt;
			if (air > 0.5) stats.liftTime += dt;
			stats.bestAltitude = Math.max(stats.bestAltitude, altitude);
			stats.topSpeed = Math.max(stats.topSpeed, s.airspeed);

			const { forward: f, up: u } = axes(s.orientation);
			if (stage === 0 && f.y > 0.8) stage = 1;
			else if (stage === 1 && u.y < -0.5) stage = 2;
			else if (stage === 2 && f.y < -0.5) stage = 3;
			else if (stage === 3 && f.y > -0.3 && u.y > 0.3) {
				stats.loops++;
				stage = 0;
			} else if (
				(stage === 1 || stage === 2) &&
				u.y > 0.5 &&
				f.y < 0.2 &&
				f.y > -0.3
			) {
				stage = 0; // gave up, or rolled out at the top: not a loop
			}
		},
		crash() {
			stats.crashes++;
			stats.flightTime = 0;
			stats.distance = 0;
			stats.liftTime = 0;
			stage = 0;
		},
	};
}
