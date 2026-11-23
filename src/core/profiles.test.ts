import { describe, expect, it } from "vitest";
import {
	AVATARS,
	activeProfile,
	addProfile,
	listProfiles,
	MAX_PROFILES,
	prefixFor,
	removeProfile,
	type Store,
	setActive,
} from "./profiles";

function fake(): Store & { keys: () => string[] } {
	const m = new Map<string, string>();
	return {
		getItem: (k) => m.get(k) ?? null,
		setItem: (k, v) => void m.set(k, v),
		removeItem: (k) => void m.delete(k),
		key: (i) => [...m.keys()][i] ?? null,
		get length() {
			return m.size;
		},
		keys: () => [...m.keys()],
	};
}

describe("kid profiles", () => {
	it("starts with one profile, and old saves belong to it", () => {
		const s = fake();
		expect(listProfiles(s)).toEqual([{ id: "1", avatar: AVATARS[0] }]);
		expect(prefixFor("1")).toBe("paper-plane:");
		expect(prefixFor("3")).toBe("paper-plane:p3:");
	});

	it("adds kids with different pictures, up to a limit", () => {
		const s = fake();
		const a = addProfile(s);
		expect(a?.id).toBe("2");
		expect(a?.avatar).not.toBe(AVATARS[0]);
		for (let i = 0; i < 20; i++) addProfile(s);
		expect(listProfiles(s)).toHaveLength(MAX_PROFILES);
		expect(addProfile(s)).toBeNull();
	});

	it("remembers who is active, falling back to the first", () => {
		const s = fake();
		addProfile(s);
		setActive(s, "2");
		expect(activeProfile(s).id).toBe("2");
		setActive(s, "99");
		expect(activeProfile(s).id).toBe("1");
	});

	it("removing a kid deletes only their data", () => {
		const s = fake();
		addProfile(s);
		addProfile(s);
		s.setItem("paper-plane:settings", "{}"); // kid 1
		s.setItem("paper-plane:best:abc:1", "1"); // kid 1
		s.setItem("paper-plane:p2:settings", "{}"); // kid 2
		s.setItem("paper-plane:p3:settings", "{}"); // kid 3
		setActive(s, "2");
		expect(removeProfile(s, "2")).toBe(true);
		expect(s.keys()).not.toContain("paper-plane:p2:settings");
		expect(s.keys()).toContain("paper-plane:p3:settings");
		expect(s.keys()).toContain("paper-plane:settings");
		expect(activeProfile(s).id).toBe("1"); // moved off the removed kid
		// Removing kid 1 must not touch the others' keys, even though they share "paper-plane:".
		expect(removeProfile(s, "1")).toBe(true);
		expect(s.keys()).toContain("paper-plane:p3:settings");
		expect(s.keys()).not.toContain("paper-plane:settings");
	});

	it("never removes the last profile", () => {
		expect(removeProfile(fake(), "1")).toBe(false);
	});
});
