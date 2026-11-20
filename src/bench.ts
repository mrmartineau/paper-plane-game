import { config } from "./config";
import type { InputState } from "./core/input";

// ?bench: an autopilot flies straight and fast at a steady height, and frame times
// are measured. A small panel shows live stats; a summary is logged when it ends.
// This is the Phase 2 check: 10 minutes, no frame over 50 ms, memory flat.

export function createBench() {
	const b = config.bench;
	const frames: number[] = [];
	const memory: number[] = [];
	let elapsed = 0;
	let done = false;
	let nextMemory = 0;
	let maxMs = 0;
	let over50 = 0;

	const panel = document.createElement("pre");
	panel.style.cssText =
		"position:fixed;left:16px;top:16px;margin:0;padding:8px 10px;background:#fbf8f1e6;border:1px solid #d9d2c2;border-radius:6px;font:12px/1.4 ui-monospace,monospace;color:#3d4a50;z-index:10";
	document.body.append(panel);

	const heap = () =>
		(performance as Performance & { memory?: { usedJSHeapSize: number } })
			.memory?.usedJSHeapSize;

	function summary() {
		const s = [...frames].sort((x, y) => x - y);
		const at = (q: number) =>
			s[Math.min(s.length - 1, Math.floor(s.length * q))] ?? 0;
		return {
			minutes: +(elapsed / 60).toFixed(1),
			frames: s.length,
			medianMs: +at(0.5).toFixed(1),
			p99Ms: +at(0.99).toFixed(1),
			maxMs: +(s[s.length - 1] ?? 0).toFixed(1),
			over50ms: frames.filter((f) => f > 50).length,
			heapMB: memory.length
				? `${memory[0]} → ${memory[memory.length - 1]}`
				: "n/a",
		};
	}

	return {
		/** Autopilot: hold `altitude` above the ground, wings level, boost to hold `speed`. */
		steer(input: InputState, altitude: number, climb: number, speed: number) {
			if (done) return;
			input.pitch = Math.max(
				-1,
				Math.min(1, (b.altitude - altitude) * 0.03 - climb * 0.15),
			);
			input.roll = 0;
			input.boost = speed < b.speed; // hold a steady cruise, not full rocket
		},
		frame(ms: number) {
			if (done) return;
			elapsed += ms / 1000;
			if (elapsed < b.warmup) return; // skip the first load
			frames.push(ms);
			maxMs = Math.max(maxMs, ms);
			if (ms > 50) over50++;
			if (elapsed > nextMemory) {
				const h = heap();
				if (h) memory.push(Math.round(h / 1e6));
				nextMemory = elapsed + 10;
			}
			// Cheap running numbers while it runs; the full (sorted) summary only at the end.
			if (frames.length % 30 === 0) {
				const heapNow = memory.length
					? `${memory[0]} → ${memory[memory.length - 1]} MB`
					: "n/a";
				panel.textContent = `bench ${(elapsed / 60).toFixed(1)}/${b.minutes} min\nframes ${frames.length}\nmax ${maxMs.toFixed(1)} ms\nover 50 ms ${over50}\nheap ${heapNow}`;
			}
			if (elapsed > b.minutes * 60) {
				done = true;
				const result = summary();
				console.table(result);
				panel.textContent = `bench done\n${JSON.stringify(result, null, 1).replace(/[{}"]/g, "")}`;
			}
		},
	};
}
