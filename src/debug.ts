import { config } from "./config";

export interface Telemetry {
	airspeed: number;
	altitude: number; // above ground
	sink: number;
	climb: number; // vertical speed
	lift: number; // 0..1, < 1 = stalling
}

/** lil-gui dev panel, loaded only with ?debug. Edits config live. */
export async function createDevPanel(
	telemetry: Telemetry,
	onRespawn: () => void,
) {
	const { default: GUI } = await import("lil-gui");
	const gui = new GUI({ title: "Paper Plane dev" });

	const t = gui.addFolder("Telemetry");
	for (const key of Object.keys(telemetry) as (keyof Telemetry)[]) {
		t.add(telemetry, key).listen().disable().decimals(2);
	}
	gui.add({ respawn: onRespawn }, "respawn");

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
	f.add(fl, "maxPitch", 0.2, 1.5);
	f.add(fl, "maxRoll", 0.2, 1.5);
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

	const i = gui.addFolder("Input").close();
	i.add(config.input, "mouseSensitivity", 0.0005, 0.02);
	i.add(config.input, "mouseRecenter", 0, 6);
	i.add(config.input, "invertPitch");

	const p = gui.addFolder("Plane").close();
	p.add(config.plane, "flutterAmp", 0, 0.2);
	p.add(config.plane, "flutterFreq", 0, 60);

	const s = gui.addFolder("Spawn").close();
	s.add(config.spawn, "altitude", 10, 400);
	s.add(config.spawn, "speed", 5, 50);
}
