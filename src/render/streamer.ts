import type * as THREE from "three";
import { config } from "../config";
import { forCells } from "../core/memo";

// Streams per-cell meshes around the player: builds the nearest missing cells first,
// swaps cells whose LOD changed, and disposes cells that fall out of range.
// Layers can build on the main thread (within a time budget per frame) or in a worker
// (`buildAsync`, a few jobs in flight at once). Materials are shared, so only
// geometries are disposed.

export interface StreamLayer {
	cellSize: number;
	range: number; // metres from the player to the nearest point of the cell
	lod?: (distance: number) => number;
	build(cx: number, cz: number, lod: number): THREE.Object3D | null;
	/** Off-main-thread build, used in normal play. `build` is still used after a jump. */
	buildAsync?(
		cx: number,
		cz: number,
		lod: number,
	): Promise<THREE.Object3D | null>;
	maxInFlight?: number;
	/** After a jump, cells nearer than this are built at once on the main thread; the rest stream as usual. */
	syncRange?: number;
}

interface Loaded {
	obj: THREE.Object3D | null;
	lod: number;
	cx: number;
	cz: number;
}

export function createStreamer(scene: THREE.Scene, layers: StreamLayer[]) {
	const loaded = layers.map(() => new Map<string, Loaded>());
	const building = layers.map(() => new Map<string, number>()); // key → lod being built async
	const wanted = layers.map(() => new Map<string, number>()); // key → lod wanted right now

	const distance = (
		px: number,
		pz: number,
		cx: number,
		cz: number,
		size: number,
	) => {
		const dx = Math.max(cx * size - px, 0, px - (cx + 1) * size);
		const dz = Math.max(cz * size - pz, 0, pz - (cz + 1) * size);
		return Math.hypot(dx, dz);
	};

	const drop = (obj: THREE.Object3D | null) => {
		if (!obj) return;
		scene.remove(obj);
		obj.traverse((o) => {
			const mesh = o as THREE.Mesh;
			if (mesh.isMesh) mesh.geometry.dispose();
		});
	};

	const put = (
		li: number,
		cx: number,
		cz: number,
		lod: number,
		obj: THREE.Object3D | null,
	) => {
		const key = `${cx},${cz}`;
		if (obj) scene.add(obj);
		drop(loaded[li].get(key)?.obj ?? null); // swap after the new one is in, so there's no gap
		loaded[li].set(key, { obj, lod, cx, cz });
	};

	return {
		/** `budgetMs` = Infinity builds everything now, on the main thread (after a jump). Returns cells still to build. */
		update(px: number, pz: number, budgetMs: number): number {
			const start = performance.now();
			const now = budgetMs === Number.POSITIVE_INFINITY;
			const jobs: {
				li: number;
				cx: number;
				cz: number;
				lod: number;
				d: number;
			}[] = [];

			layers.forEach((layer, li) => {
				const map = loaded[li];
				for (const [key, e] of map) {
					if (
						distance(px, pz, e.cx, e.cz, layer.cellSize) >
						layer.range + layer.cellSize * 0.25
					) {
						drop(e.obj);
						map.delete(key);
					}
				}
				wanted[li].clear();
				forCells(px, pz, layer.range, layer.cellSize, (cx, cz) => {
					const d = distance(px, pz, cx, cz, layer.cellSize);
					if (d > layer.range) return;
					const lod = layer.lod?.(d) ?? 0;
					const key = `${cx},${cz}`;
					wanted[li].set(key, lod);
					const e = map.get(key);
					if ((!e || e.lod !== lod) && building[li].get(key) !== lod)
						jobs.push({ li, cx, cz, lod, d });
				});
			});

			jobs.sort((a, b) => a.d - b.d);
			let done = 0;
			for (const job of jobs) {
				const layer = layers[job.li];
				const key = `${job.cx},${job.cz}`;
				const urgent =
					now && job.d < (layer.syncRange ?? config.world.syncRange);
				if (layer.buildAsync && !urgent) {
					if (building[job.li].size >= (layer.maxInFlight ?? 4)) continue;
					building[job.li].set(key, job.lod);
					layer.buildAsync(job.cx, job.cz, job.lod).then((obj) => {
						if (building[job.li].get(key) === job.lod)
							building[job.li].delete(key);
						// Still wanted at this LOD? Otherwise throw it away.
						if (wanted[job.li].get(key) === job.lod)
							put(job.li, job.cx, job.cz, job.lod, obj);
						else drop(obj);
					});
					done++;
					continue;
				}
				if (
					!urgent &&
					done > 0 &&
					performance.now() - start >
						(now ? config.world.buildBudgetMs : budgetMs)
				)
					continue;
				put(
					job.li,
					job.cx,
					job.cz,
					job.lod,
					layer.build(job.cx, job.cz, job.lod),
				);
				done++;
			}
			return jobs.length - done;
		},
	};
}
