import alea from "alea";

/** Seeded PRNG for one place in the world, e.g. rngFor(seed, "air", cx, cz). */
export function rngFor(...parts: (string | number)[]): () => number {
	return alea(parts.join(":"));
}
