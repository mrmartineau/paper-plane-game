// Ring pass detection: did the step from a to b go through the ring's hole?
// Pure maths, shared by free-standing hoops now and course rings later.
import type { Vec3 } from "../plane/flight";

export interface Ring {
	x: number;
	y: number;
	z: number;
	yaw: number; // the hole faces along local Z = (sin yaw, 0, cos yaw)
	R: number; // ring radius to the tube centre
	r: number; // tube radius
}

export function passedThrough(ring: Ring, a: Vec3, b: Vec3): boolean {
	const nx = Math.sin(ring.yaw);
	const nz = Math.cos(ring.yaw);
	const da = (a.x - ring.x) * nx + (a.z - ring.z) * nz;
	const db = (b.x - ring.x) * nx + (b.z - ring.z) * nz;
	if (da === db || da > 0 === db > 0) return false; // didn't cross the ring's plane
	const t = da / (da - db);
	const px = a.x + (b.x - a.x) * t - ring.x;
	const py = a.y + (b.y - a.y) * t - ring.y;
	const pz = a.z + (b.z - a.z) * t - ring.z;
	const hole = ring.R - ring.r;
	return px * px + py * py + pz * pz < hole * hole;
}
