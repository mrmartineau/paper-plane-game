import * as THREE from "three";
import { createChaseCam } from "./camera/chaseCam";
import { config } from "./config";
import { createInput } from "./core/input";
import { startLoop } from "./core/loop";
import { createDevPanel, type Telemetry } from "./debug";
import { createCrash, respawnState } from "./plane/crash";
import {
	createFlightState,
	type FlightState,
	liftFraction,
	stepFlight,
} from "./plane/flight";
import { createPlaneModel } from "./plane/model";
import { createHeight } from "./world/height";
import { createTerrain, createWater } from "./world/terrain";

const params = new URLSearchParams(location.search);
const seed = params.get("seed") ?? config.world.seed;

// --- Renderer, scene, lights ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, config.render.maxPixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

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
scene.add(createTerrain(height), createWater());

// --- Plane ---
const plane = createPlaneModel();
scene.add(plane.mesh);
const input = createInput(renderer.domElement);
const crash = createCrash(groundAt);
const chase = createChaseCam(camera, groundAt);

let state: FlightState = respawnState(
	createFlightState({ x: 0, y: 0, z: 0 }, 0, 0),
	groundAt,
);
let prev: FlightState = state;
let snapped = false; // camera jumps to the plane on spawn
const telemetry: Telemetry = {
	airspeed: 0,
	altitude: 0,
	sink: 0,
	climb: 0,
	lift: 1,
};

function respawn() {
	state = respawnState(state, groundAt);
	prev = state;
	snapped = false;
}

function update(dt: number) {
	const i = input.update(dt);
	prev = state;
	if (crash.phase === "crumple") {
		const fresh = crash.update(dt, state);
		if (fresh) {
			state = fresh;
			prev = fresh;
			snapped = false;
		}
		return;
	}
	crash.update(dt, state);
	const res = stepFlight(state, i, dt, config.flight, groundAt);
	if (res.crashed) {
		crash.start();
		return; // freeze where we hit; the mesh crumples in place
	}
	state = res.state;

	telemetry.airspeed = state.airspeed;
	telemetry.altitude =
		state.position.y - groundAt(state.position.x, state.position.z);
	telemetry.sink = state.sink;
	telemetry.climb = state.velocity.y;
	telemetry.lift = liftFraction(state.airspeed, config.flight);
}

// --- Render ---
const pos = new THREE.Vector3();
const euler = new THREE.Euler(0, 0, 0, "YXZ");
let time = 0;

function render(alpha: number, frameDt: number) {
	time += frameDt;
	const lerp = (a: number, b: number) => a + (b - a) * alpha;
	pos.set(
		lerp(prev.position.x, state.position.x),
		lerp(prev.position.y, state.position.y),
		lerp(prev.position.z, state.position.z),
	);
	const yaw = lerp(prev.yaw, state.yaw);
	const v = crash.visual();

	plane.mesh.position.copy(pos);
	euler.set(
		lerp(prev.pitch, state.pitch),
		yaw + v.spin,
		-lerp(prev.roll, state.roll),
	);
	plane.mesh.quaternion.setFromEuler(euler);
	plane.mesh.scale.set(v.sx, v.sy, v.sz).multiplyScalar(config.plane.scale);
	plane.flutter(
		time,
		Math.min(1, state.airspeed / config.plane.flutterSpeedRef),
	);

	if (!snapped) {
		chase.snap(pos, yaw);
		snapped = true;
	}
	chase.update(pos, yaw, state.airspeed, frameDt);

	// Shadow camera follows the plane so the shadow stays sharp.
	sun.target.position.copy(pos);
	sun.position.copy(pos).add(sunOffset);

	renderer.render(scene, camera);
}

startLoop(update, render);

// Hide the controls hint after the first input.
const hint = document.getElementById("hint");
const hideHint = () => {
	if (hint) hint.style.opacity = "0";
};
addEventListener("keydown", hideHint, { once: true });
renderer.domElement.addEventListener("click", hideHint, { once: true });

if (params.has("debug")) createDevPanel(telemetry, respawn);
