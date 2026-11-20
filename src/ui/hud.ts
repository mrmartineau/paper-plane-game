import type { Stats } from "./stats";

// Cockpit-style HUD: an SVG overlay in the middle of the screen with an artificial
// horizon + pitch ladder, a roll scale, speed and height tapes, a climb bar and
// warnings; a compass tape at the top; a small stats card. Toggle with U.
// Shapes move every frame; numbers update 10× a second.

export interface HudInfo {
	bearing: number; // degrees, 0 = north (-Z), clockwise
	altitude: number; // metres above ground
	speed: number; // m/s
	climb: number; // m/s
	air: number; // m/s of rising (+) or sinking (-) air
	stalling: boolean;
	boosting: boolean;
	pitch: number; // degrees, nose up > 0
	roll: number; // degrees, right wing down > 0
	wind: { x: number; z: number }; // m/s, world space
}

const PX_PER_DEG = 2.4; // compass tape
const LADDER_PX = 4; // pitch ladder, px per degree
const SPEED_PX = 2; // px per km/h
const ALT_PX = 1.5; // px per metre
const CX = 280;
const CY = 170;
const ARROWS = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];
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

/** The static SVG: everything that moves sits in a group we transform. */
function svgMarkup(): string {
	const ladder: string[] = [];
	for (let p = -90; p <= 90; p += 10) {
		const y = -p * LADDER_PX;
		if (p === 0) {
			ladder.push(`<path class="line" d="M-170 0 H-34 M34 0 H170"/>`);
			continue;
		}
		const tip = p > 0 ? 6 : -6;
		const dash = p < 0 ? ' stroke-dasharray="6 4"' : "";
		ladder.push(
			`<path class="thin"${dash} d="M-62 ${y + tip} V${y} H-26 M26 ${y} H62 V${y + tip}"/>`,
			`<text x="-70" y="${y + 4}" text-anchor="end">${Math.abs(p)}</text>`,
			`<text x="70" y="${y + 4}">${Math.abs(p)}</text>`,
		);
	}

	const rollTicks = [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]
		.map((a) => {
			const len = a % 30 === 0 ? 10 : 6;
			return `<path class="thin" d="M0 -118 V${-118 + len}" transform="rotate(${a})"/>`;
		})
		.join("");

	const speedTicks: string[] = [];
	for (let v = 0; v <= 400; v += 10) {
		const y = -v * SPEED_PX;
		const major = v % 20 === 0;
		speedTicks.push(`<path class="thin" d="M${major ? 62 : 68} ${y} H76"/>`);
		if (major)
			speedTicks.push(
				`<text x="56" y="${y + 4}" text-anchor="end">${v}</text>`,
			);
	}

	const altTicks: string[] = [];
	for (let a = -50; a <= 1500; a += 10) {
		const y = -a * ALT_PX;
		const major = a % 50 === 0;
		altTicks.push(`<path class="thin" d="M484 ${y} H${major ? 498 : 492}"/>`);
		if (major) altTicks.push(`<text x="504" y="${y + 4}">${a}</text>`);
	}

	return `
	<defs>
		<clipPath id="hud-attitude"><rect x="${CX - 175}" y="${CY - 90}" width="350" height="170" rx="16"/></clipPath>
		<clipPath id="hud-tapes"><rect x="0" y="${CY - 100}" width="560" height="200"/></clipPath>
	</defs>
	<g clip-path="url(#hud-attitude)">
		<g data-el="ladder">${ladder.join("")}</g>
	</g>
	<g transform="translate(${CX} ${CY})">
		<path class="thin" d="M-59 -102 A118 118 0 0 1 59 -102" opacity="0.6"/>
		${rollTicks}
		<path data-el="roll-pointer" class="line" d="M0 -106 l-6 10 h12 z"/>
		<path class="line" stroke-width="2.4" d="M-46 0 H-16 L-8 9 L0 0 L8 9 L16 0 H46"/>
		<circle class="line" r="2.5"/>
	</g>
	<g clip-path="url(#hud-tapes)">
		<g data-el="speed-tape">${speedTicks.join("")}</g>
		<g data-el="alt-tape">${altTicks.join("")}</g>
	</g>
	<path class="thin" d="M76 ${CY - 100} V${CY + 100} M484 ${CY - 100} V${CY + 100}" opacity="0.5"/>
	<text class="label" x="44" y="${CY - 108}" text-anchor="middle">SPD km/h</text>
	<rect class="box" x="10" y="${CY - 13}" width="70" height="26" rx="4"/>
	<text class="big" data-el="speed" x="72" y="${CY + 6}" text-anchor="end">0</text>
	<text class="label" x="516" y="${CY - 108}" text-anchor="middle">ALT m</text>
	<rect class="box" x="480" y="${CY - 13}" width="70" height="26" rx="4"/>
	<text class="big" data-el="alt" x="542" y="${CY + 6}" text-anchor="end">0</text>
	<rect data-el="vario" x="554" y="${CY}" width="5" height="0"/>
	<text data-el="climb" x="516" y="${CY + 118}" text-anchor="middle">0.0</text>
	<g data-el="stall" visibility="hidden">
		<rect class="alert" x="${CX - 40}" y="${CY - 152}" width="80" height="24" rx="4" data-blink/>
		<text x="${CX}" y="${CY - 135}" text-anchor="middle" class="big">STALL</text>
	</g>
	<text data-el="boost" class="warn label" x="44" y="${CY + 118}" text-anchor="middle" visibility="hidden">BOOST</text>`;
}

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

	const svg = root.querySelector<SVGSVGElement>("#flight-hud");
	if (svg) svg.innerHTML = svgMarkup();
	const part = <T extends Element>(name: string) =>
		svg?.querySelector<T>(`[data-el="${name}"]`) ?? null;
	const g = {
		ladder: part<SVGGElement>("ladder"),
		rollPointer: part<SVGPathElement>("roll-pointer"),
		speedTape: part<SVGGElement>("speed-tape"),
		altTape: part<SVGGElement>("alt-tape"),
		speed: part<SVGTextElement>("speed"),
		alt: part<SVGTextElement>("alt"),
		vario: part<SVGRectElement>("vario"),
		climb: part<SVGTextElement>("climb"),
		stall: part<SVGGElement>("stall"),
		boost: part<SVGTextElement>("boost"),
	};

	const field = (name: string) =>
		root.querySelector<HTMLElement>(`[data-hud="${name}"]`);
	const out = {
		heading: field("heading"),
		flightTime: field("flightTime"),
		distance: field("distance"),
		liftTime: field("liftTime"),
		loops: field("loops"),
		bestAltitude: field("bestAltitude"),
		topSpeed: field("topSpeed"),
		crashes: field("crashes"),
		hoops: field("hoops"),
		wind: field("wind"),
	};

	let lastText = -Infinity;
	addEventListener("keydown", (e) => {
		if ((e.target as HTMLElement).closest?.("input, select, textarea")) return; // typing, not a shortcut
		if (e.code === "KeyU") root.hidden = !root.hidden;
	});

	return {
		update(info: HudInfo, time: number) {
			if (root.hidden) return;
			if (tape)
				tape.style.transform = `translateX(${-(info.bearing + 180) * PX_PER_DEG}px)`;

			// Every frame: horizon, roll pointer, tapes, climb bar, warnings.
			const kmh = info.speed * 3.6;
			g.ladder?.setAttribute(
				"transform",
				`translate(${CX} ${CY}) rotate(${-info.roll}) translate(0 ${info.pitch * LADDER_PX})`,
			);
			g.rollPointer?.setAttribute("transform", `rotate(${-info.roll})`);
			g.speedTape?.setAttribute(
				"transform",
				`translate(0 ${CY + kmh * SPEED_PX})`,
			);
			g.altTape?.setAttribute(
				"transform",
				`translate(0 ${CY + info.altitude * ALT_PX})`,
			);
			if (g.vario) {
				const h = Math.max(-95, Math.min(95, info.climb * 9));
				g.vario.setAttribute("y", String(h > 0 ? CY - h : CY));
				g.vario.setAttribute("height", String(Math.abs(h)));
				g.vario.setAttribute(
					"class",
					info.air > 0.5 ? "lift" : info.air < -0.5 ? "sink" : "line",
				);
			}
			g.stall?.setAttribute("visibility", info.stalling ? "visible" : "hidden");
			g.boost?.setAttribute("visibility", info.boosting ? "visible" : "hidden");

			if (time - lastText < 0.1) return;
			lastText = time;
			setText(g.speed, `${Math.round(kmh)}`);
			setText(g.alt, `${Math.round(info.altitude)}`);
			const v = info.climb;
			setText(
				g.climb,
				`${v >= 0.05 ? "▲" : v <= -0.05 ? "▼" : "•"} ${Math.abs(v).toFixed(1)}`,
			);

			set(out.heading, `${Math.round(info.bearing) % 360}°`);
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
			// Arrow: where the wind blows, relative to where you're heading.
			const windBearing =
				(Math.atan2(info.wind.x, -info.wind.z) * 180) / Math.PI;
			const rel = (((windBearing - info.bearing) % 360) + 360) % 360;
			set(
				out.wind,
				`${ARROWS[Math.round(rel / 45) % 8]} ${Math.hypot(info.wind.x, info.wind.z).toFixed(1)} m/s`,
			);
		},
	};
}

function set(el: HTMLElement | null, text: string) {
	if (el && el.textContent !== text) el.textContent = text;
}

function setText(el: SVGTextElement | null, text: string) {
	if (el && el.textContent !== text) el.textContent = text;
}

function clock(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = Math.floor(seconds % 60);
	return `${m}:${String(s).padStart(2, "0")}`;
}
