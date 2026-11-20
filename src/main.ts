import * as THREE from "three";
import { createChaseCam } from "./camera/chaseCam";
import { config } from "./config";
import { createInput } from "./core/input";
import { startLoop } from "./core/loop";
import { passedThrough } from "./courses/rings";
import { createDevPanel, type Telemetry } from "./debug";
import { createCrash, respawnAt } from "./plane/crash";
import {
	createFlightState,
	type FlightEnv,
	type FlightState,
	heading,
	liftFraction,
	stepFlight,
} from "./plane/flight";
import { createPlaneModel } from "./plane/model";
import { createAirColumns } from "./render/airColumns";
import { createBirdMeshes } from "./render/birdMeshes";
import { createBoostTrail } from "./render/boostTrail";
import { createFloaterMeshes } from "./render/floaterMeshes";
import { createHoopMeshes } from "./render/hoopMeshes";
import { createPropMeshes } from "./render/propMeshes";
import { setupHelp } from "./ui/help";
import { createHud } from "./ui/hud";
import { createStats } from "./ui/stats";
import { birdPose, createBirds, hitsBird } from "./world/birds";
import { createHeight } from "./world/height";
import { createProps, SHAPES } from "./world/props";
import { createTerrain, createWater } from "./world/terrain";
import { createAir } from "./world/thermals";

const params = new URLSearchParams(location.search);
const seed = params.get("seed") ?? config.world.seed;

// --- Renderer, scene, lights ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, config.render.maxPixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);

const r = config.render;
const scene = new THREE.Scene();
scene.background = new THREE.Color(r.skyColor);
scene.fog = new THREE.Fog(r.skyColor, r.fogNear, r.fogFar);
scene.add(new THREE.HemisphereLight(0xffffff, 0xb8a98c, r.ambientIntensity));

const sun = new THREE.DirectionalLight(r.sunColor, r.sunIntensity);
const sunOffset = new THREE.Vector3(80, 140, 40);
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

// --- World ---
const height = createHeight(seed, config.world);
const groundAt = (x: number, z: number) =>
	Math.max(height(x, z), config.world.seaLevel);
const air = createAir(seed, groundAt, config.air);
const props = createProps(seed, height, config.props, config.world.seaLevel);
const birds = createBirds(
	seed,
	groundAt,
	air.columnsNear(0, 0, config.props.extent * 0.71),
	config.birds,
	config.props.extent,
);
const env: FlightEnv = {
	groundAt,
	airAt: air.airAt,
	solidAt: (x, y, z) =>
		props.solidAt(x, y, z) ||
		hitsBird(birds, x, y, z, time, config.birds.hitRadius),
};
scene.add(createTerrain(height), createWater());
createPropMeshes(scene, props);
const hoopMeshes = createHoopMeshes(scene, props.hoops);
const birdMeshes = createBirdMeshes(scene, birds);
const floaterMeshes = createFloaterMeshes(scene, props);
const airColumns = createAirColumns(scene, air.columnsNear);
const boostTrail = createBoostTrail(scene);

// --- Plane ---
const plane = createPlaneModel();
scene.add(plane.mesh);
const input = createInput(renderer.domElement);
const crash = createCrash(scene, groundAt);
const chase = createChaseCam(camera, groundAt);
const tracker = createStats();
const hud = createHud(tracker.stats);

let state: FlightState = respawnAt(0, 0, 0, groundAt);
let prev: FlightState = state;
let snapped = false; // camera jumps to the plane on spawn
const telemetry: Telemetry = {
	airspeed: 0,
	altitude: 0,
	sink: 0,
	climb: 0,
	air: 0,
	lift: 1,
};

function respawn() {
	state = respawnAt(
		state.position.x,
		state.position.z,
		heading(state.orientation),
		groundAt,
	);
	prev = state;
	snapped = false;
}

/** Dev: put the plane 50m south of the nearest updraft's edge, facing it. */
function goToUpdraft() {
	const { x, z } = state.position;
	const col = air
		.columnsNear(x, z, 3000)
		.filter((c) => c.strength > 0)
		.sort(
			(a, b) =>
				(a.x - x) ** 2 + (a.z - z) ** 2 - ((b.x - x) ** 2 + (b.z - z) ** 2),
		)[0];
	if (!col) return;
	const sz = col.z + col.radius + 50;
	const y = Math.max(col.base + 60, groundAt(col.x, sz) + 30);
	state = createFlightState({ x: col.x, y, z: sz }, 0, config.spawn.speed);
	prev = state;
	snapped = false;
}

function nearest<T extends { x: number; z: number }>(
	items: T[],
): T | undefined {
	const { x, z } = state.position;
	const d = (t: T) => (t.x - x) ** 2 + (t.z - z) ** 2;
	return [...items].sort((u, v) => d(u) - d(v))[0];
}

/** Dev: line the plane up `back` metres in front of a hole, a little high (it glides down on the way). */
function lineUp(
	x: number,
	holeY: number,
	z: number,
	yaw: number,
	back: number,
) {
	const glideDrop = back * -Math.tan(config.flight.glidePitch);
	state = createFlightState(
		{
			x: x + Math.sin(yaw) * back,
			y: holeY + glideDrop,
			z: z + Math.cos(yaw) * back,
		},
		yaw,
		config.spawn.speed,
	);
	prev = state;
	snapped = false;
}

function goToArch() {
	const a = nearest(props.arches);
	if (!a) return;
	const { R, r } = SHAPES.arch;
	lineUp(
		a.x,
		a.kind === "ring" ? a.y : a.y + ((R - r) / 2) * a.s,
		a.z,
		a.yaw,
		120,
	);
}

/** Dev: park the plane 60m outside the nearest bird's circle, level with it, facing in. */
function goToBirds() {
	const b = nearest(birds.map((bird) => ({ ...bird, x: bird.cx, z: bird.cz })));
	if (!b) return;
	const pose = birdPose(b, time, { x: 0, y: 0, z: 0, yaw: 0, bank: 0 });
	const ox = pose.x - b.cx;
	const oz = pose.z - b.cz;
	const k = (b.radius + 60) / Math.hypot(ox, oz);
	const x = b.cx + ox * k;
	const z = b.cz + oz * k;
	state = createFlightState(
		{ x, y: pose.y + 3, z },
		Math.atan2(ox, oz),
		config.spawn.speed,
	);
	prev = state;
	snapped = false;
}

/** Dev: fly past the nearest floating mountain, alongside its vines. */
function goToFloater() {
	const f = nearest(props.floaters);
	if (!f) return;
	const side = f.R + 30; // aim beside it, not into it
	lineUp(
		f.x + Math.cos(f.yaw) * side,
		f.y - f.H * 0.3,
		f.z - Math.sin(f.yaw) * side,
		f.yaw,
		200,
	);
}

/** Dev: face the nearest waterfall from 120m out, level with its middle. */
function goToWaterfall() {
	const w = nearest(props.waterfalls);
	if (w) lineUp(w.x, w.y - w.length * 0.4, w.z, w.yaw, 120);
}

function goToHoop() {
	const h = nearest(props.hoops);
	if (h) lineUp(h.x, h.y, h.z, h.yaw, config.props.hoopLane - 10);
}

function update(dt: number) {
	const i = input.update(dt);
	prev = state;
	const fresh = crash.update(dt);
	if (fresh) {
		state = fresh;
		prev = fresh;
		snapped = false;
	}
	if (crash.phase === "rolling") {
		airHere = 0;
		return;
	}

	const res = stepFlight(state, i, dt, config.flight, env);
	if (res.crashed) {
		crash.start(state);
		tracker.crash();
		return; // freeze where we hit; the plane scrunches into a ball there
	}
	state = res.state;

	const p = state.position;
	telemetry.airspeed = state.airspeed;
	telemetry.altitude = p.y - groundAt(p.x, p.z);
	telemetry.sink = state.sink;
	telemetry.climb = state.velocity.y;
	airHere = air.airAt(p.x, p.y, p.z);
	telemetry.air = airHere;
	telemetry.lift = liftFraction(state.airspeed, config.flight);
	tracker.step(dt, state, telemetry.altitude, airHere);

	// ponytail: checks every hoop each step (~130); use the props grid if hoop counts grow.
	props.hoops.forEach((h, i) => {
		if (passedThrough(h, prev.position, state.position)) {
			tracker.stats.hoops++;
			hoopMeshes.pass(i, time);
		}
	});
}

// --- Render ---
const pos = new THREE.Vector3();
const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();
const fwd = new THREE.Vector3();
const vel = new THREE.Vector3();
const shake = new THREE.Quaternion();
const shakeEuler = new THREE.Euler();
let time = 0;
let airHere = 0;

function render(alpha: number, frameDt: number) {
	time += frameDt;
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
	plane.mesh.position.copy(pos);
	const k = crash.render(alpha);
	plane.mesh.visible = k > 0.01;
	plane.mesh.scale.setScalar(config.plane.scale * k);
	plane.flutter(
		time,
		Math.min(1, state.airspeed / config.plane.flutterSpeedRef),
	);

	const flying = crash.phase !== "rolling";
	const boosting = flying && input.state.boost;
	fwd.set(0, 0, -1).applyQuaternion(plane.mesh.quaternion);
	boostTrail.update(
		frameDt,
		boosting,
		pos,
		fwd,
		vel.set(state.velocity.x, state.velocity.y, state.velocity.z),
	);
	airColumns.update(pos, time);

	if (!snapped) {
		chase.snap(pos, plane.mesh.quaternion);
		snapped = true;
	}
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

	hud.update(
		{
			bearing:
				(THREE.MathUtils.radToDeg(Math.atan2(fwd.x, -fwd.z)) + 360) % 360,
			altitude: telemetry.altitude,
			speed: state.airspeed,
			climb: state.velocity.y,
			air: airHere,
			stalling: flying && telemetry.lift < 0.9,
		},
		time,
	);

	hoopMeshes.update(time);
	birdMeshes.update(time);
	floaterMeshes.update(time);
	renderer.render(scene, camera);
}

startLoop(update, render);
setupHelp();

if (params.has("debug"))
	createDevPanel(telemetry, {
		respawn,
		"go to updraft": goToUpdraft,
		"go to arch": goToArch,
		"go to hoop": goToHoop,
		"go to birds": goToBirds,
		"go to floating mountain": goToFloater,
		"go to waterfall": goToWaterfall,
	});
