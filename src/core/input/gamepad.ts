import { config } from "../../config";

// Gamepad: left stick steers (push forward = nose down), A or right trigger boosts, X or RB fires, B dashes, Y shields,
// Start pauses. Polled once per step.

export function createGamepad() {
	const g = {
		pitch: 0,
		roll: 0,
		boost: false,
		fire: false,
		dash: false,
		shield: false,
		start: false,
		connected: false,
	};
	let startWasDown = false;

	return Object.assign(g, {
		poll() {
			const pad = [...(navigator.getGamepads?.() ?? [])].find(
				(p) => p?.connected,
			);
			g.connected = !!pad;
			if (!pad) {
				g.pitch = 0;
				g.roll = 0;
				g.boost = false;
				g.fire = false;
				g.dash = false;
				g.shield = false;
				g.start = false;
				return;
			}
			const dead = (v: number) =>
				Math.abs(v) < config.input.gamepadDeadzone ? 0 : v;
			g.roll = dead(pad.axes[0] ?? 0);
			g.pitch = dead(pad.axes[1] ?? 0); // forward is negative = nose down
			g.boost = !!(pad.buttons[0]?.pressed || pad.buttons[7]?.pressed);
			g.fire = !!(pad.buttons[2]?.pressed || pad.buttons[5]?.pressed); // X or right bumper
			g.dash = !!pad.buttons[1]?.pressed; // B
			g.shield = !!pad.buttons[3]?.pressed; // Y
			const startDown = !!pad.buttons[9]?.pressed;
			g.start = startDown && !startWasDown; // one press, not held
			startWasDown = startDown;
		},
	});
}
