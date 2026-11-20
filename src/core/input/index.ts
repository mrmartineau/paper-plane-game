import { config } from "../../config";
import { createKeyboard } from "./keyboard";
import { createMouse } from "./mouse";

/** Unified input. pitch > 0 = nose up, roll > 0 = bank right. Both in [-1, 1]. */
export interface InputState {
	pitch: number;
	roll: number;
	boost: boolean;
}

export function createInput(canvas: HTMLElement) {
	const keyboard = createKeyboard();
	const mouse = createMouse(canvas);
	const state: InputState = { pitch: 0, roll: 0, boost: false };

	return {
		state,
		mouse,
		/** Call once per fixed step. Keyboard wins when a key is held. */
		update(dt: number): InputState {
			mouse.update(dt);
			const k = keyboard.read();
			const pitch = k.pitch !== 0 ? k.pitch : mouse.pitch;
			state.pitch = config.input.invertPitch ? -pitch : pitch;
			state.roll = k.roll !== 0 ? k.roll : mouse.roll;
			state.boost = k.boost || mouse.boost;
			return state;
		},
	};
}
