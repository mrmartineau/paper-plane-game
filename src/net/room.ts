// Room rules, kept apart from the Durable Object so they can be tested.
import type { Player } from "./protocol";

export const MAX_PLAYERS = 24;
export const STATE_GAP_MS = 40; // drop state faster than 25 Hz
export const TAG_GAP_MS = 2500; // the tag cannot be passed faster than this
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

/** Who is "it": the current one if there is one, else a random player. Needs two players. */
export function chooseIt(players: Player[], rnd = Math.random): number | null {
	if (players.length < 2) return null;
	const now = players.find((p) => p.it);
	return now ? now.id : players[Math.floor(rnd() * players.length)].id;
}

/**
 * `to` was touched by `from`. Valid only when `from` is "it" and they are different players.
 * Returns the two players as they should be afterwards (the tagger scores a point), or null.
 */
export function passTag(
	players: Player[],
	from: number,
	to: number,
): { tagger: Player; tagged: Player } | null {
	const a = players.find((p) => p.id === from);
	const b = players.find((p) => p.id === to);
	if (!a?.it || !b || a.id === b.id) return null;
	return {
		tagger: { ...a, it: false, score: a.score + 1 },
		tagged: { ...b, it: true },
	};
}
