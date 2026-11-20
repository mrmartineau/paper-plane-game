import { config } from "../../config";

// Pointer lock + relative movement drive a virtual stick that drifts back to centre.
// Mouse forward pushes the nose down (same as W). Left button boosts while locked.
export function createMouse(canvas: HTMLElement) {
	const m = { pitch: 0, roll: 0, boost: false, locked: false, update };

	canvas.addEventListener("click", () => {
		if (!m.locked && !document.body.classList.contains("photo"))
			canvas.requestPointerLock();
	});
	document.addEventListener("pointerlockchange", () => {
		m.locked = document.pointerLockElement === canvas;
		if (!m.locked) {
			m.pitch = 0;
			m.roll = 0;
			m.boost = false;
		}
	});
	document.addEventListener("mousemove", (e) => {
		if (!m.locked) return;
		const s = config.input.mouseSensitivity;
		m.roll = clamp1(m.roll + e.movementX * s);
		m.pitch = clamp1(m.pitch + e.movementY * s);
	});
	document.addEventListener("mousedown", (e) => {
		if (m.locked && e.button === 0) m.boost = true;
	});
	document.addEventListener("mouseup", (e) => {
		if (e.button === 0) m.boost = false;
	});

	function update(dt: number) {
		const decay = Math.exp(-config.input.mouseRecenter * dt);
		m.pitch *= decay;
		m.roll *= decay;
	}

	return m;
}

function clamp1(x: number): number {
	return Math.max(-1, Math.min(1, x));
}
