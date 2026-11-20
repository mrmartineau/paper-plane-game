import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { config } from "../config";
import { rngFor } from "../core/rng";
import { buildChunk, type ChunkArrays } from "../world/chunk";
import type { ClimateFn, HeightFn } from "../world/height";
import type { Features, Waterfall } from "../world/props";
import { createChunkWorkers } from "./chunkWorkers";
import { addBarycentric, createPaperMaterial } from "./paperMaterial";
import { createStreamer, type StreamLayer } from "./streamer";
import { bake, type Placement, templates } from "./templates";

// The streamed world: terrain chunks (with LOD) and the static props in each cell,
// baked into one mesh per cell. Animated things (hoops, vines, birds) are pooled elsewhere.

export function createWorldMeshes(
	scene: THREE.Scene,
	seed: string,
	features: Features,
	height: HeightFn,
	climate: ClimateFn,
) {
	const w = config.world;
	const p = config.props;
	const t = templates();

	const terrainMaterial = createPaperMaterial({
		grainScale: config.paper.terrainGrainScale,
		vertexColors: true,
		side: THREE.DoubleSide, // skirts face either way
	});
	const propMaterial = createPaperMaterial({
		grainScale: config.paper.terrainGrainScale * 2,
		vertexColors: true,
	});
	const floaterMaterial = createPaperMaterial({
		grainScale: config.paper.terrainGrainScale,
		vertexColors: true,
		side: THREE.DoubleSide,
	});
	const waterfall = createWaterfallMaterial();

	const mesh = (
		geo: THREE.BufferGeometry | null,
		material: THREE.Material,
		castShadow = true,
	) => {
		if (!geo) return null;
		const m = new THREE.Mesh(geo, material);
		m.castShadow = castShadow;
		m.receiveShadow = true;
		return m;
	};

	const workers = createChunkWorkers(seed);
	const terrainMesh = ({ position, color }: ChunkArrays, lod: number) => {
		const geo = new THREE.BufferGeometry();
		geo.setAttribute("position", new THREE.BufferAttribute(position, 3));
		geo.setAttribute("color", new THREE.BufferAttribute(color, 3));
		geo.computeVertexNormals();
		geo.computeBoundingSphere();
		return mesh(addBarycentric(geo), terrainMaterial, lod === 0);
	};

	const layers: StreamLayer[] = [
		{
			cellSize: w.chunkSize,
			get range() {
				return w.chunkRadius * w.chunkSize; // live: quality tiers change it
			},
			lod: (d) => (d < w.lod1Distance ? 0 : d < w.lod2Distance ? 1 : 2),
			build: (cx, cz, lod) =>
				terrainMesh(buildChunk(cx, cz, lod, height, climate, w), lod),
			buildAsync: async (cx, cz, lod) =>
				terrainMesh(await workers.build(cx, cz, lod), lod),
			maxInFlight: 8,
			syncRange: w.syncRange,
		},
		{
			cellSize: w.chunkSize,
			get range() {
				return p.propRange;
			},
			build(cx, cz) {
				const c = features.groundCell(cx, cz);
				const items: Placement[] = [
					...c.trees.map((tr) => ({
						geo: t.trees[tr.kind],
						x: tr.x,
						y: tr.y,
						z: tr.z,
						yaw: tr.yaw,
						sx: tr.s,
						tint: tr.tint,
					})),
					...c.rocks.map((r) => ({
						geo: t.rock,
						x: r.x,
						y: r.y,
						z: r.z,
						yaw: r.yaw,
						sx: r.sx,
						sy: r.sy,
						sz: r.sz,
						tint: r.tint,
					})),
					...c.houses.map((h) => ({
						geo: t.houses[h.roof % t.houses.length],
						x: h.x,
						y: h.y,
						z: h.z,
						yaw: h.yaw,
						sx: h.s,
					})),
				];
				return mesh(bake(items), propMaterial);
			},
		},
		{
			cellSize: p.archCell,
			get range() {
				return p.featureRange;
			},
			build(cx, cz) {
				const a = features.archCell(cx, cz).arch;
				if (!a) return null;
				return mesh(
					bake([
						{
							geo: a.kind === "arch" ? t.arch : t.ring,
							x: a.x,
							y: a.y,
							z: a.z,
							yaw: a.yaw,
							sx: a.s,
						},
					]),
					propMaterial,
				);
			},
		},
		{
			// Hoop poles are static; the rings themselves are pooled (they bob and light up).
			cellSize: p.hoopCell,
			get range() {
				return p.featureRange;
			},
			build(cx, cz) {
				const h = features.hoopCell(cx, cz).hoop;
				if (h?.kind !== "pole") return null;
				const r = p.poleRadius;
				return mesh(
					bake([
						{
							geo: t.pole,
							x: h.x,
							y: h.base - 0.5,
							z: h.z,
							yaw: 0,
							sx: r,
							sy: h.y - h.R - h.base + 0.5,
							sz: r,
						},
					]),
					propMaterial,
				);
			},
		},
		{
			cellSize: p.skyRockCell,
			get range() {
				return p.featureRange;
			},
			build(cx, cz) {
				const c = features.skyCell(cx, cz);
				return mesh(
					bake(
						c.rocks.map((k) => ({
							geo: t.skyRock,
							x: k.x,
							y: k.y,
							z: k.z,
							yaw: k.yaw,
							sx: k.s,
							tint: k.tint,
						})),
					),
					propMaterial,
				);
			},
		},
		{
			cellSize: p.floaterCell,
			get range() {
				return p.featureRange;
			},
			build(cx, cz) {
				const c = features.floaterCell(cx, cz);
				if (c.floaters.length === 0) return null;
				const group = new THREE.Group();
				const bodies = mesh(
					bake(
						c.floaters.map((f) => ({
							geo: t.floater,
							x: f.x,
							y: f.y,
							z: f.z,
							yaw: f.yaw,
							sx: f.R,
							sy: f.H,
							sz: f.R,
							tint: f.tint,
						})),
					),
					floaterMaterial,
				);
				const trees = mesh(
					bake(
						c.trees.map((tr) => ({
							geo: t.trees[tr.kind],
							x: tr.x,
							y: tr.y,
							z: tr.z,
							yaw: tr.yaw,
							sx: tr.s,
							tint: tr.tint,
						})),
					),
					propMaterial,
				);
				const falls = waterfallMesh(c.waterfalls, waterfall.material);
				for (const o of [bodies, trees, falls]) if (o) group.add(o);
				return group;
			},
		},
	];

	const streamer = createStreamer(scene, layers);
	return {
		update(px: number, pz: number, time: number, budgetMs: number) {
			waterfall.flow.offset.y = time * 0.45; // water runs down the sheets
			return streamer.update(px, pz, budgetMs);
		},
	};
}

// --- Waterfalls: streaky paper sheets that scroll and fade out at the bottom ---

function createWaterfallMaterial() {
	const flow = canvasTexture(64, 256, (ctx) => {
		ctx.fillStyle = "#e4f2f8";
		ctx.fillRect(0, 0, 64, 256);
		const rand = rngFor("waterfall");
		for (let i = 0; i < 70; i++) {
			ctx.fillStyle = rand() < 0.6 ? "#ffffff" : "#9cc8e0";
			ctx.fillRect(
				Math.floor(rand() * 64),
				Math.floor(rand() * 256),
				2 + Math.floor(rand() * 6),
				20 + rand() * 70,
			);
		}
	});
	flow.wrapS = flow.wrapT = THREE.RepeatWrapping;
	flow.repeat.set(2, 3);
	flow.colorSpace = THREE.SRGBColorSpace;
	const fade = canvasTexture(1, 128, (ctx) => {
		const g = ctx.createLinearGradient(0, 0, 0, 128);
		g.addColorStop(0, "#fff");
		g.addColorStop(0.6, "#eee");
		g.addColorStop(1, "#000");
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, 1, 128);
	});
	const material = new THREE.MeshBasicMaterial({
		map: flow,
		alphaMap: fade,
		transparent: true,
		depthWrite: false,
		side: THREE.DoubleSide,
	});
	return { material, flow };
}

function canvasTexture(
	width: number,
	height: number,
	draw: (ctx: CanvasRenderingContext2D) => void,
) {
	const cv = document.createElement("canvas");
	cv.width = width;
	cv.height = height;
	const ctx = cv.getContext("2d");
	if (ctx) draw(ctx);
	return new THREE.CanvasTexture(cv);
}

/** Unit sheet from y = 0 down to y = -1, bowing outward (+Z) as it falls. */
const sheet = (() => {
	const g = new THREE.PlaneGeometry(1, 1, 1, 10).translate(0, -0.5, 0);
	const pos = g.getAttribute("position");
	for (let i = 0; i < pos.count; i++) pos.setZ(i, 6 * Math.sqrt(-pos.getY(i)));
	return g;
})();

function waterfallMesh(
	falls: Waterfall[],
	material: THREE.Material,
): THREE.Mesh | null {
	if (falls.length === 0) return null;
	const m = new THREE.Matrix4();
	const q = new THREE.Quaternion();
	const up = new THREE.Vector3(0, 1, 0);
	const geos = falls.map((f) =>
		sheet
			.clone()
			.applyMatrix4(
				m.compose(
					new THREE.Vector3(f.x, f.y, f.z),
					q.setFromAxisAngle(up, f.yaw),
					new THREE.Vector3(f.width, f.length, 1),
				),
			),
	);
	const merged = mergeGeometries(geos);
	for (const g of geos) g.dispose();
	return new THREE.Mesh(merged, material);
}
