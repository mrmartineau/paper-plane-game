import { describe, expect, it } from "vitest";
import { parseClient } from "./protocol";

describe("protocol", () => {
	it("accepts good player messages", () => {
		const s = { p: [1, 2, 3], q: [0, 0, 0, 1], type: "dart", f: 1 };
		expect(parseClient(JSON.stringify({ t: "state", s }))).toEqual({
			t: "state",
			s,
		});
		expect(parseClient('{"t":"shot","p":[0,0,0],"v":[1,2,3]}')?.t).toBe("shot");
		expect(parseClient('{"t":"hit","by":4}')).toEqual({ t: "hit", by: 4 });
	});

	it("rejects junk", () => {
		for (const raw of [
			"not json",
			"null",
			'{"t":"state","s":{"p":[1,2],"q":[0,0,0,1],"type":"dart","f":0}}',
			'{"t":"state","s":{"p":[1,2,"x"],"q":[0,0,0,1],"type":"dart","f":0}}',
			'{"t":"shot","p":[0,0,0],"v":[1e9,0,0]}',
			'{"t":"hit","by":"me"}',
			'{"t":"welcome"}',
			`{"t":"state","pad":"${"x".repeat(600)}"}`,
		])
			expect(parseClient(raw)).toBeNull();
	});
});

describe("tag messages", () => {
	it("accepts a tag and rejects a bad one", () => {
		expect(parseClient('{"t":"tag","by":2}')).toEqual({ t: "tag", by: 2 });
		expect(parseClient('{"t":"tag","by":"2"}')).toBeNull();
	});
});
