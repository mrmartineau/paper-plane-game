import { config } from "../config";
import type { PlaneId } from "../plane/types";
import { storage } from "./storage";

// Player settings, saved in localStorage. The pause menu edits these.

export type Quality = "auto" | "low" | "medium" | "high";
export type Controls = "auto" | "keyboard" | "tilt" | "stick";
export type TimeOfDay = "cycle" | "day" | "night";
export type AnimalChoice = "off" | "crane" | "cheetah" | "dog";

export interface Settings {
	quality: Quality;
	controls: Controls; // keyboard = keyboard, mouse and gamepad
	invertPitch: boolean;
	sensitivity: number; // 0.5 .. 2
	audio: boolean;
	volume: number; // 0 .. 1
	timeOfDay: TimeOfDay;
	unlimitedBoost: boolean;
	boostSeconds: number; // a full tank lasts this long (3 .. 15)
	cameraShake: boolean;
	plane: PlaneId | "random"; // random = a new one every start
	animal: AnimalChoice; // paper animal mode: a crane that flies and runs, or a cheetah / dog that runs
}

const DEFAULTS: Settings = {
	quality: "auto",
	controls: "auto",
	invertPitch: false,
	sensitivity: 1,
	audio: true,
	volume: 0.7,
	timeOfDay: "cycle",
	unlimitedBoost: false,
	boostSeconds: 6,
	cameraShake: true,
	plane: "random",
	animal: "off",
};

const saved = storage.get<Record<string, unknown>>("settings", {});
if (typeof saved.animal === "boolean")
	saved.animal = saved.animal ? "crane" : "off"; // older saves

export const settings: Settings = {
	...DEFAULTS,
	...(saved as Partial<Settings>),
};

const defaultShake = config.boostTrail.shake;

/** Push the gameplay settings into config (boost tank, camera shake). */
export function applySettings() {
	config.flight.boostDrain = settings.unlimitedBoost
		? 0
		: 1 / settings.boostSeconds;
	config.boostTrail.shake = settings.cameraShake ? defaultShake : 0;
}

export function saveSettings() {
	storage.set("settings", settings);
	applySettings();
}

applySettings();

export const isTouchDevice = () => matchMedia("(pointer: coarse)").matches;
