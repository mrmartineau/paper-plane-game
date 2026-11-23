// Typed localStorage wrapper. Storage can be missing or full (private windows,
// blocked site data), so every call is guarded and falls back quietly.

import { current, prefixFor } from "./profiles";

// Every key is saved under the active kid's prefix (see profiles.ts).
const PREFIX = prefixFor(current.id);

export const storage = {
	get<T>(key: string, fallback: T): T {
		try {
			const raw = localStorage.getItem(PREFIX + key);
			return raw === null ? fallback : (JSON.parse(raw) as T);
		} catch {
			return fallback;
		}
	},
	set(key: string, value: unknown): boolean {
		try {
			localStorage.setItem(PREFIX + key, JSON.stringify(value));
			return true;
		} catch {
			return false; // full or blocked: the game carries on without saving
		}
	},
};
