import type * as THREE from "three";
import { config } from "../config";
import { isTouchDevice, type Quality } from "../core/settings";

// Quality tiers. A tier writes its numbers into config (view distance, fog, shadows,
// pixel ratio, clouds, prop density), so streaming picks them up straight away.
// In "auto", slow frames step the pixel ratio down, then the tier.

export type Tier = "low" | "medium" | "high";
const ORDER: Tier[] = ["low", "medium", "high"];

/** A first guess from the device. */
export function detectTier(): Tier {
	const cores = navigator.hardwareConcurrency || 4;
	if (isTouchDevice()) return cores >= 8 ? "medium" : "low";
	return cores >= 8 ? "high" : "medium";
}

export function createQuality(
	renderer: THREE.WebGLRenderer,
	sun: THREE.DirectionalLight,
	scene: THREE.Scene,
) {
	let tier: Tier = "high";
	let pixelRatio = 1;
	let auto = true;
	const window: number[] = [];
	let slowFor = 0;
	let judgeAfter = config.quality.warmup;
	let clock = 0;
	let lastCheck = 0;

	function apply(t: Tier) {
		tier = t;
		const q = config.quality.tiers[t];
		config.world.chunkRadius = q.chunkRadius;
		config.render.fogNear = q.fogNear;
		config.render.fogFar = q.fogFar;
		config.props.propRange = q.propRange;
		config.props.featureRange = q.featureRange;
		config.courses.range = q.featureRange;
		config.clouds.range = q.featureRange;
		config.air.visibleRange = Math.min(800, q.featureRange);
		config.clouds.chance = q.cloudChance;
		config.props.treeTries = q.treeTries;
		config.render.maxPixelRatio = q.maxPixelRatio;
		const fog = scene.fog as THREE.Fog | null;
		if (fog) {
			fog.near = q.fogNear;
			fog.far = q.fogFar;
		}
		if (sun.shadow.mapSize.x !== q.shadowMapSize) {
			sun.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
			sun.shadow.map?.dispose();
			sun.shadow.map = null; // Three rebuilds it at the new size
		}
		setPixelRatio(Math.min(devicePixelRatio, q.maxPixelRatio));
	}

	function setPixelRatio(r: number) {
		pixelRatio = r;
		renderer.setPixelRatio(r);
		renderer.setSize(innerWidth, innerHeight);
	}

	return {
		get tier() {
			return tier;
		},
		/** Use a saved choice, or detect for "auto". */
		set(choice: Quality) {
			auto = choice === "auto";
			apply(choice === "auto" ? detectTier() : choice);
			judgeAfter = clock + config.quality.warmup;
		},
		/** Don't judge frames for a while (after a jump, the world reloads). */
		hold() {
			judgeAfter = clock + config.quality.warmup;
		},
		/** Feed every frame's time. Steps down in auto mode when frames stay slow. */
		frame(ms: number) {
			clock += ms / 1000;
			if (!auto || clock < judgeAfter) return;
			window.push(ms);
			if (window.length > 240) window.shift();
			if (clock - lastCheck < 1) return;
			lastCheck = clock;
			const sorted = [...window].sort((a, b) => a - b);
			const p90 = sorted[Math.floor(sorted.length * 0.9)] ?? 0;
			slowFor = p90 > config.quality.slowFrameMs ? slowFor + 1 : 0;
			if (slowFor < config.quality.slowFor) return;
			slowFor = 0;
			window.length = 0;
			judgeAfter = clock + 2;
			if (pixelRatio > config.quality.minPixelRatio + 0.01) {
				setPixelRatio(
					Math.max(config.quality.minPixelRatio, pixelRatio * 0.75),
				);
			} else if (tier !== "low") {
				apply(ORDER[ORDER.indexOf(tier) - 1]);
			}
		},
	};
}
