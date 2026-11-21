// Messages between the game and the room server. JSON, small field names.
// Shared by the browser and the Worker, so no DOM or Cloudflare APIs here.

export type Vec = [number, number, number];
export type Quat = [number, number, number, number];

/** Flags in PlayerState.f */
export const BOOST = 1;
export const RUNNING = 2;
export const CRASHED = 4;

/** Where a player is: position, orientation, plane type, flags. */
export interface PlayerState {
	p: Vec;
	q: Quat;
	type: string;
	f: number;
}

export interface Player {
	id: number;
	colour: string;
	score: number;
}

export type ClientMsg =
	| { t: "state"; s: PlayerState }
	| { t: "shot"; p: Vec; v: Vec }
	| { t: "hit"; by: number };

export type ServerMsg =
	| { t: "welcome"; id: number; colour: string; players: Player[] }
	| { t: "join"; player: Player }
	| { t: "leave"; id: number }
	| { t: "state"; id: number; s: PlayerState }
	| { t: "shot"; id: number; p: Vec; v: Vec }
	| { t: "score"; id: number; score: number }
	| { t: "full" };

const LIMIT = 1e6; // no coordinate in the world gets near this

const num = (x: unknown): x is number =>
	typeof x === "number" && Number.isFinite(x) && Math.abs(x) < LIMIT;
const vec = (x: unknown, n: number): boolean =>
	Array.isArray(x) && x.length === n && x.every(num);

/** Check a message from a player. The server trusts nothing else. */
export function parseClient(raw: string): ClientMsg | null {
	if (raw.length > 512) return null;
	let m: Record<string, unknown>;
	try {
		m = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!m || typeof m !== "object") return null;
	if (m.t === "state") {
		const s = m.s as Record<string, unknown> | null;
		if (
			s &&
			vec(s.p, 3) &&
			vec(s.q, 4) &&
			typeof s.type === "string" &&
			s.type.length <= 20 &&
			Number.isInteger(s.f)
		)
			return {
				t: "state",
				s: { p: s.p as Vec, q: s.q as Quat, type: s.type, f: s.f as number },
			};
		return null;
	}
	if (m.t === "shot" && vec(m.p, 3) && vec(m.v, 3))
		return { t: "shot", p: m.p as Vec, v: m.v as Vec };
	if (m.t === "hit" && Number.isInteger(m.by))
		return { t: "hit", by: m.by as number };
	return null;
}

/** Read a message from the server (trusted, but the socket can still send junk). */
export function parseServer(raw: unknown): ServerMsg | null {
	if (typeof raw !== "string") return null;
	try {
		const m = JSON.parse(raw);
		return m && typeof m.t === "string" ? (m as ServerMsg) : null;
	} catch {
		return null;
	}
}
