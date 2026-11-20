import { config } from "./config";
import type { Course } from "./courses/generate";
import { createFlightState, type FlightState, type Vec3 } from "./plane/flight";
import { type Bird, birdPose } from "./world/birds";
import { type Features, SHAPES } from "./world/props";
import type { AirColumn } from "./world/thermals";

export interface Telemetry {
	airspeed: number;
	altitude: number; // above ground
	sink: number;
	climb: number; // vertical speed
	air: number; // rising (+) or sinking (-) air here
	lift: number; // 0..1, < 1 = stalling
}

/** lil-gui dev panel, loaded only with ?debug. Edits config live. */
export async function createDevPanel(
	telemetry: Telemetry,
	actions: Record<string, () => void>,
) {
	const { default: GUI } = await import("lil-gui");
	const gui = new GUI({ title: "Paper Plane dev" });

	const t = gui.addFolder("Telemetry");
	for (const key of Object.keys(telemetry) as (keyof Telemetry)[]) {
		t.add(telemetry, key).listen().disable().decimals(2);
	}
	for (const name of Object.keys(actions)) gui.add(actions, name);

	const f = gui.addFolder("Flight");
	const fl = config.flight;
	f.add(fl, "gravity", 0, 20);
	f.add(fl, "liftCoeff", 0, 0.3);
	f.add(fl, "maxLift", 0, 40);
	f.add(fl, "drag", 0, 0.02);
	f.add(fl, "stallSpeed", 0, 30);
	f.add(fl, "stallNoseDrop", 0, 3);
	f.add(fl, "maxSink", 0, 60);
	f.add(fl, "glidePitch", -0.6, 0.3);
	f.add(fl, "pitchStability", 0, 3);
	f.add(fl, "pitchRate", 0, 4);
	f.add(fl, "rollRate", 0, 6);
	f.add(fl, "autoLevel", 0, 6);
	f.add(fl, "inputSmoothing", 0.5, 20);
	f.add(fl, "turnCoeff", 0, 0.2);
	f.add(fl, "boost", 0, 20);
	f.add(fl, "maxSpeed", 10, 120);

	const c = gui.addFolder("Camera").close();
	c.add(config.camera, "distance", 2, 30);
	c.add(config.camera, "height", 0, 10);
	c.add(config.camera, "lookAhead", 0, 30);
	c.add(config.camera, "positionLerp", 0.5, 20);
	c.add(config.camera, "rotationLerp", 0.5, 20);
	c.add(config.camera, "fovMin", 30, 100);
	c.add(config.camera, "fovMax", 30, 110);
	c.add(config.camera, "upLerp", 0, 10);

	const i = gui.addFolder("Input").close();
	i.add(config.input, "mouseSensitivity", 0.0005, 0.02);
	i.add(config.input, "mouseRecenter", 0, 6);
	i.add(config.input, "invertPitch");

	const p = gui.addFolder("Plane").close();
	p.add(config.plane, "flutterAmp", 0, 0.2);
	p.add(config.plane, "flutterFreq", 0, 60);
	p.add(config.plane, "scale", 0.5, 3);

	const s = gui.addFolder("Spawn").close();
	s.add(config.spawn, "altitude", 10, 400);
	s.add(config.spawn, "speed", 5, 50);
}

/**
 * Dev "go to" jumps: put the plane in front of the nearest thing of a kind, lined up with it.
 * `place` receives the new flight state.
 */
export function createDevJumps(ctx: {
	position: () => Vec3;
	time: () => number;
	place: (s: FlightState) => void;
	features: Features;
	birdsNear: (x: number, z: number, range: number) => Bird[];
	columnsNear: (x: number, z: number, range: number) => AirColumn[];
	coursesNear: (x: number, z: number, range: number) => Course[];
	groundAt: (x: number, z: number) => number;
}) {
	const range = 3000;
	const nearest = <T extends { x: number; z: number }>(
		items: T[],
	): T | undefined => {
		const { x, z } = ctx.position();
		const d = (t: T) => (t.x - x) ** 2 + (t.z - z) ** 2;
		return [...items].sort((u, v) => d(u) - d(v))[0];
	};
	const around = () =>
		ctx.features.near(ctx.position().x, ctx.position().z, range);
	/** Line up `back` metres in front of a hole, a little high (the plane glides down on the way). */
	const lineUp = (
		x: number,
		holeY: number,
		z: number,
		yaw: number,
		back: number,
	) => {
		const glideDrop = back * -Math.tan(config.flight.glidePitch);
		ctx.place(
			createFlightState(
				{
					x: x + Math.sin(yaw) * back,
					y: holeY + glideDrop,
					z: z + Math.cos(yaw) * back,
				},
				yaw,
				config.spawn.speed,
			),
		);
	};

	return {
		"go to updraft"() {
			const { x, z } = ctx.position();
			const col = nearest(
				ctx.columnsNear(x, z, range).filter((c) => c.strength > 0),
			);
			if (!col) return;
			const sz = col.z + col.radius + 50;
			const y = Math.max(col.base + 60, ctx.groundAt(col.x, sz) + 30);
			ctx.place(
				createFlightState({ x: col.x, y, z: sz }, 0, config.spawn.speed),
			);
		},
		"go to arch"() {
			const a = nearest(around().arches);
			if (!a) return;
			const { R, r } = SHAPES.arch;
			lineUp(
				a.x,
				a.kind === "ring" ? a.y : a.y + ((R - r) / 2) * a.s,
				a.z,
				a.yaw,
				120,
			);
		},
		"go to hoop"() {
			const h = nearest(around().hoops);
			if (h) lineUp(h.x, h.y, h.z, h.yaw, config.props.hoopLane - 10);
		},
		"go to birds"() {
			const { x, z } = ctx.position();
			const b = nearest(
				ctx
					.birdsNear(x, z, range)
					.map((bird) => ({ ...bird, x: bird.cx, z: bird.cz })),
			);
			if (!b) return;
			const pose = birdPose(b, ctx.time(), {
				x: 0,
				y: 0,
				z: 0,
				yaw: 0,
				bank: 0,
			});
			const ox = pose.x - b.cx;
			const oz = pose.z - b.cz;
			const k = (b.radius + 60) / Math.hypot(ox, oz);
			// Park 60m outside the circle, level with the bird, facing in.
			ctx.place(
				createFlightState(
					{ x: b.cx + ox * k, y: pose.y + 3, z: b.cz + oz * k },
					Math.atan2(ox, oz),
					config.spawn.speed,
				),
			);
		},
		"go to floating mountain"() {
			const f = nearest(around().floaters);
			if (!f) return;
			const side = f.R + 30; // aim beside it, not into it
			lineUp(
				f.x + Math.cos(f.yaw) * side,
				f.y - f.H * 0.3,
				f.z - Math.sin(f.yaw) * side,
				f.yaw,
				200,
			);
		},
		"go to course"() {
			const { x, z } = ctx.position();
			const c = nearest(
				ctx.coursesNear(x, z, range).map((course) => ({
					...course.gate,
					x: course.gate.x,
					z: course.gate.z,
				})),
			);
			if (c) lineUp(c.x, c.y, c.z, c.yaw, 120);
		},
		"go to city gate"() {
			const g = nearest(around().cities.flatMap((c) => c.gates));
			if (g) lineUp(g.x, g.y, g.z, g.yaw, 160);
		},
		"go to waterfall"() {
			const w = nearest(around().waterfalls);
			if (w) lineUp(w.x, w.y - w.length * 0.4, w.z, w.yaw, 120);
		},
	};
}
