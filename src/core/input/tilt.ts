import { config } from "../../config";

// Tilt steering from DeviceOrientation. On iOS the page must ask permission from a tap.
// "Neutral" is however the phone is held when tilt starts (or when you recalibrate).
// In landscape the phone's axes swap, so we map them by screen orientation.

type PermissionAPI = {
	requestPermission?: () => Promise<"granted" | "denied">;
};

export function createTilt() {
	const t = {
		pitch: 0,
		roll: 0,
		enabled: false,
		available: "DeviceOrientationEvent" in window,
	};
	let raw = { pitch: 0, roll: 0 };
	let neutral: { pitch: number; roll: number } | null = null;

	const onOrientation = (e: DeviceOrientationEvent) => {
		if (e.beta === null || e.gamma === null) return;
		const angle = screen.orientation?.angle ?? 0;
		// Portrait: gamma = left/right, beta = toward/away. Landscape swaps them.
		if (angle === 90) raw = { roll: e.beta, pitch: -e.gamma };
		else if (angle === 270 || angle === -90)
			raw = { roll: -e.beta, pitch: e.gamma };
		else raw = { roll: e.gamma, pitch: e.beta };
		neutral ??= { ...raw };
		const max = config.input.tiltRange;
		t.roll = Math.max(-1, Math.min(1, (raw.roll - neutral.roll) / max));
		t.pitch = Math.max(-1, Math.min(1, (raw.pitch - neutral.pitch) / max)); // tip the top toward you = nose up
	};

	return Object.assign(t, {
		/** Must be called from a tap on iOS. Resolves false if tilt isn't allowed. */
		async enable(): Promise<boolean> {
			const api = (
				window as unknown as { DeviceOrientationEvent?: PermissionAPI }
			).DeviceOrientationEvent;
			if (!t.available) return false;
			try {
				if (
					api?.requestPermission &&
					(await api.requestPermission()) !== "granted"
				)
					return false;
			} catch {
				return false;
			}
			if (!t.enabled) addEventListener("deviceorientation", onOrientation);
			t.enabled = true;
			neutral = null;
			return true;
		},
		disable() {
			removeEventListener("deviceorientation", onOrientation);
			t.enabled = false;
			t.pitch = 0;
			t.roll = 0;
		},
		/** Make the current hold the new "level". */
		recalibrate() {
			neutral = { ...raw };
		},
	});
}
