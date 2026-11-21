// Multiplayer glue: the room link, other players' planes, and paper-ball shots.
// main.ts tells it where you are each step; it tells main when you get hit.
import * as THREE from "three";
import { config } from "../config";
import {
	createPaperBall,
	createPlaneModel,
	type PlaneModel,
	paperBallGeometry,
	paperBallMaterial,
} from "../plane/model";
import { fire, SHOT, type Shot, segmentHits, stepShots } from "../plane/shots";
import { PLANES, type PlaneId } from "../plane/types";
import { connect, type NetLink } from "./client";
import { CRASHED, type PlayerState, type Vec } from "./protocol";
import { createRemotes, type Pose } from "./remotes";

const MAX_SHOTS = 128;

interface Remote {
	model: PlaneModel;
	ball: THREE.Mesh;
	type: string;
}

export function createMultiplayer(
	scene: THREE.Scene,
	room: string,
	world: {
		groundAt: (x: number, z: number) => number;
		solidAt: (x: number, y: number, z: number) => boolean;
	},
	events: {
		/** A remote player's ball hit you. */
		onHit: (by: number) => void;
		/** Someone scored (maybe you). */
		onScore: (id: number, mine: boolean) => void;
		/** The first other player you can see after joining: a good place to spawn. */
		onFirstPeer: (pose: Pose) => void;
	},
) {
	let link: NetLink | null = null;
	const remotes = createRemotes();
	const meshes = new Map<number, Remote>();
	let shots: Shot[] = [];
	let cooldown = 0;
	let clock = 0; // seconds, for the interpolation buffer
	let greeted = false; // already moved next to someone since joining

	const balls = new THREE.InstancedMesh(
		paperBallGeometry(0.5, 0),
		paperBallMaterial(),
		MAX_SHOTS,
	);
	balls.frustumCulled = false;
	balls.count = 0;
	scene.add(balls);

	function drop(id: number) {
		remotes.remove(id);
		const r = meshes.get(id);
		if (!r) return;
		scene.remove(r.model.mesh, r.ball);
		r.model.mesh.geometry.dispose();
		meshes.delete(id);
	}

	function remote(id: number): Remote {
		let r = meshes.get(id);
		if (r) return r;
		const model = createPlaneModel("dart");
		const colour = link?.players.get(id)?.colour ?? "#ffffff";
		(model.mesh.material as THREE.MeshLambertMaterial).color.set(colour);
		const ball = createPaperBall();
		ball.scale.setScalar(config.plane.scale);
		ball.visible = false;
		scene.add(model.mesh, ball);
		r = { model, ball, type: "dart" };
		meshes.set(id, r);
		return r;
	}

	function setOnline(on: boolean) {
		if (on && !link)
			link = connect(room, (m) => {
				if (m.t === "state") remotes.push(m.id, m.s, clock);
				else if (m.t === "leave") drop(m.id);
				else if (m.t === "shot")
					shots.push({ p: m.p, prev: [...m.p], v: m.v, age: 0, by: m.id });
				else if (m.t === "score") events.onScore(m.id, m.id === link?.id);
			});
		if (!on && link) {
			link.close();
			link = null;
			shots = [];
		}
		greeted = false;
	}

	const tmp = new THREE.Matrix4();
	const q = new THREE.Quaternion();
	const at = new THREE.Vector3();
	const one = new THREE.Vector3(1, 1, 1);

	return {
		setOnline,
		get online() {
			return link?.id != null;
		},
		/** Players in the room, you included (0 when offline). */
		get count() {
			return link?.players.size ?? 0;
		},
		get score() {
			return (link?.id != null && link.players.get(link.id)?.score) || 0;
		},
		/** Other players now: position and colour (for the radar). */
		peers(): { x: number; y: number; z: number; colour: string }[] {
			const out = [];
			for (const id of remotes.ids()) {
				const pose = remotes.sample(id, clock);
				if (!pose || pose.f & CRASHED) continue;
				out.push({
					x: pose.p[0],
					y: pose.p[1],
					z: pose.p[2],
					colour: link?.players.get(id)?.colour ?? "#ffffff",
				});
			}
			return out;
		},
		/** A random other player's pose, to respawn next to. */
		randomPeer(): Pose | null {
			const ids = [...remotes.ids()];
			for (let n = ids.length; n > 0; n--) {
				const id = ids.splice(Math.floor(Math.random() * n), 1)[0];
				const pose = remotes.sample(id, clock);
				if (pose && !(pose.f & CRASHED)) return pose;
			}
			return null;
		},
		/** Throw a paper ball (only works online, with a short cooldown). */
		shoot(p: Vec, fwd: Vec, vel: Vec) {
			if (!link || link.id == null || cooldown > 0) return false;
			cooldown = SHOT.cooldown;
			const s = fire(p, fwd, vel);
			shots.push({ p: s.p, prev: [...s.p], v: s.v, age: 0, by: null });
			link.send({ t: "shot", p: s.p, v: s.v });
			return true;
		},
		/** Fixed step: move shots, check hits on you, send where you are. */
		step(dt: number, me: PlayerState, hittable: boolean) {
			clock += dt;
			cooldown = Math.max(0, cooldown - dt);
			shots = stepShots(shots, dt, world.groundAt, world.solidAt);
			if (!link) return;
			link.sendState(me, clock);
			if (!greeted) {
				const peer = this.randomPeer();
				if (peer) {
					greeted = true;
					events.onFirstPeer(peer);
				}
			}
			if (!hittable) return;
			const hit = shots.find(
				(s) => s.by !== null && segmentHits(s.prev, s.p, me.p, SHOT.hitRadius),
			);
			if (hit && hit.by !== null) {
				shots = shots.filter((s) => s !== hit);
				link.send({ t: "hit", by: hit.by });
				events.onHit(hit.by);
			}
		},
		/** Draw other players and the balls in flight. */
		render(time: number) {
			for (const id of remotes.prune(clock)) drop(id);
			for (const id of [...remotes.ids()]) {
				const pose = remotes.sample(id, clock);
				if (!pose) continue;
				const r = remote(id);
				if (pose.type !== r.type && pose.type in PLANES) {
					r.type = pose.type;
					r.model.setType(pose.type as PlaneId);
				}
				const crashed = (pose.f & CRASHED) !== 0;
				r.model.mesh.visible = !crashed;
				r.ball.visible = crashed;
				r.model.mesh.position.fromArray(pose.p);
				r.ball.position.fromArray(pose.p);
				r.model.mesh.quaternion.fromArray(pose.q);
				r.model.flutter(time, 0.6);
			}
			balls.count = Math.min(shots.length, MAX_SHOTS);
			for (let i = 0; i < balls.count; i++) {
				const s = shots[i];
				q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, s.age * 20);
				tmp.compose(at.fromArray(s.p), q, one);
				balls.setMatrixAt(i, tmp);
			}
			balls.instanceMatrix.needsUpdate = true;
		},
	};
}
