// Virtual stick: put a thumb down anywhere on the left two-thirds of the screen and drag.
// Drag down pulls the nose up (like a real stick). A separate button boosts.

export function createTouchStick(
	area: HTMLElement,
	knob: HTMLElement,
	base: HTMLElement,
	boostButton: HTMLElement,
) {
	const s = { pitch: 0, roll: 0, boost: false, active: false };
	const radius = 60; // px for full stick
	let id: number | null = null;
	let ox = 0;
	let oy = 0;

	const show = (on: boolean) => {
		base.hidden = !on;
		knob.hidden = !on;
	};

	area.addEventListener(
		"touchstart",
		(e) => {
			for (const t of e.changedTouches) {
				if (id !== null || t.clientX > innerWidth * 0.66) continue;
				id = t.identifier;
				ox = t.clientX;
				oy = t.clientY;
				s.active = true;
				base.style.translate = `${ox}px ${oy}px`;
				knob.style.translate = `${ox}px ${oy}px`;
				show(true);
			}
		},
		{ passive: true },
	);
	area.addEventListener(
		"touchmove",
		(e) => {
			for (const t of e.changedTouches) {
				if (t.identifier !== id) continue;
				let dx = t.clientX - ox;
				let dy = t.clientY - oy;
				const d = Math.hypot(dx, dy);
				if (d > radius) {
					dx = (dx / d) * radius;
					dy = (dy / d) * radius;
				}
				s.roll = dx / radius;
				s.pitch = dy / radius; // drag down = nose up
				knob.style.translate = `${ox + dx}px ${oy + dy}px`;
			}
		},
		{ passive: true },
	);
	const end = (e: TouchEvent) => {
		for (const t of e.changedTouches) {
			if (t.identifier !== id) continue;
			id = null;
			s.pitch = 0;
			s.roll = 0;
			s.active = false;
			show(false);
		}
	};
	area.addEventListener("touchend", end);
	area.addEventListener("touchcancel", end);

	boostButton.addEventListener("pointerdown", () => {
		s.boost = true;
	});
	for (const ev of ["pointerup", "pointercancel", "pointerleave"]) {
		boostButton.addEventListener(ev, () => {
			s.boost = false;
		});
	}
	return s;
}
