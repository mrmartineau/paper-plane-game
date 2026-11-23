// Two short abilities with cooldowns. Pure, no Three.js.
// Dash: a burst of rocket speed (no fuel used) to dodge paper balls or catch up.
// Shield: a paper bubble that blocks paper balls (and tags) for a few seconds.

export const ABILITY = {
	dashTime: 0.5, // s of burst
	dashCooldown: 5, // s from the press until the next dash
	dashSpeed: 80, // m/s the plane is kicked up to (boost top speed is 95)
	shieldTime: 3, // s the bubble lasts
	shieldCooldown: 12, // s from the press until the next shield
};

export function createAbilities() {
	let dashLeft = 0;
	let dashWait = 0;
	let shieldLeft = 0;
	let shieldWait = 0;
	return {
		/** Move the timers on. */
		step(dt: number) {
			dashLeft = Math.max(0, dashLeft - dt);
			dashWait = Math.max(0, dashWait - dt);
			shieldLeft = Math.max(0, shieldLeft - dt);
			shieldWait = Math.max(0, shieldWait - dt);
		},
		/** Start a dash. False while one is running or cooling down. */
		dash(): boolean {
			if (dashWait > 0) return false;
			dashLeft = ABILITY.dashTime;
			dashWait = ABILITY.dashCooldown;
			return true;
		},
		shield(): boolean {
			if (shieldWait > 0) return false;
			shieldLeft = ABILITY.shieldTime;
			shieldWait = ABILITY.shieldCooldown;
			return true;
		},
		get dashing() {
			return dashLeft > 0;
		},
		get shielded() {
			return shieldLeft > 0;
		},
		get shieldLeft() {
			return shieldLeft;
		},
		/** Seconds until the next dash / shield (0 = ready). */
		get dashWait() {
			return dashWait;
		},
		get shieldWait() {
			return shieldWait;
		},
	};
}
