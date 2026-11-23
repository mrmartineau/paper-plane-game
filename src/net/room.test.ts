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

describe("tag game", () => {
	const p = (id: number, it = false, score = 0) => ({
		id,
		colour: "#fff",
		score,
		it,
	});

	it("needs two players, keeps the current one, else picks one", async () => {
		const { chooseIt } = await import("./room");
		expect(chooseIt([p(1)])).toBeNull();
		expect(chooseIt([p(1), p(2, true)])).toBe(2);
		expect(chooseIt([p(1), p(2), p(3)], () => 0.99)).toBe(3);
	});

	it("passes only from the player who is it, and scores the tagger", async () => {
		const { passTag } = await import("./room");
		const players = [p(1, true, 2), p(2)];
		const r = passTag(players, 1, 2);
		expect(r?.tagger).toMatchObject({ id: 1, it: false, score: 3 });
		expect(r?.tagged).toMatchObject({ id: 2, it: true });
		expect(passTag(players, 2, 1)).toBeNull(); // 2 is not it
		expect(passTag(players, 1, 1)).toBeNull();
		expect(passTag(players, 1, 9)).toBeNull();
	});
});
