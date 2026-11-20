import * as THREE from "three";
import { createBench } from "./bench";
import { createChaseCam } from "./camera/chaseCam";
import { config } from "./config";
import { createInput } from "./core/input";
import { startLoop } from "./core/loop";
import { passedThrough } from "./courses/rings";
import { createDevJumps, createDevPanel, type Telemetry } from "./debug";
import { createCrash, respawnAt } from "./plane/crash";
import {
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
import { createHoopMeshes } from "./render/hoopMeshes";
import { createSky } from "./render/sky";
import { createVineMeshes } from "./render/vines";
import { createWater } from "./render/water";
import { createWorldMeshes } from "./render/world";
import { setupHelp } from "./ui/help";
import { createHud } from "./ui/hud";
import { createStats } from "./ui/stats";
import { blend } from "./world/biomes";
import { createBirdField } from "./world/birds";
import { createClimate, createHeight } from "./world/height";
import { createFeatures, type Hoop, type Vine } from "./world/props";
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
const env: FlightEnv = {
	groundAt,
	airAt: air.airAt,
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

// --- Plane ---
const plane = createPlaneModel();
scene.add(plane.mesh);
const input = createInput(renderer.domElement);
const crash = createCrash(scene, groundAt, env.solidAt);
const chase = createChaseCam(camera, groundAt);
const tracker = createStats();
const hud = createHud(tracker.stats);
const bench = params.has("bench") ? createBench() : null;

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
}

// Animated things near the player, refreshed twice a second.
let nearbyHoops: Hoop[] = [];
let nearbyVines: Vine[] = [];
let lastGather = -Infinity;
const hoopPasses = new Map<string, number>(); // hoop id → time you last flew through

function gather(x: number, z: number) {
	const n = features.near(x, z, config.props.featureRange);
	nearbyHoops = n.hoops;
	nearbyVines = n.vines;
}

function update(dt: number) {
	const i = input.update(dt);
	bench?.steer(i, telemetry.altitude, telemetry.climb);
	prev = state;
	const fresh = crash.update(dt);
	if (fresh) place(fresh);
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

	for (const h of nearbyHoops) {
		if (passedThrough(h, prev.position, state.position)) {
			tracker.stats.hoops++;
			hoopPasses.set(h.id, time);
		}
	}
}

// --- Render ---
const pos = new THREE.Vector3();
const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();
const fwd = new THREE.Vector3();
const vel = new THREE.Vector3();
const shake = new THREE.Quaternion();
const shakeEuler = new THREE.Euler();

function render(alpha: number, frameDt: number) {
	time += frameDt;
	bench?.frame(frameDt * 1000);
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

	hoopMeshes.update(nearbyHoops, time, hoopPasses);
	vineMeshes.update(nearbyVines, time);
	birdMeshes.update(
		birdField.near(pos.x, pos.z, config.props.featureRange),
		time,
	);
	water.update(pos.x, pos.z, time);
	sky.update(camera);
	renderer.render(scene, camera);
}

startLoop(update, render);
setupHelp();

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
			groundAt,
		}),
	});
}
