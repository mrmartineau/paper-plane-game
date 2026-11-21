import type * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createPlaneModel } from "./model";

const positions = (m: ReturnType<typeof createPlaneModel>) =>
	Array.from(
		(m.mesh.geometry.getAttribute("position") as THREE.BufferAttribute).array,
	);

describe("crane wings", () => {
	it("flap up and down about the shoulder, leaving the body alone", () => {
		const crane = createPlaneModel("crane");
		crane.flap(0, 0.6, 0);
		const rest = positions(crane);
		crane.flap(Math.PI / 2, 0.6, 0); // wings fully up
		const up = positions(crane);
		crane.flap(-Math.PI / 2, 0.6, 0); // wings fully down
		const down = positions(crane);
		let wingsMoved = 0;
		let others = 0;
		for (let i = 0; i < rest.length; i += 3) {
			const moved = Math.abs(up[i + 1] - rest[i + 1]) > 0.05;
			if (moved) wingsMoved++;
			else if (up[i] !== rest[i] || up[i + 1] !== rest[i + 1]) others++;
			if (moved)
				expect(Math.sign(up[i + 1] - rest[i + 1])).toBe(
					-Math.sign(down[i + 1] - rest[i + 1]),
				);
		}
		expect(wingsMoved).toBeGreaterThan(6);
		expect(others).toBeLessThan(wingsMoved);
		// The wing tip rises well above the body when flapped up.
		expect(Math.max(...up.filter((_, i) => i % 3 === 1))).toBeGreaterThan(0.8);
	});

	it("ordinary planes don't flap", () => {
		const dart = createPlaneModel("dart");
		const before = positions(dart);
		dart.flap(1, 0.6, 0.2);
		expect(positions(dart)).toEqual(before);
	});
});
