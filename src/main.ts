import * as THREE from "three";
import { createSound } from "./audio/sound";
import { createBench } from "./bench";
import { createChaseCam } from "./camera/chaseCam";
import { config } from "./config";
import { createInput } from "./core/input";
import { startLoop } from "./core/loop";
import {
	type AnimalChoice,
	applySettings,
	isTouchDevice,
	saveSettings,
	settings,
} from "./core/settings";
import { storage } from "./core/storage";
import { type Course, createCourses } from "./courses/generate";
import { decodeGhost, encodeGhost } from "./courses/ghost";
import { passedThrough } from "./courses/rings";
import { type Best, createRun } from "./courses/run";
import { createDevJumps, createDevPanel, type Telemetry } from "./debug";
import { createMultiplayer } from "./net/multiplayer";
import { BOOST, CRASHED, type Quat, RUNNING } from "./net/protocol";
import { createCrash, respawnAt } from "./plane/crash";
import {
	axes,
	type FlightEnv,
	type FlightState,
	heading,
	liftFraction,
	stepFlight,
} from "./plane/flight";
import {
	assist,
	land,
	type Parked,
	slide,
	takeOff,
	touchdownOk,
} from "./plane/landing";
import { createPlaneModel } from "./plane/model";
import {
	landRun,
	type RunEnv,
	runTakeOff,
	stepRun,
	stepSkate,
} from "./plane/run";
import { PLANES, type PlaneId, randomPlane } from "./plane/types";
import { createAirColumns } from "./render/airColumns";
import { createBirdMeshes } from "./render/birdMeshes";
import { createBoostTrail } from "./render/boostTrail";
import { createClouds } from "./render/clouds";
import { createCourseMeshes } from "./render/courseMeshes";
import { createHoopMeshes } from "./render/hoopMeshes";
import { createLighting } from "./render/lighting";
import { createQuality } from "./render/quality";
import { createSky } from "./render/sky";
import { createVineMeshes } from "./render/vines";
import { createWater } from "./render/water";
import { createWorldMeshes } from "./render/world";
import { clock, createCoursePanel, pointTo } from "./ui/coursePanel";
import { setupHelp } from "./ui/help";
import { createHud } from "./ui/hud";
import { createMenu } from "./ui/menu";
import { createPhotoMode } from "./ui/photoMode";
import { createRadar } from "./ui/radar";
import { createStats } from "./ui/stats";
import { blend } from "./world/biomes";
import { createBirdField } from "./world/birds";
import { type Cloud, createCloudField } from "./world/clouds";
import { createClimate, createHeight } from "./world/height";
import { createFeatures, type Hoop, type Pad, type Vine } from "./world/props";
import { createAir } from "./world/thermals";
import { createWind } from "./world/wind";

const params = new URLSearchParams(location.search);
const seed = params.get("seed") ?? config.world.seed;

// --- Renderer, scene, lights ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoft was removed in r18x; this is its replacement
document.body.prepend(renderer.domElement);

const r = config.render;
const scene = new THREE.Scene();
scene.background = new THREE.Color(r.skyColor);
scene.fog = new THREE.Fog(r.skyColor, r.fogNear, r.fogFar);
const ambient = new THREE.HemisphereLight(
	0xffffff,
	0xb8a98c,
	r.ambientIntensity,
);
scene.add(ambient);

const sun = new THREE.DirectionalLight(r.sunColor, r.sunIntensity);
const sunOffset = new THREE.Vector3(80, 140, 40); // replaced each frame by the day/night cycle
const lighting = createLighting();
sun.castShadow = true;
sun.shadow.mapSize.set(r.shadowMapSize, r.shadowMapSize);
Object.assign(sun.shadow.camera, {
	left: -r.shadowExtent,
	right: r.shadowExtent,
	top: r.shadowExtent,
	bottom: -r.shadowExtent,
	near: 1,
	far: 600,
});
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);

// Quality tier first: it sets view distance, fog, shadows and prop density for everything below.
const quality = createQuality(renderer, sun, scene);
quality.set(settings.quality);

const camera = new THREE.PerspectiveCamera(
	config.camera.fovMin,
	innerWidth / innerHeight,
	config.camera.near,
	config.camera.far,
);

addEventListener("resize", () => {
	camera.aspect = innerWidth / innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(innerWidth, innerHeight);
});

// --- World: pure generators, streamed meshes ---
let time = 0; // seconds since start; birds move with it
let airHere = 0; // vertical air speed at the plane
const height = createHeight(seed, config.world);
const climate = createClimate(seed, config.world);
const groundAt = (x: number, z: number) =>
	Math.max(height(x, z), config.world.seaLevel);
const features = createFeatures(
	seed,
	height,
	climate,
	config.props,
	config.world,
);
const air = createAir(seed, groundAt, config.air, (x, z) =>
	Math.min(
		1,
		blend(features.biomeAt(x, z), (b) => b.thermals),
	),
);
const birdField = createBirdField(
	seed,
	groundAt,
	air.columnsNear,
	config.birds,
);
const wind = createWind(seed, config.wind, groundAt);
/** Rising/sinking air: thermals plus ridge lift where the wind blows up a slope. */
const airAt = (x: number, y: number, z: number) =>
	air.airAt(x, y, z) + wind.ridge(time, x, y, z);
const env: FlightEnv = {
	groundAt,
	airAt,
	windAt: (x, y, z) => wind.atPoint(time, x, y, z),
	solidAt: (x, y, z) =>
		features.solidAt(x, y, z) ||
		birdField.hit(x, y, z, time, config.birds.hitRadius),
};

const world = createWorldMeshes(scene, seed, features, height, climate);
const sky = createSky(scene);
const water = createWater(scene);
const hoopMeshes = createHoopMeshes(scene);
const vineMeshes = createVineMeshes(scene);
const birdMeshes = createBirdMeshes(scene);
const airColumns = createAirColumns(scene, air.columnsNear);
const boostTrail = createBoostTrail(scene);
const cloudField = createCloudField(seed, config.clouds);
const clouds = createClouds(scene);
let nearbyClouds: Cloud[] = [];

// --- Plane ---
// Plane type: random each start (unless one is picked in the menu). Each has its own handling.
const baseFlight = { ...config.flight };
let flyPlane: PlaneId =
	settings.plane === "random" ? randomPlane() : settings.plane;
/** Which model is in use: the paper crane in animal mode, otherwise the chosen plane. */
const currentId = (): PlaneId =>
	settings.animal === "off" ? flyPlane : settings.animal;
const isWalker = () => PLANES[currentId()].walker === true; // a land animal: never flies
let planeId: PlaneId = currentId();
const plane = createPlaneModel(planeId);
function usePlane(id: PlaneId) {
	planeId = id;
	Object.assign(config.flight, baseFlight, PLANES[id].flight);
	applySettings(); // boost tank settings sit on top of the plane's numbers
	plane.setType(id);
	courseMeshes.setGhostGeometry(plane.mesh.geometry);
	tracker.stats.plane = PLANES[id].name;
}
scene.add(plane.mesh);
const input = createInput(renderer.domElement);
const crash = createCrash(scene, groundAt, env.solidAt);
// Multiplayer: everyone on this seed shares a room. A paper ball that hits you crumples you.
const mp = createMultiplayer(
	scene,
	seed,
	{ groundAt, solidAt: features.solidAt },
	{
		onHit: () => {
			if (crash.phase !== "flying") return;
			running = false;
			parked = null;
			crash.start(state);
			tracker.crash();
			sound.crumple();
			coursePanel.flash("Hit by a paper ball!", time);
		},
		onFirstPeer: (peer) => place(spawnBeside(peer.p[0], peer.p[2], peer.q)),
		onScore: (_id, mine) => {
			if (!mine) return;
			sound.chime(1.2);
			coursePanel.flash("You hit a plane!", time);
		},
	},
);
/** A fresh flight state a short way from another player, flying the same way. */
function spawnBeside(x: number, z: number, q: Quat): FlightState {
	const a = Math.random() * Math.PI * 2;
	const r = 60 + Math.random() * 80;
	return respawnAt(
		x + Math.cos(a) * r,
		z + Math.sin(a) * r,
		heading({ x: q[0], y: q[1], z: q[2], w: q[3] }),
		groundAt,
		env.solidAt,
	);
}
const radar = createRadar();
mp.setOnline(settings.online);
input.showFire(settings.online);
const chase = createChaseCam(camera, groundAt);
const tracker = createStats();
const hud = createHud(tracker.stats);

// --- Courses: find a start gate, fly the rings, beat your ghost ---
const courseGen = createCourses(
	seed,
	groundAt,
	features.solidAt,
	config.courses,
);
const run = createRun(config.courses, {
	loadBest: (id) => storage.get<Best | null>(`best:${seed}:${id}`, null),
	loadGhost: (id) => decodeGhost(storage.get(`ghost:${seed}:${id}`, "")),
	save: (id, best, ghost) => {
		storage.set(`best:${seed}:${id}`, best);
		storage.set(`ghost:${seed}:${id}`, encodeGhost(ghost));
	},
});
const courseMeshes = createCourseMeshes(scene, plane.mesh.geometry);
usePlane(planeId);
const coursePanel = createCoursePanel();
let nearbyCourses: Course[] = [];
let nearGate: Best | null | undefined; // best on the start gate you're near (undefined = none near)
const bench = params.has("bench") ? createBench() : null;
const sound = createSound();
const photo = createPhotoMode({
	renderer,
	camera,
	target: () => plane.mesh.position,
	render: () => renderer.render(scene, camera),
	onChange: (active) => {
		if (!active) snapped = false; // back to the chase camera
	},
	name: () =>
		`paper-plane-${seed}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`,
});
let lastBank = 0;

let state: FlightState = respawnAt(0, 0, 0, groundAt, env.solidAt);
let prev: FlightState = state;
let snapped = false; // camera (and the world around it) jump to the plane on spawn
const telemetry: Telemetry = {
	airspeed: 0,
	altitude: 0,
	sink: 0,
	climb: 0,
	air: 0,
	lift: 1,
};

/** Put the plane somewhere new (respawn or a dev jump). */
function place(s: FlightState) {
	state = s;
	prev = s;
	snapped = false;
	quality.hold(); // the world reloads around the new spot; don't judge those frames
	parked = null;
	running = false;
	if (isWalker()) enterWalker();
}

let paused = false;
let running = false; // a paper animal on the ground
let lastAnimal: AnimalChoice =
	settings.animal === "off" ? "crane" : settings.animal;
let runPhase = 0; // leg swing, advances with distance run
let skateAir = false; // the skateboard is off the ground
let flipT = 0; // seconds in the air, for the kickflip spin
let wingPhase = 0; // crane wing flap
let wingAmp = 0.6;
let morphAt = -10; // when you last turned into a plane or an animal (a little pop)
const easeOutBack = (x: number) =>
	1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2;
/** Ground for the running animal: terrain, or the top of a landing pad. */
const runEnv: RunEnv = {
	floorAt: (x, y, z) => {
		const pad = features.padAt(x, y, z, config.flight.landPadTolerance);
		return pad ? Math.max(pad.y, groundAt(x, z)) : groundAt(x, z);
	},
	solidAt: env.solidAt,
};

/** Switch between paper plane and paper animal (setting or the T key). */
function setForm() {
	usePlane(currentId());
	morphAt = time;
	if (isWalker()) {
		enterWalker(); // a land animal goes to the ground and runs
	} else if (running && settings.animal === "off") {
		state = runTakeOff(state, config.flight); // a plane can't run: take off
		prev = state;
		running = false;
	}
	const name = PLANES[currentId()].name;
	coursePanel.flash(
		settings.animal === "off"
			? "Paper plane"
			: isWalker()
				? PLANES[currentId()].skate
					? `${name} · W kick · Space ollie`
					: `${name} · W run · Space sprint`
				: `${name} · land to run · Space to fly`,
		time,
	);
}

/** Put a land animal on the ground below where you are, and start running. */
function enterWalker() {
	const p = state.position;
	const floor = runEnv.floorAt(p.x, p.y, p.z);
	state = landRun(
		{ ...state, velocity: { x: 0, y: 0, z: 0 } },
		floor,
		config.flight,
	);
	prev = state;
	running = true;
	parked = null;
	snapped = false;
}
let parked: Parked | null = null; // landed on a floating island
let assistOffUntil = 0; // no landing pull until this time (just took off)

// Animated things near the player, refreshed twice a second.
let nearbyHoops: Hoop[] = [];
let nearbyVines: Vine[] = [];
let nearbyPads: Pad[] = [];
let lastGather = -Infinity;
const hoopPasses = new Map<string, number>(); // hoop id → time you last flew through

/** Arrow + distance to the nearest landing pad (not while parked or far away). */
function padPointer(): string {
	if (parked) return "";
	const { x, z } = state.position;
	let best: Pad | null = null;
	let bestD = config.props.padPointerRange;
	for (const p of nearbyPads) {
		const d = Math.hypot(p.x - x, p.z - z);
		if (d < bestD) {
			bestD = d;
			best = p;
		}
	}
	if (!best) return "";
	const f = new THREE.Vector3(0, 0, -1).applyQuaternion(plane.mesh.quaternion);
	const bearing = (THREE.MathUtils.radToDeg(Math.atan2(f.x, -f.z)) + 360) % 360;
	return pointTo(x, z, bearing, best.x, best.z);
}

function gather(x: number, z: number) {
	const n = features.near(x, z, config.props.featureRange);
	nearbyHoops = n.hoops;
	nearbyVines = n.vines;
	nearbyPads = n.pads;
	nearbyClouds = cloudField.near(x, z, wind.driftTo(time));
	nearbyCourses = courseGen.near(x, z, config.courses.range);
	const gate = nearbyCourses.find(
		(c) => Math.hypot(c.gate.x - x, c.gate.z - z) < 250,
	);
	nearGate = gate
		? storage.get<Best | null>(`best:${seed}:${gate.id}`, null)
		: undefined;
}

function update(dt: number) {
	const i = input.update(dt);
	if (input.gamepad.start) menu.toggle();
	if (paused || photo.active) return;
	bench?.steer(i, telemetry.altitude, telemetry.climb, state.airspeed);
	prev = state;
	// Throw a paper ball (flying only), then share where you are.
	if (i.fire && !running && crash.phase === "flying") {
		const f = axes(state.orientation).forward;
		const v = state.velocity;
		const p = state.position;
		if (mp.shoot([p.x, p.y, p.z], [f.x, f.y, f.z], [v.x, v.y, v.z]))
			sound.pop();
	}
	{
		const p = state.position;
		const o = state.orientation;
		mp.step(
			dt,
			{
				p: [p.x, p.y, p.z],
				q: [o.x, o.y, o.z, o.w],
				type: planeId,
				f:
					(state.boosting ? BOOST : 0) |
					(running ? RUNNING : 0) |
					(crash.phase === "rolling" ? CRASHED : 0),
			},
			crash.phase === "flying",
		);
	}
	const fresh = crash.update(dt);
	if (fresh) {
		// Online: come back next to someone, so it stays lively.
		const peer = mp.randomPeer();
		place(peer ? spawnBeside(peer.p[0], peer.p[2], peer.q) : fresh);
	}
	if (crash.phase === "rolling") {
		airHere = 0;
		return;
	}

	// A paper animal on the ground: run, step, climb, drop off edges, Space takes off.
	if (running) {
		const r = PLANES[planeId].skate
			? stepSkate(state, i, dt, config.flight, runEnv)
			: stepRun(state, i, dt, config.flight, runEnv, isWalker());
		skateAir = r.air === true;
		state = r.state;
		{
			// Legs cycle with the signed speed along the heading, so they reverse when walking backwards.
			const yawNow = heading(state.orientation);
			const along = -(
				state.velocity.x * Math.sin(yawNow) +
				state.velocity.z * Math.cos(yawNow)
			);
			runPhase +=
				along * dt * config.flight.runStride * (state.boosting ? 1.8 : 1); // sprinting: legs very fast
		}
		if (r.mode === "fly") {
			running = false;
			assistOffUntil = time + config.flight.assistCooldown;
			sound.chime(0.6);
		} else {
			const p = state.position;
			telemetry.airspeed = state.airspeed;
			telemetry.altitude = p.y - groundAt(p.x, p.z);
			telemetry.climb = 0;
			telemetry.lift = 1;
			airHere = 0;
			tracker.step(dt, state, telemetry.altitude, 0);
			coursePanel.flash("Running · Space to fly · T for plane", time);
			return;
		}
	}

	// Parked on a floating island: slide, refuel, boost to take off.
	if (parked) {
		if (i.boost) {
			state = takeOff(state, parked, config.flight);
			parked = null;
			assistOffUntil = time + config.flight.assistCooldown; // don't suck you straight back down
			sound.chime(0.6);
		} else {
			const r = slide(state, parked, dt, config.flight);
			state = r.state;
			if (r.off)
				parked = null; // slid off the edge: you're flying again
			else {
				coursePanel.flash("Landed · refuelling · Space to take off", time);
				telemetry.climb = 0;
				return;
			}
		}
	}

	// Near a landing pad (and not boosting), the pad pulls you in.
	if (!i.boost && time > assistOffUntil) {
		for (const pad of nearbyPads) {
			const pulled = assist(state, pad, dt, config.flight);
			if (!pulled) continue;
			state = pulled;
			coursePanel.flash("Landing… hold boost to pull away", time);
			break;
		}
	}

	const res = stepFlight(state, i, dt, config.flight, env);
	if (res.crashed) {
		// A gentle touchdown on a floating island's grassy top is a landing, not a crash.
		const p = res.state.position;
		const pad = features.padAt(p.x, p.y, p.z, config.flight.landPadTolerance);
		// Paper animal: any gentle touchdown on the ground or a pad is a landing, then it runs.
		if (settings.animal !== "off" && touchdownOk(res.state, config.flight)) {
			const g = groundAt(p.x, p.z);
			const floor = pad ? pad.y : p.y < g + config.flight.clearance ? g : null;
			if (floor !== null) {
				state = landRun(res.state, floor, config.flight);
				prev = state;
				running = true;
				runPhase = 0;
				tracker.stats.landings++;
				sound.chime(0.5);
				return;
			}
		}
		if (pad && touchdownOk(res.state, config.flight)) {
			({ state, parked } = land(res.state, pad, config.flight));
			prev = state;
			tracker.stats.landings++;
			sound.chime(0.5);
			return;
		}
		crash.start(state);
		tracker.crash();
		sound.crumple();
		return; // freeze where we hit; the plane scrunches into a ball there
	}
	state = res.state;

	// Paper rustles when the wings snap round quickly.
	const ax = axes(state.orientation);
	const bank = Math.atan2(-ax.right.y, ax.up.y);
	let dBank = bank - lastBank;
	if (dBank > Math.PI) dBank -= Math.PI * 2;
	if (dBank < -Math.PI) dBank += Math.PI * 2;
	lastBank = bank;
	if (Math.abs(dBank) / dt > config.audio.rustleTurnRate) sound.rustle();

	const p = state.position;
	telemetry.airspeed = state.airspeed;
	telemetry.altitude = p.y - groundAt(p.x, p.z);
	telemetry.sink = state.sink;
	telemetry.climb = state.velocity.y;
	airHere = airAt(p.x, p.y, p.z);
	telemetry.air = airHere;
	telemetry.lift = liftFraction(state.airspeed, config.flight);
	tracker.step(dt, state, telemetry.altitude, airHere);

	for (const e of run.step(
		dt,
		prev.position,
		state.position,
		state.orientation,
		nearbyCourses,
	)) {
		if (e === "finish") {
			const f = run.takeFinished();
			if (f) {
				const best = f.newBest ? " · new best!" : "";
				coursePanel.flash(
					`Finished ${clock(f.best.time)} · ${f.best.rings}/${f.course.rings.length} rings${best}`,
					time,
				);
			}
		}
		if (e === "abandon") coursePanel.flash("Course dropped", time);
		if (e === "ring") sound.chime(1);
		if (e === "start") sound.chime(0.75);
		if (e === "finish") sound.finish();
	}

	for (const h of nearbyHoops) {
		if (passedThrough(h, prev.position, state.position)) {
			tracker.stats.hoops++;
			hoopPasses.set(h.id, time);
			sound.chime(1.5);
		}
	}
}

// --- Render ---
const pos = new THREE.Vector3();
const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();
const fwd = new THREE.Vector3();
const vel = new THREE.Vector3();
const flipQ = new THREE.Quaternion();
const zAxis = new THREE.Vector3(0, 0, 1);
const planeRight = new THREE.Vector3();
const planeUp = new THREE.Vector3();
let hudRoll = 0; // degrees, last good bank angle for the HUD
const shake = new THREE.Quaternion();
const shakeEuler = new THREE.Euler();

function render(alpha: number, frameDt: number) {
	time += frameDt;
	bench?.frame(frameDt * 1000);
	if (!paused) quality.frame(frameDt * 1000);
	const lerp = (a: number, b: number) => a + (b - a) * alpha;
	pos.set(
		lerp(prev.position.x, state.position.x),
		lerp(prev.position.y, state.position.y),
		lerp(prev.position.z, state.position.z),
	);
	const o = prev.orientation;
	const n = state.orientation;
	plane.mesh.quaternion.slerpQuaternions(
		qa.set(o.x, o.y, o.z, o.w),
		qb.set(n.x, n.y, n.z, n.w),
		alpha,
	);
	// Moving air shakes the plane a little, so you can feel it.
	const a = config.plane.turbulence * Math.abs(airHere);
	shakeEuler.set(
		a * 0.6 * Math.sin(time * 17 + 1),
		0,
		a * (Math.sin(time * 13) + 0.5 * Math.sin(time * 23)),
	);
	plane.mesh.quaternion.multiply(shake.setFromEuler(shakeEuler));
	// Skateboard: a kickflip spin about its length while it's in the air.
	flipT = skateAir ? flipT + frameDt : 0;
	if (flipT > 0.12) {
		const t = Math.min(1, (flipT - 0.12) / 0.5);
		plane.mesh.quaternion.multiply(
			flipQ.setFromAxisAngle(zAxis, easeOutBack(t) * Math.PI * 2),
		);
	}
	plane.mesh.position.copy(pos);
	const k = crash.render(alpha);
	plane.mesh.visible = k > 0.01;
	plane.mesh.scale.setScalar(
		config.plane.scale *
			k *
			(0.5 + 0.5 * easeOutBack(Math.min(1, (time - morphAt) / 0.4))),
	);
	plane.runPose(runPhase, running ? 1 : 0, state.boosting ? 1.7 : 1);
	// Crane wings: flap while flying (faster when boosting), rest folded up when running.
	const boostingNow = state.boosting && crash.phase !== "rolling";
	{
		const hz = running ? 0 : boostingNow ? 8 : 3.5;
		const amp = running ? 0.05 : boostingNow ? 0.85 : 0.6;
		wingAmp += (amp - wingAmp) * Math.min(1, 8 * frameDt);
		wingPhase += frameDt * hz * Math.PI * 2;
		plane.flap(wingPhase, wingAmp, running ? 0.45 : 0.12);
	}
	plane.flutter(
		time,
		Math.min(1, state.airspeed / config.plane.flutterSpeedRef),
	);

	const flying = crash.phase !== "rolling";
	const boosting = flying && state.boosting; // actually firing (not just held, with fuel)
	fwd.set(0, 0, -1).applyQuaternion(plane.mesh.quaternion);
	boostTrail.update(
		frameDt,
		boosting,
		pos,
		fwd,
		vel.set(state.velocity.x, state.velocity.y, state.velocity.z),
	);
	airColumns.update(pos, time);

	// After a spawn or jump, load the new area in one go before showing it.
	world.update(
		pos.x,
		pos.z,
		time,
		snapped ? config.world.buildBudgetMs : Infinity,
	);
	if (!snapped || time - lastGather > 0.5) {
		gather(pos.x, pos.z);
		lastGather = time;
	}
	if (!snapped) {
		chase.snap(pos, plane.mesh.quaternion);
		snapped = true;
	}
	if (photo.active) photo.update();
	else
		chase.update(
			pos,
			plane.mesh.quaternion,
			state.airspeed,
			boosting,
			flying ? airHere : 0,
			frameDt,
		);

	// Shadow camera follows the plane so the shadow stays sharp.
	sun.target.position.copy(pos);
	sun.position.copy(pos).add(sunOffset);

	// Day and night.
	const dayTime =
		settings.timeOfDay === "day"
			? 0.45
			: settings.timeOfDay === "night"
				? 0.02
				: config.dayNight.start + time / config.dayNight.dayLength;
	const light = lighting.at(dayTime);
	sunOffset.copy(light.sunDir).multiplyScalar(config.dayNight.sunDistance);
	sun.color.copy(light.sun);
	sun.intensity = light.sunIntensity;
	ambient.intensity = light.ambient;
	(scene.fog as THREE.Fog).color.copy(light.horizon);
	(scene.background as THREE.Color).copy(light.horizon);
	world.setNight(light.night);
	clouds.setNight(light.night);

	// Bank angle for the HUD. Pointing nearly straight up or down, "level wings" means
	// nothing and the angle spins, so keep the last good value there.
	if (Math.abs(fwd.y) < 0.95) {
		planeRight.set(1, 0, 0).applyQuaternion(plane.mesh.quaternion);
		planeUp.set(0, 1, 0).applyQuaternion(plane.mesh.quaternion);
		hudRoll = THREE.MathUtils.radToDeg(Math.atan2(-planeRight.y, planeUp.y));
	}
	const bearing =
		(THREE.MathUtils.radToDeg(Math.atan2(fwd.x, -fwd.z)) + 360) % 360;
	hud.update(
		{
			bearing,
			altitude: telemetry.altitude,
			speed: state.airspeed,
			climb: state.velocity.y,
			air: airHere,
			stalling: flying && telemetry.lift < 0.9,
			boosting,
			fuel: settings.unlimitedBoost ? 1 : state.fuel,
			boostLocked: state.boostLocked,
			// Attitude from the plane's axes: pitch of the nose, bank of the wings.
			pitch: THREE.MathUtils.radToDeg(
				Math.asin(THREE.MathUtils.clamp(fwd.y, -1, 1)),
			),
			roll: hudRoll,
			wind: wind.at(time),
			online: mp.count,
			hits: mp.score,
		},
		time,
	);

	mp.render(time);
	radar.update(pos, heading(state.orientation), mp.peers());
	hoopMeshes.update(nearbyHoops, time, hoopPasses);
	vineMeshes.update(nearbyVines, time);
	birdMeshes.update(
		birdField.near(pos.x, pos.z, config.props.featureRange),
		time,
	);
	water.update(pos.x, pos.z, time);
	sound.update(flying && !paused ? state.airspeed : 0, boosting && !paused);
	clouds.update(nearbyClouds, wind.driftTo(time));
	const runView = run.view();
	courseMeshes.update(
		nearbyCourses,
		run.active,
		run.ringStates(),
		time,
		runView?.ghost ?? null,
	);
	const nextRing =
		runView && run.active ? run.active.rings[runView.next] : null;
	coursePanel.update(
		runView,
		run.active ? undefined : nearGate,
		time,
		nextRing ? pointTo(pos.x, pos.z, bearing, nextRing.x, nextRing.z) : "",
		padPointer(),
	);
	sky.update(camera, light.horizon, light.zenith, light.night);
	renderer.render(scene, camera);
}

if (isWalker()) enterWalker();
startLoop(update, render);
setupHelp();

const menu = createMenu({
	seed,
	onPause: (p) => {
		paused = p;
	},
	onQuality: (q) => {
		quality.set(q);
		return q === "auto" ? `(${quality.tier})` : "";
	},
	onControls: (c) => {
		if (c === "tilt") input.tilt.enable();
		else if (c !== "auto") input.tilt.disable();
	},
	onRecalibrate: () => input.tilt.recalibrate(),
	onPhoto: () => photo.enter(),
	planeName: () => PLANES[flyPlane].name,
	onPlane: (choice) => {
		flyPlane = choice === "random" ? randomPlane() : choice;
		usePlane(currentId());
		return PLANES[flyPlane].name;
	},
	onForm: () => setForm(),
	onOnline: (on) => {
		mp.setOnline(on);
		input.showFire(on);
	},
	onResume: () => {
		if (!isTouchDevice()) renderer.domElement.requestPointerLock();
	},
});

addEventListener("keydown", (e) => {
	if (e.code !== "KeyT" || e.repeat || paused || photo.active) return;
	if ((e.target as HTMLElement).closest?.("input, select, textarea")) return;
	// T: switch the paper animal on and off (it remembers which one).
	if (settings.animal === "off") settings.animal = lastAnimal;
	else {
		lastAnimal = settings.animal;
		settings.animal = "off";
	}
	saveSettings();
	setForm();
});

if (params.has("debug")) {
	createDevPanel(telemetry, {
		respawn: () =>
			place(
				respawnAt(
					state.position.x,
					state.position.z,
					heading(state.orientation),
					groundAt,
					env.solidAt,
				),
			),
		...createDevJumps({
			position: () => state.position,
			time: () => time,
			place,
			features,
			birdsNear: birdField.near,
			columnsNear: air.columnsNear,
			coursesNear: courseGen.near,
			groundAt,
		}),
	});
}
