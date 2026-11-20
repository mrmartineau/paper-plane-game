import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { config } from "../config";
import { rngFor } from "../core/rng";
import { buildChunk, type ChunkArrays } from "../world/chunk";
import type { ClimateFn, HeightFn } from "../world/height";
import {
	type Features,
	type Pad,
	SHAPES,
	type Waterfall,
} from "../world/props";
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
	const padMaterials = createPadMaterials();
	const lanternMaterial = new THREE.MeshLambertMaterial({
		vertexColors: true,
		emissive: 0xff9a3c,
		emissiveIntensity: 0,
	});

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
				const props = mesh(bake(items), propMaterial);
				// A lantern by each house door; it glows at night.
				const hs = SHAPES.house;
				const lanterns = mesh(
					bake(
						c.houses.map((h) => {
							const out = (hs.d / 2 + 0.35) * h.s;
							return {
								geo: t.lantern,
								x: h.x + Math.sin(h.yaw) * out,
								y: h.y + hs.h * 0.7 * h.s,
								z: h.z + Math.cos(h.yaw) * out,
								yaw: h.yaw,
								sx: h.s,
							};
						}),
					),
					lanternMaterial,
					false,
				);
				if (!lanterns) return props;
				const group = new THREE.Group();
				if (props) group.add(props);
				group.add(lanterns);
				return group;
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
				const rocks = mesh(
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
				if (c.rocks.length === 0) return rocks;
				const group = new THREE.Group();
				if (rocks) group.add(rocks);
				for (const o of padMeshes(
					c.pads,
					padMaterials,
					t.lantern,
					lanternMaterial,
				))
					group.add(o);
				return group;
			},
		},
		{
			cellSize: p.cityCell,
			get range() {
				return p.featureRange;
			},
			build(cx, cz) {
				const c = features.cityCell(cx, cz);
				if (c.buildings.length === 0) return null;
				const walls: Placement[] = [];
				const windows: Placement[] = [];
				for (const b of c.buildings) {
					const at = {
						x: b.x,
						y: b.base,
						z: b.z,
						yaw: b.yaw,
						sx: b.w,
						sy: b.h,
						sz: b.d,
					};
					if (b.kind === "slab") {
						walls.push({ geo: t.slab, ...at });
						continue;
					}
					const k = b.h < 45 ? 0 : b.h < 110 ? 1 : 2;
					walls.push({ geo: t.towers[k].walls, ...at, tint: b.tint });
					windows.push({ geo: t.towers[k].windows, ...at });
					// Tall towers get a narrower crown.
					if (b.h > 70)
						walls.push({
							geo: t.slab,
							...at,
							y: b.base + b.h,
							sx: b.w * 0.6,
							sy: b.h * 0.1,
							sz: b.d * 0.6,
							tint: b.tint * 0.9,
						});
				}
				const group = new THREE.Group();
				const wallMesh = mesh(bake(walls), propMaterial);
				const glass = mesh(bake(windows), lanternMaterial, false); // lantern material: windows glow at night
				if (wallMesh) group.add(wallMesh);
				if (glass) group.add(glass);
				return group;
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
				for (const o of padMeshes(
					c.pads,
					padMaterials,
					t.lantern,
					lanternMaterial,
				))
					group.add(o);
				return group;
			},
		},
	];

	const streamer = createStreamer(scene, layers);
	return {
		/** 0 = day, 1 = night: lanterns glow up as it gets dark. */
		setNight(night: number) {
			lanternMaterial.emissiveIntensity = night * config.dayNight.lanternGlow;
		},
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

// --- Landing pads: paper runways on floating mountains, helipads on small islands ---

const INK = "#3d4a50";
const CARD = "#f2ece0";

function createPadMaterials() {
	const runway = canvasTexture(128, 1024, (ctx) => {
		ctx.fillStyle = CARD;
		ctx.fillRect(0, 0, 128, 1024);
		ctx.fillStyle = INK;
		ctx.fillRect(4, 0, 4, 1024); // edge lines
		ctx.fillRect(120, 0, 4, 1024);
		for (let y = 150; y < 874; y += 70) ctx.fillRect(60, y, 8, 40); // centre dashes
		for (const end of [0, 1]) {
			// threshold bars and an arrow pointing in
			const y0 = end ? 1024 - 70 : 20;
			for (let x = 16; x < 112; x += 16) ctx.fillRect(x, y0, 9, 50);
			ctx.beginPath();
			const tip = end ? 860 : 164;
			const base = end ? 900 : 124;
			ctx.moveTo(64, tip);
			ctx.lineTo(40, base);
			ctx.lineTo(88, base);
			ctx.fill();
		}
	});
	runway.colorSpace = THREE.SRGBColorSpace;
	runway.anisotropy = 4;
	const helipad = canvasTexture(256, 256, (ctx) => {
		ctx.fillStyle = CARD;
		ctx.beginPath();
		ctx.arc(128, 128, 126, 0, Math.PI * 2);
		ctx.fill();
		ctx.strokeStyle = "#e8745a";
		ctx.lineWidth = 12;
		ctx.beginPath();
		ctx.arc(128, 128, 112, 0, Math.PI * 2);
		ctx.stroke();
		ctx.fillStyle = INK;
		ctx.fillRect(84, 70, 22, 116); // H
		ctx.fillRect(150, 70, 22, 116);
		ctx.fillRect(84, 117, 88, 22);
	});
	helipad.colorSpace = THREE.SRGBColorSpace;
	const mat = (map: THREE.Texture) =>
		new THREE.MeshLambertMaterial({
			map,
			transparent: true,
			alphaTest: 0.5,
			polygonOffset: true,
			polygonOffsetFactor: -2,
		});
	return { runway: mat(runway), helipad: mat(helipad) };
}

/** Markings + edge lights for the pads in one cell. Lights use the lantern material, so they glow at night. */
function padMeshes(
	pads: Pad[],
	materials: ReturnType<typeof createPadMaterials>,
	lantern: THREE.BufferGeometry,
	lanternMaterial: THREE.Material,
): THREE.Object3D[] {
	const out: THREE.Object3D[] = [];
	const lights: Placement[] = [];
	const width = config.props.runwayWidth;
	for (const pad of pads) {
		const runway = pad.kind === "runway";
		const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
		const m = new THREE.Mesh(
			geo,
			runway ? materials.runway : materials.helipad,
		);
		m.position.set(pad.x, pad.y + 0.06, pad.z);
		m.rotation.y = pad.yaw;
		if (runway) m.scale.set(width, 1, pad.length);
		else m.scale.set(pad.r * 1.7, 1, pad.r * 1.7);
		m.receiveShadow = true;
		out.push(m);
		const c = Math.cos(pad.yaw);
		const s = Math.sin(pad.yaw);
		if (runway) {
			for (let d = -pad.length / 2; d <= pad.length / 2; d += 12) {
				for (const side of [-1, 1]) {
					const lx = side * (width / 2 + 0.8);
					// local (lx, d) → world, rotating by yaw like the mesh
					lights.push({
						geo: lantern,
						x: pad.x + c * lx + s * d,
						y: pad.y + 0.3,
						z: pad.z - s * lx + c * d,
						yaw: pad.yaw,
						sx: 0.7,
					});
				}
			}
		} else {
			for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
				lights.push({
					geo: lantern,
					x: pad.x + Math.cos(a) * pad.r * 0.9,
					y: pad.y + 0.3,
					z: pad.z + Math.sin(a) * pad.r * 0.9,
					yaw: 0,
					sx: 0.6,
				});
			}
		}
	}
	const lit = bake(lights);
	if (lit) out.push(new THREE.Mesh(lit, lanternMaterial));
	return out;
}
