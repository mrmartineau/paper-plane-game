import * as THREE from "three";
import { config } from "../config";

// MeshLambertMaterial + paper: triplanar fibre grain, soft mottling, per-face
// brightness jitter, and faint crease lines along triangle edges.
// Geometry must be non-indexed and have a `bary` attribute (see addBarycentric).

export function addBarycentric(
	geo: THREE.BufferGeometry,
): THREE.BufferGeometry {
	const n = geo.getAttribute("position").count;
	const bary = new Float32Array(n * 3);
	for (let i = 0; i < n; i++) bary[i * 3 + (i % 3)] = 1;
	geo.setAttribute("bary", new THREE.BufferAttribute(bary, 3));
	return geo;
}

interface PaperOptions extends THREE.MeshLambertMaterialParameters {
	/** Grain cycles per unit. */
	grainScale: number;
	/** Object space keeps the grain stuck to moving meshes (the plane). */
	objectSpace?: boolean;
	crease?: number;
}

export function createPaperMaterial({
	grainScale,
	objectSpace = false,
	crease,
	...params
}: PaperOptions) {
	const m = new THREE.MeshLambertMaterial(params);
	const p = config.paper;

	m.onBeforeCompile = (shader) => {
		shader.uniforms.uGrainScale = { value: grainScale };
		shader.uniforms.uGrain = { value: p.grain };
		shader.uniforms.uMottle = { value: p.mottle };
		shader.uniforms.uJitter = { value: p.jitter };
		shader.uniforms.uCrease = { value: crease ?? p.crease };

		shader.vertexShader = shader.vertexShader
			.replace(
				"#include <common>",
				`#include <common>
attribute vec3 bary;
varying vec3 vBary;
varying vec3 vPaperPos;
varying vec3 vPaperNormal;`,
			)
			.replace(
				"#include <begin_vertex>",
				`#include <begin_vertex>
vBary = bary;
${
	objectSpace
		? `vPaperPos = transformed;
vPaperNormal = objectNormal;`
		: `vec4 paperWorld = vec4(transformed, 1.0);
vec3 paperNormal = objectNormal;
#ifdef USE_INSTANCING
paperWorld = instanceMatrix * paperWorld;
paperNormal = mat3(instanceMatrix) * paperNormal;
#endif
vPaperPos = (modelMatrix * paperWorld).xyz;
vPaperNormal = mat3(modelMatrix) * paperNormal;`
}`,
			);

		shader.fragmentShader = shader.fragmentShader
			.replace(
				"#include <common>",
				`#include <common>
varying vec3 vBary;
varying vec3 vPaperPos;
varying vec3 vPaperNormal;
uniform float uGrainScale, uGrain, uMottle, uJitter, uCrease;

float pHash(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}
float pNoise(vec2 p) {
	vec2 i = floor(p), f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(pHash(i), pHash(i + vec2(1, 0)), f.x), mix(pHash(i + vec2(0, 1)), pHash(i + vec2(1, 1)), f.x), f.y);
}
// Grain with stretched octaves so it reads as fibres, not sand.
float pGrain(vec2 q) {
	return pNoise(q) * 0.4 + pNoise(q * vec2(1.7, 7.3) + 3.1) * 0.35 + pNoise(q * 4.9 + 1.7) * 0.25;
}
float pTri(vec3 p, vec3 n) {
	vec3 w = abs(n);
	w /= (w.x + w.y + w.z + 1e-4);
	return pGrain(p.yz) * w.x + pGrain(p.xz) * w.y + pGrain(p.xy) * w.z;
}`,
			)
			.replace(
				"#include <color_fragment>",
				`#include <color_fragment>
{
	vec3 n = normalize(vPaperNormal);
	vec3 gp = vPaperPos * uGrainScale;
	// Fade fine detail where it would shimmer (far away / tiny on screen).
	float detail = 1.0 - smoothstep(0.4, 1.4, length(fwidth(gp)));
	float grain = mix(0.5, pTri(gp, n), detail);
	float mottle = pTri(gp * 0.08, n);
	float face = pHash(n.xz * 91.7 + n.y * 13.3); // flat normal → one value per face
	float e = min(min(vBary.x, vBary.y), vBary.z);
	float fw = fwidth(e);
	float edge = (1.0 - smoothstep(0.0, fw * 1.5, e)) * (1.0 - smoothstep(0.04, 0.25, fw));
	diffuseColor.rgb *= 1.0 + (grain - 0.5) * uGrain + (mottle - 0.5) * uMottle + (face - 0.5) * uJitter - edge * uCrease;
}`,
			);
	};
	m.customProgramCacheKey = () =>
		objectSpace ? "paper-object" : "paper-world";
	return m;
}
