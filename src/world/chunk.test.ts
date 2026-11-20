import { describe, expect, it } from "vitest";
import { config } from "../config";
import { buildChunk, lodQuads } from "./chunk";
import { createClimate, createHeight } from "./height";

const w = config.world;
const height = createHeight("paper", w);
const climate = createClimate("paper", w);

describe("chunk", () => {
	it("is deterministic", () => {
		const a = buildChunk(2, -3, 0, height, climate, w);
		const b = buildChunk(2, -3, 0, height, climate, w);
		expect(a.position).toEqual(b.position);
		expect(a.color).toEqual(b.color);
	});

	it("has fewer triangles at each LOD", () => {
		const verts = [0, 1, 2].map(
			(lod) => buildChunk(0, 0, lod, height, climate, w).position.length / 3,
		);
		for (const [lod, v] of verts.entries()) {
			const n = lodQuads(w, lod);
			expect(v).toBe((n * n * 2 + 8 * n) * 3); // ground + skirts
		}
		expect(verts[0]).toBeGreaterThan(verts[1]);
		expect(verts[1]).toBeGreaterThan(verts[2]);
	});

	it("sits on height(), so neighbouring chunks meet at the seam", () => {
		const { position } = buildChunk(1, 1, 1, height, climate, w);
		for (let i = 0; i < 300; i += 3) {
			expect(position[i * 3 + 1]).toBeCloseTo(
				height(position[i * 3], position[i * 3 + 2]),
				3,
			);
		}
	});

	it("colours are valid linear RGB", () => {
		const { color } = buildChunk(5, 5, 2, height, climate, w);
		for (const c of color) {
			expect(c).toBeGreaterThanOrEqual(0);
			expect(c).toBeLessThanOrEqual(1);
		}
	});
});
