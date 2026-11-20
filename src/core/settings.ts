import { storage } from "./storage";

// Player settings, saved in localStorage. The pause menu edits these.

export type Quality = "auto" | "low" | "medium" | "high";
export type Controls = "auto" | "keyboard" | "tilt" | "stick";

export interface Settings {
	quality: Quality;
	controls: Controls; // keyboard = keyboard, mouse and gamepad
	invertPitch: boolean;
	sensitivity: number; // 0.5 .. 2
	audio: boolean;
	volume: number; // 0 .. 1
}

const DEFAULTS: Settings = {
	quality: "auto",
	controls: "auto",
	invertPitch: false,
	sensitivity: 1,
	audio: true,
	volume: 0.7,
};

export const settings: Settings = {
	...DEFAULTS,
	...storage.get<Partial<Settings>>("settings", {}),
};

export function saveSettings() {
	storage.set("settings", settings);
}

export const isTouchDevice = () => matchMedia("(pointer: coarse)").matches;
