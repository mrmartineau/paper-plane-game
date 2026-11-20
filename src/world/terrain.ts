import * as THREE from "three";
import { config } from "../config";
import { addBarycentric, createPaperMaterial } from "../render/paperMaterial";
import type { HeightFn } from "./height";

// Phase 1: one big static flat-shaded mesh. Phase 2 replaces this with chunk.ts + chunkManager.ts.
const SAND = new THREE.Color(0xd9c9a3);
const GRASS = new THREE.Color(0x9fbf7f);
const ROCK = new THREE.Color(0x9a948a);
const SNOW = new THREE.Color(0xf4f1ea);

function colourAt(h: number, out: THREE.Color): THREE.Color {
	if (h < 4) return out.copy(SAND);
	if (h < 120) return out.copy(GRASS).lerp(ROCK, (h - 4) / 116);
	if (h < 200) return out.copy(ROCK);
	return out.copy(SNOW);
}

export function createTerrain(height: HeightFn): THREE.Mesh {
	const { terrainSize: size, terrainQuads: n } = config.world;
	const geo = new THREE.PlaneGeometry(size, size, n, n).toNonIndexed();
	geo.rotateX(-Math.PI / 2);

	const pos = geo.getAttribute("position") as THREE.BufferAttribute;
	for (let i = 0; i < pos.count; i++)
		pos.setY(i, height(pos.getX(i), pos.getZ(i)));

	// One colour per face, from the face's mean height: reads as cut paper.
	const colors = new Float32Array(pos.count * 3);
	const c = new THREE.Color();
	for (let i = 0; i < pos.count; i += 3) {
		colourAt((pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3, c);
		for (let j = 0; j < 3; j++) c.toArray(colors, (i + j) * 3);
	}
	geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
	geo.computeVertexNormals(); // non-indexed → per-face normals → flat shading
	addBarycentric(geo);

	const mesh = new THREE.Mesh(
		geo,
		createPaperMaterial({
			grainScale: config.paper.terrainGrainScale,
			vertexColors: true,
		}),
	);
	mesh.receiveShadow = true;
	return mesh;
}

export function createWater(): THREE.Mesh {
	const size = config.world.terrainSize;
	const geo = new THREE.PlaneGeometry(size, size).toNonIndexed();
	geo.rotateX(-Math.PI / 2);
	addBarycentric(geo);
	const mesh = new THREE.Mesh(
		geo,
		// No crease: the sea is one sheet, its diagonal shouldn't show.
		createPaperMaterial({
			grainScale: config.paper.terrainGrainScale,
			crease: 0,
			color: 0x8fb8c9,
		}),
	);
	mesh.position.y = config.world.seaLevel;
	mesh.receiveShadow = true;
	return mesh;
}
