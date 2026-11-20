import type { Best, RunView } from "../courses/run";

// Course line under the compass: progress and timer during a run, a hint near a
// start gate, and a short message when a run ends.

export function createCoursePanel() {
	const el = document.getElementById("course");
	let message = "";
	let messageUntil = 0;

	const set = (text: string) => {
		if (!el) return;
		if (el.textContent !== text) el.textContent = text;
		el.hidden = text === "";
	};

	return {
		/** Show a message for a few seconds (finish, abandon). */
		flash(text: string, time: number) {
			message = text;
			messageUntil = time + 4;
		},
		/** `pointer`: arrow and distance to the next ring, e.g. "↖ 120 m". */
		update(
			run: RunView | null,
			nearGate: Best | null | undefined,
			time: number,
			pointer = "",
		) {
			if (time < messageUntil) return set(message);
			if (run) {
				const delta =
					run.delta === null
						? ""
						: ` · ${run.delta <= 0 ? "−" : "+"}${Math.abs(run.delta).toFixed(1)}s`;
				return set(
					`Ring ${Math.min(run.next + 1, run.total)}/${run.total} ${pointer} · ${clock(run.elapsed)}${delta}`,
				);
			}
			if (nearGate !== undefined) {
				return set(
					nearGate
						? `Start gate · best ${clock(nearGate.time)} (${nearGate.rings} rings)`
						: "Start gate · fly through to start",
				);
			}
			set("");
		},
	};
}

const ARROWS = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];

/** Arrow from your heading (degrees, 0 = north, clockwise) to a target, plus distance. */
export function pointTo(
	fromX: number,
	fromZ: number,
	bearing: number,
	toX: number,
	toZ: number,
): string {
	const dx = toX - fromX;
	const dz = toZ - fromZ;
	const target = (Math.atan2(dx, -dz) * 180) / Math.PI;
	const rel = (((target - bearing) % 360) + 360) % 360;
	return `${ARROWS[Math.round(rel / 45) % 8]} ${Math.round(Math.hypot(dx, dz))} m`;
}

export function clock(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = seconds - m * 60;
	return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}
