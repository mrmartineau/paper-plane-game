// Web Worker: builds terrain chunk arrays off the main thread.
// Messages in: { type: "init", seed, world } then { id, cx, cz, lod }.
// Messages out: { id, position, color } with the buffers transferred (no copy).
import type { Config } from "../config";
import { buildChunk } from "./chunk";
import {
	type ClimateFn,
	createClimate,
	createHeight,
	type HeightFn,
} from "./height";

let world: Config["world"];
let height: HeightFn;
let climate: ClimateFn;

self.onmessage = (e: MessageEvent) => {
	const m = e.data;
	if (m.type === "init") {
		world = m.world;
		height = createHeight(m.seed, world);
		climate = createClimate(m.seed, world);
		return;
	}
	const { position, color } = buildChunk(
		m.cx,
		m.cz,
		m.lod,
		height,
		climate,
		world,
	);
	(self as unknown as Worker).postMessage({ id: m.id, position, color }, [
		position.buffer,
		color.buffer,
	]);
};
