import type { Stats } from "./stats";

// Paper-card HUD: a compass tape at the top, flight numbers bottom right.
// Toggle with U. Text updates 10× a second; the compass moves every frame.

export interface HudInfo {
	bearing: number; // degrees, 0 = north (-Z), clockwise
	altitude: number; // metres above ground
	speed: number; // m/s
	climb: number; // m/s
	air: number; // m/s of rising (+) or sinking (-) air
	stalling: boolean;
}

const PX_PER_DEG = 2.4;
const NAMES: Record<number, string> = {
	0: "N",
	45: "NE",
	90: "E",
	135: "SE",
	180: "S",
	225: "SW",
	270: "W",
	315: "NW",
};

export function createHud(stats: Stats) {
	const root = document.getElementById("hud");
	if (!root) throw new Error("#hud missing from index.html");

	// Compass tape: ticks from -180° to 540° so we can scroll without wrapping.
	const tape = root.querySelector<HTMLElement>(".compass-tape");
	if (tape) {
		for (let d = -180; d <= 540; d += 15) {
			const deg = ((d % 360) + 360) % 360;
			const el = document.createElement("span");
			el.className = NAMES[deg] ? "tick major" : "tick";
			el.style.left = `${(d + 180) * PX_PER_DEG}px`;
			el.textContent = NAMES[deg] ?? "";
			tape.append(el);
		}
	}

	const field = (name: string) =>
		root.querySelector<HTMLElement>(`[data-hud="${name}"]`);
	const out = {
		heading: field("heading"),
		altitude: field("altitude"),
		speed: field("speed"),
		vario: field("vario"),
		stall: field("stall"),
		flightTime: field("flightTime"),
		distance: field("distance"),
		liftTime: field("liftTime"),
		loops: field("loops"),
		bestAltitude: field("bestAltitude"),
		topSpeed: field("topSpeed"),
		crashes: field("crashes"),
		hoops: field("hoops"),
	};

	let lastText = -Infinity;
	addEventListener("keydown", (e) => {
		if (e.code === "KeyU") root.hidden = !root.hidden;
	});

	return {
		update(info: HudInfo, time: number) {
			if (root.hidden) return;
			if (tape)
				tape.style.transform = `translateX(${-(info.bearing + 180) * PX_PER_DEG}px)`;
			if (time - lastText < 0.1) return;
			lastText = time;

			set(out.heading, `${Math.round(info.bearing) % 360}°`);
			set(out.altitude, `${Math.round(info.altitude)}`);
			set(out.speed, `${Math.round(info.speed * 3.6)}`);
			const v = info.climb;
			set(
				out.vario,
				`${v >= 0.05 ? "▲" : v <= -0.05 ? "▼" : "•"} ${Math.abs(v).toFixed(1)} m/s`,
			);
			if (out.vario)
				out.vario.dataset.air =
					info.air > 0.5 ? "up" : info.air < -0.5 ? "down" : "";
			if (out.stall) out.stall.hidden = !info.stalling;

			set(out.flightTime, clock(stats.flightTime));
			set(
				out.distance,
				stats.distance < 1000
					? `${Math.round(stats.distance)} m`
					: `${(stats.distance / 1000).toFixed(2)} km`,
			);
			set(out.liftTime, clock(stats.liftTime));
			set(out.loops, `${stats.loops}`);
			set(out.bestAltitude, `${Math.round(stats.bestAltitude)} m`);
			set(out.topSpeed, `${Math.round(stats.topSpeed * 3.6)} km/h`);
			set(out.crashes, `${stats.crashes}`);
			set(out.hoops, `${stats.hoops}`);
		},
	};
}

function set(el: HTMLElement | null, text: string) {
	if (el && el.textContent !== text) el.textContent = text;
}

function clock(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = Math.floor(seconds % 60);
	return `${m}:${String(s).padStart(2, "0")}`;
}
