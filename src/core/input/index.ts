import { config } from "../../config";
import { isTouchDevice, settings } from "../settings";
import { createGamepad } from "./gamepad";
import { createKeyboard } from "./keyboard";
import { createMouse } from "./mouse";
import { createTilt } from "./tilt";
import { createTouchStick } from "./touch";

/** Unified input. pitch > 0 = nose up, roll > 0 = bank right. Both in [-1, 1]. */
export interface InputState {
	pitch: number;
	roll: number;
	boost: boolean;
	/** Throw a paper ball (multiplayer). */
	fire?: boolean;
}

export function createInput(canvas: HTMLElement) {
	const keyboard = createKeyboard();
	const mouse = createMouse(canvas);
	const gamepad = createGamepad();
	const tilt = createTilt();
	const el = (id: string) => document.getElementById(id) as HTMLElement;
	const touch = createTouchStick(
		canvas,
		el("stick-knob"),
		el("stick-base"),
		el("boost-btn"),
	);
	const state: InputState = { pitch: 0, roll: 0, boost: false, fire: false };
	// Touch fire button: held = keep throwing (the cooldown spaces them out).
	let touchFire = false;
	const fireBtn = el("fire-btn");
	fireBtn.addEventListener("pointerdown", () => {
		touchFire = true;
	});
	for (const ev of ["pointerup", "pointercancel", "pointerleave"])
		fireBtn.addEventListener(ev, () => {
			touchFire = false;
		});

	/** Which steering a touch device uses: tilt if allowed, otherwise the stick. */
	const touchMode = () => {
		if (settings.controls === "stick") return "stick";
		if (settings.controls === "tilt" || settings.controls === "auto")
			return tilt.enabled ? "tilt" : "stick";
		return "none";
	};

	// On touch devices, show the boost button; ask for tilt on the first tap (iOS needs a tap).
	const touchUi =
		isTouchDevice() ||
		settings.controls === "stick" ||
		settings.controls === "tilt";
	el("boost-btn").hidden = !touchUi;
	if (touchUi && settings.controls !== "stick") {
		addEventListener("touchend", () => tilt.enable(), { once: true });
	}

	return {
		state,
		/** Show the touch fire button (touch devices, while online). */
		showFire(on: boolean) {
			fireBtn.hidden = !(on && touchUi);
		},
		mouse,
		tilt,
		gamepad,
		/** Call once per fixed step. Keyboard wins, then gamepad, then touch/tilt, then mouse. */
		update(dt: number): InputState {
			mouse.update(dt);
			gamepad.poll();
			const k = keyboard.read();
			const mode = touchMode();
			const t =
				mode === "tilt"
					? tilt
					: mode === "stick" && touch.active
						? touch
						: { pitch: 0, roll: 0 };
			const pick = (kv: number, gv: number, tv: number, mv: number) =>
				kv !== 0 ? kv : gv !== 0 ? gv : tv !== 0 ? tv : mv;
			const s = settings.sensitivity;
			const pitch = Math.max(
				-1,
				Math.min(1, pick(k.pitch, gamepad.pitch, t.pitch, mouse.pitch) * s),
			);
			state.pitch =
				settings.invertPitch !== config.input.invertPitch ? -pitch : pitch;
			state.roll = Math.max(
				-1,
				Math.min(1, pick(k.roll, gamepad.roll, t.roll, mouse.roll) * s),
			);
			state.boost = k.boost || mouse.boost || gamepad.boost || touch.boost;
			state.fire = k.fire || mouse.fire || gamepad.fire || touchFire;
			return state;
		},
	};
}
