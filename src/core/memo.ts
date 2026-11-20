/**
 * Cache a pure per-cell generator. Least-recently-used entries drop out past `cap`,
 * so memory stays flat however far you fly.
 */
export function memoCells<T>(fn: (cx: number, cz: number) => T, cap = 4096) {
	const cache = new Map<string, T>();
	return (cx: number, cz: number): T => {
		const key = `${cx},${cz}`;
		const hit = cache.get(key);
		if (hit !== undefined) {
			cache.delete(key); // move to the newest end
			cache.set(key, hit);
			return hit;
		}
		const v = fn(cx, cz);
		cache.set(key, v);
		if (cache.size > cap) cache.delete(cache.keys().next().value as string);
		return v;
	};
}

/** Call `fn` for every cell index whose square overlaps [x ± reach, z ± reach]. */
export function forCells(
	x: number,
	z: number,
	reach: number,
	cellSize: number,
	fn: (cx: number, cz: number) => void,
) {
	const x0 = Math.floor((x - reach) / cellSize);
	const x1 = Math.floor((x + reach) / cellSize);
	const z0 = Math.floor((z - reach) / cellSize);
	const z1 = Math.floor((z + reach) / cellSize);
	for (let cx = x0; cx <= x1; cx++)
		for (let cz = z0; cz <= z1; cz++) fn(cx, cz);
}
