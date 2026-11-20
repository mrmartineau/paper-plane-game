import { config } from "../config";
import type { ChunkArrays } from "../world/chunk";

/** A small pool of chunk-building workers. `build` resolves with the chunk's arrays. */
export function createChunkWorkers(seed: string) {
	const count = Math.max(
		1,
		Math.min(config.world.workers, (navigator.hardwareConcurrency || 4) - 1),
	);
	const pending = new Map<number, (a: ChunkArrays) => void>();
	const workers = Array.from({ length: count }, () => {
		const w = new Worker(new URL("../world/chunkWorker.ts", import.meta.url), {
			type: "module",
		});
		w.postMessage({ type: "init", seed, world: config.world });
		w.onmessage = (e: MessageEvent) => {
			const { id, position, color } = e.data;
			pending.get(id)?.({ position, color });
			pending.delete(id);
		};
		return w;
	});
	let next = 0;
	let id = 0;

	return {
		build(cx: number, cz: number, lod: number): Promise<ChunkArrays> {
			const job = id++;
			const worker = workers[next];
			next = (next + 1) % workers.length;
			return new Promise((resolve) => {
				pending.set(job, resolve);
				worker.postMessage({ id: job, cx, cz, lod });
			});
		},
		/** Jobs sent but not back yet. */
		get inFlight() {
			return pending.size;
		},
	};
}
