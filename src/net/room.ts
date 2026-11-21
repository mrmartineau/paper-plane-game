// Room rules, kept apart from the Durable Object so they can be tested.
import type { Player } from "./protocol";

export const MAX_PLAYERS = 24;
export const STATE_GAP_MS = 40; // drop state faster than 25 Hz
export const SHOT_GAP_MS = 150; // drop shots faster than ~6 a second

/** Paper colours for players. */
export const COLOURS = [
	"#f28b82",
	"#fbbc04",
	"#fff475",
	"#ccff90",
	"#a7ffeb",
	"#cbf0f8",
	"#aecbfa",
	"#d7aefb",
	"#fdcfe8",
	"#e6c9a8",
	"#ffab91",
	"#b39ddb",
];

export function nextId(players: Player[]): number {
	return players.reduce((m, p) => Math.max(m, p.id), 0) + 1;
}

/** The first colour nobody has, or the least used one. */
export function pickColour(taken: string[]): string {
	let best = COLOURS[0];
	let fewest = Infinity;
	for (const c of COLOURS) {
		const n = taken.filter((t) => t === c).length;
		if (n < fewest) {
			fewest = n;
			best = c;
		}
	}
	return best;
}

/** A player reports being hit by `by`. Returns the shooter with one more point, or null. */
export function scoreHit(
	players: Player[],
	victim: number,
	by: number,
): Player | null {
	if (by === victim) return null;
	const shooter = players.find((p) => p.id === by);
	return shooter ? { ...shooter, score: shooter.score + 1 } : null;
}

/** Rate gate: true (and moves the clock on) when enough time has passed. */
export function allow(
	last: Map<string, number>,
	key: string,
	now: number,
	gap: number,
): boolean {
	if (now - (last.get(key) ?? -Infinity) < gap) return false;
	last.set(key, now);
	return true;
}
