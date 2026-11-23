import { describe, expect, it } from "vitest";
import { ABILITY, createAbilities } from "./abilities";

const run = (a: ReturnType<typeof createAbilities>, seconds: number) => {
	for (let i = 0; i < seconds * 60; i++) a.step(1 / 60);
};

describe("abilities", () => {
	it("dash runs for a moment, then waits for its cooldown", () => {
		const a = createAbilities();
		expect(a.dash()).toBe(true);
		expect(a.dashing).toBe(true);
		expect(a.dash()).toBe(false); // too soon
		run(a, ABILITY.dashTime + 0.1);
		expect(a.dashing).toBe(false);
		expect(a.dash()).toBe(false); // still cooling down
		run(a, ABILITY.dashCooldown);
		expect(a.dash()).toBe(true);
	});

	it("shield lasts a few seconds and comes back after its cooldown", () => {
		const a = createAbilities();
		expect(a.shielded).toBe(false);
		expect(a.shield()).toBe(true);
		run(a, ABILITY.shieldTime - 0.2);
		expect(a.shielded).toBe(true);
		run(a, 0.4);
		expect(a.shielded).toBe(false);
		expect(a.shield()).toBe(false);
		run(a, ABILITY.shieldCooldown);
		expect(a.shield()).toBe(true);
	});

	it("dash and shield are independent", () => {
		const a = createAbilities();
		a.dash();
		expect(a.shield()).toBe(true);
	});
});
