// Global wind: one vector whose direction and strength drift slowly over time.
// Ridge lift: wind blowing up a slope rises, near the ground. Pure, no Three.js.
import type { Config } from "../config";
import { makeNoise } from "./noise";

export type WindConfig = Config["wind"];

export function createWind(
	seed: string,
	c: WindConfig,
	height: (x: number, z: number) => number,
) {
	const dirNoise = makeNoise(seed, "windDir");
	const strengthNoise = makeNoise(seed, "windStrength");
	const drift = { x: 0, z: 0 }; // how far the air has moved since t = 0 (clouds ride on this)
	let driftTime = 0;

	/** Wind at time t (m/s, horizontal). */
	function at(t: number) {
		const angle = dirNoise(t * c.drift, 0) * Math.PI * 2;
		const speed =
			c.min + (c.max - c.min) * (0.5 + 0.5 * strengthNoise(t * c.drift, 7));
		return { x: Math.cos(angle) * speed, z: Math.sin(angle) * speed };
	}

	/** Wind at a point: calmer near the ground, full strength above `fullHeight`. */
	function atPoint(t: number, x: number, y: number, z: number) {
		const w = at(t);
		const above = y - height(x, z);
		const k = Math.min(1, Math.max(c.groundShare, above / c.fullHeight));
		return { x: w.x * k, z: w.z * k };
	}

	/** Vertical lift from wind blowing up a slope (0 on lee slopes), fading with height above the ground. */
	function ridge(t: number, x: number, y: number, z: number): number {
		const ground = height(x, z);
		const above = y - ground;
		if (above < 0 || above > c.ridgeHeight) return 0;
		const e = 4;
		const gx = (height(x + e, z) - height(x - e, z)) / (2 * e);
		const gz = (height(x, z + e) - height(x, z - e)) / (2 * e);
		const w = at(t);
		const up = (w.x * gx + w.z * gz) * c.ridgeGain; // wind · slope: positive when blowing uphill
		if (up <= 0) return 0;
		return Math.min(c.ridgeMax, up) * (1 - above / c.ridgeHeight);
	}

	/** Advance and return the accumulated drift (call once per frame with the current time). */
	function driftTo(t: number) {
		const dt = t - driftTime;
		if (dt > 0) {
			const w = at(t);
			drift.x += w.x * dt;
			drift.z += w.z * dt;
			driftTime = t;
		}
		return drift;
	}

	return { at, atPoint, ridge, driftTo };
}
