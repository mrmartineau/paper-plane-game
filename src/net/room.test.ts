import { describe, expect, it } from "vitest";
import { allow, COLOURS, nextId, pickColour, scoreHit } from "./room";

describe("room rules", () => {
	const players = [
		{ id: 1, colour: COLOURS[0], score: 0 },
		{ id: 3, colour: COLOURS[1], score: 2 },
	];

	it("gives a new id and a colour nobody has", () => {
		expect(nextId([])).toBe(1);
		expect(nextId(players)).toBe(4);
		expect(pickColour(players.map((p) => p.colour))).toBe(COLOURS[2]);
	});

	it("scores the shooter, never yourself or a stranger", () => {
		expect(scoreHit(players, 1, 3)).toEqual({ ...players[1], score: 3 });
		expect(scoreHit(players, 3, 3)).toBeNull();
		expect(scoreHit(players, 1, 99)).toBeNull();
	});

	it("rate gate drops messages that come too fast", () => {
		const last = new Map<string, number>();
		expect(allow(last, "a", 0, 40)).toBe(true);
		expect(allow(last, "a", 20, 40)).toBe(false);
		expect(allow(last, "a", 45, 40)).toBe(true);
	});
});
