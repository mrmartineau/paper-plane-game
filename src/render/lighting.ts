import * as THREE from "three";
import { config } from "../config";

// Day/night cycle: blends sky, fog, sun and ambient between keyframes, moves the sun
// (a dim blue moon at night), and reports how dark it is so lanterns can glow.

export interface Light {
	horizon: THREE.Color;
	zenith: THREE.Color;
	sun: THREE.Color;
	sunIntensity: number;
	ambient: number;
	night: number; // 0 = full day, 1 = full night
	sunDir: THREE.Vector3; // unit vector toward the light
}

export function createLighting() {
	const out: Light = {
		horizon: new THREE.Color(),
		zenith: new THREE.Color(),
		sun: new THREE.Color(),
		sunIntensity: 1,
		ambient: 1,
		night: 0,
		sunDir: new THREE.Vector3(),
	};
	const a = new THREE.Color();
	const b = new THREE.Color();

	/** Light at a time of day (0..1, 0 = midnight). */
	function at(dayTime: number): Light {
		const keys = config.dayNight.keys;
		const t = ((dayTime % 1) + 1) % 1;
		let i = 0;
		while (i < keys.length - 2 && keys[i + 1].t < t) i++;
		const k0 = keys[i];
		const k1 = keys[i + 1];
		const f = (t - k0.t) / Math.max(1e-6, k1.t - k0.t);
		const mix = (c0: number, c1: number, target: THREE.Color) =>
			target.copy(a.set(c0)).lerp(b.set(c1), f);
		mix(k0.horizon, k1.horizon, out.horizon);
		mix(k0.zenith, k1.zenith, out.zenith);
		mix(k0.sun, k1.sun, out.sun);
		out.sunIntensity =
			k0.sunIntensity + (k1.sunIntensity - k0.sunIntensity) * f;
		out.ambient = k0.ambient + (k1.ambient - k0.ambient) * f;

		// Sun rises at 0.25, peaks at 0.5, sets at 0.75. Below the horizon the "sun" is the moon, opposite.
		const angle = (t - 0.25) * Math.PI * 2;
		const elevation = Math.sin(angle);
		const day = elevation > 0;
		const el = Math.max(0.25, Math.abs(elevation)); // keep shadows from getting absurdly long
		const az = day ? angle : angle + Math.PI;
		out.sunDir
			.set(Math.cos(az) * 0.8, el, Math.sin(az) * 0.5 + 0.3)
			.normalize();
		out.night = THREE.MathUtils.clamp(1 - (elevation + 0.15) / 0.35, 0, 1);
		return out;
	}

	return { at };
}
