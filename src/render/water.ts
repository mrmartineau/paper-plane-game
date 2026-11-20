import * as THREE from "three";
import { config } from "../config";
import { addBarycentric, createPaperMaterial } from "./paperMaterial";

// The sea: three stacked translucent paper sheets that bob gently.
// They follow the player (snapped to a grid) so they always reach the fog.

const SHEETS = [
	{ color: 0x8fb8c9, opacity: 1, y: -1.2, bob: 0.25 },
	{ color: 0xa8cad8, opacity: 0.55, y: -0.6, bob: 0.45 },
	{ color: 0xc6e0ea, opacity: 0.35, y: 0, bob: 0.65 },
];

export function createWater(scene: THREE.Scene) {
	const size = config.render.fogFar * 2.4;
	const time = { value: 0 };
	const geo = addBarycentric(
		new THREE.PlaneGeometry(size, size, 64, 64)
			.rotateX(-Math.PI / 2)
			.toNonIndexed(),
	);
	geo.computeVertexNormals();
	const sheets = SHEETS.map((s, i) => {
		const mesh = new THREE.Mesh(
			geo,
			createPaperMaterial({
				grainScale: config.paper.terrainGrainScale,
				crease: 0,
				color: s.color,
				transparent: s.opacity < 1,
				opacity: s.opacity,
				depthWrite: s.opacity === 1,
				bob: { amount: s.bob, time },
			}),
		);
		mesh.receiveShadow = true;
		mesh.renderOrder = i; // bottom sheet first
		scene.add(mesh);
		return { mesh, y: s.y };
	});

	return {
		update(px: number, pz: number, t: number) {
			time.value = t;
			const snap = 64;
			for (const s of sheets)
				s.mesh.position.set(
					Math.round(px / snap) * snap,
					config.world.seaLevel + s.y,
					Math.round(pz / snap) * snap,
				);
		},
	};
}
