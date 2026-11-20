// Every tunable lives here. Objects are mutable so the ?debug panel can edit them live.

export const config = {
	loop: {
		hz: 60,
		maxFrameDelta: 0.25, // seconds; clamps the jump after a long frame or tab switch
	},

	flight: {
		gravity: 9.81,
		// Arcade lift: liftCoeff * airspeed², capped at maxLift (m/s²).
		liftCoeff: 0.07,
		maxLift: 14,
		drag: 0.0035, // along-path deceleration = drag * airspeed²
		stallSpeed: 11.8, // below this lift fades out
		stallNoseDrop: 0.9, // rad/s the nose falls at full stall
		maxSink: 25, // m/s cap on the stall sink build-up
		glidePitch: -0.1, // rad; with no input (and upright) the nose relaxes here
		pitchStability: 0.4, // 1/s rate of that relax
		pitchRate: 1.6, // rad/s at full stick; high enough to loop
		rollRate: 2.4, // rad/s at full stick
		autoLevel: 1.2, // 1/s the wings return to level with no input
		inputSmoothing: 6, // 1/s stick smoothing
		turnCoeff: 0.045, // yaw rate = turnCoeff * sin(bank) * airspeed
		boost: 6, // m/s² forward push while boost is held
		maxSpeed: 60,
		clearance: 0.4, // metres above ground before it counts as a crash
	},

	// Rising (thermal) and sinking air columns.
	air: {
		cellSize: 384, // metres; each cell seeds 0..maxPerCell columns
		maxPerCell: 1,
		downChance: 0.35,
		upMin: 6, // m/s
		upMax: 10,
		downMin: 4,
		downMax: 7,
		radiusMin: 40,
		radiusMax: 75,
		core: 0.55, // share of the radius at full strength, then a smooth falloff to the edge
		topMin: 180, // metres above the column's base
		topMax: 320,
		// visuals
		visibleRange: 800,
		maxColumns: 16,
		particlesPerColumn: 160,
		particleSize: 1.8,
		columnOpacity: 0.09,
		spin: 0.25, // rad/s confetti swirl
	},

	// Trees, rocks, houses, arches, hoops, floating islands and mountains. Generated per cell as you fly.
	props: {
		propRange: 700, // metres; trees, rocks and houses load within this
		featureRange: 1100, // metres; arches, hoops, islands and floating mountains load within this
		cell: 32, // metres; tree/rock sub-cells inside each terrain chunk (densities are per biome, see biomes.ts)
		treeTries: 3, // candidate trees per sub-cell
		beach: 4, // no trees this close above sea level
		treeLine: 280, // no trees above this height (snow pines go higher than the old 150)
		maxSlope: 0.75,
		rockMin: 1.2,
		rockMax: 7,
		archCell: 384, // metres; at most one arch or ring per cell
		archChance: 0.6,
		archLane: 160, // metres kept clear of trees in front of and behind each arch
		hoopCell: 220, // metres; at most one hoop per cell
		hoopChance: 0.55,
		hoopRadiusMin: 10,
		hoopRadiusMax: 16,
		hoopTube: 0.09, // × radius
		poleChance: 0.4,
		poleMin: 15, // ring bottom above ground, for hoops on poles
		poleMax: 40,
		poleRadius: 0.5,
		floatMin: 50, // ring bottom above ground, for floating hoops
		floatMax: 160,
		hoopLane: 80,
		skyRockCell: 300, // metres; at most one floating rock cluster per cell
		skyRockChance: 0.7,
		skyRockMin: 6, // body radius, metres
		skyRockMax: 16,
		skyRockLiftMin: 50, // body above the ground
		skyRockLiftMax: 160,
		floaterCell: 700, // metres; at most one group of floating mountains per cell
		floaterChance: 0.65,
		floaterRadiusMin: 25, // metres
		floaterRadiusMax: 55,
		floaterLiftMin: 140, // top surface above the ground
		floaterLiftMax: 280,
		waterfallsMax: 2, // per floating mountain
		vinesMin: 6, // per big floating mountain
		vinesMax: 16,
		vineSway: 0.012, // rad (visual only, keep small: the collider doesn't sway)
		hoopBob: 0.6, // metres floating hoops bob up and down (visual only)
		ringChance: 0.35,
		archScaleMin: 0.8, // × 20m ring radius
		archScaleMax: 1.4,
		collisionFactor: 0.8, // colliders a bit smaller than the meshes, so near misses feel fair
	},

	// Global wind (drifts slowly) and ridge lift (wind blowing up a slope rises).
	wind: {
		min: 1.5, // m/s
		max: 6,
		drift: 0.004, // how fast direction and strength change (noise units per second)
		fullHeight: 120, // metres above the ground for full strength
		groundShare: 0.35, // share of the wind right at the ground
		ridgeGain: 1.6, // vertical m/s per (m/s of wind × slope)
		ridgeMax: 5, // m/s
		ridgeHeight: 90, // metres above the ground where ridge lift fades out
	},

	// Paper clouds: layered cut-outs that drift with the wind. Not solid.
	clouds: {
		cell: 520, // metres
		chance: 0.65,
		maxPerCell: 3,
		altitudeMin: 260, // metres above sea level
		altitudeMax: 480,
		sizeMin: 40, // metres wide
		sizeMax: 110,
		range: 1100,
	},

	// Courses: ring chains along a spline. Fly through the start gate to begin.
	courses: {
		region: 512, // metres (4×4 chunks); the seed decides if a region has a course
		chance: 0.45,
		pointsMin: 10, // spline control points
		pointsMax: 20,
		stepMin: 70, // metres between control points
		stepMax: 110,
		maxTurn: 0.6, // rad, per control point
		climbMax: 18, // metres up or down per control point
		heightMin: 25, // metres above the highest ground under each leg
		heightMax: 70,
		spacing: 85, // metres between rings along the path
		ringRadius: 8,
		gateRadius: 12,
		tube: 0.07, // × radius
		groundClearance: 4,
		minRings: 6,
		range: 1100, // metres; courses shown within this
		abandonDistance: 700, // metres from the next ring before a run is dropped
		abandonAfter: 12, // seconds that far away
		ghostInterval: 0.1, // seconds between ghost samples
		beaconHeight: 70, // metres; the tall striped ribbon above each start gate
	},

	// Paper birds: flocks on big circles, and a few circling in some thermals. Solid.
	birds: {
		flockCell: 640, // metres; at most one flock per cell
		flockChance: 0.6,
		flockMin: 4,
		flockMax: 7,
		flockRadiusMin: 120, // metres, circle they fly
		flockRadiusMax: 260,
		flockLiftMin: 30, // above the highest ground under the circle
		flockLiftMax: 110,
		flockSpeed: 11, // m/s
		flockSpacing: 9, // metres between birds in a line
		thermalChance: 0.5,
		thermalSpeed: 8, // m/s
		size: 3.2, // × a 1.3m wingspan bird; big paper birds are easier to spot (and dodge)
		hitRadius: 2.4, // metres
		flapSpeed: 9, // rad/s
	},

	boostTrail: {
		count: 60,
		rate: 28, // paper balls per second while boosting
		life: 1.6, // seconds
		size: 0.11, // ball radius, metres
		inherit: 0.8, // share of the plane's velocity the balls keep
		drop: 2, // m/s downward kick, so they fall below the camera's line
		spread: 1.2, // m/s random drift
		puff: 3, // m/s pushed out behind the plane
		gravity: 5, // m/s², light paper falls slowly
		drag: 1.2, // 1/s
		fovKick: 8, // degrees added while boosting
	},

	spawn: {
		altitude: 120, // metres above ground
		speed: 18,
	},

	crash: {
		ballGrow: 0.25, // seconds for the plane to scrunch into a ball
		rollTime: 2.4, // seconds the ball rolls before respawn
		foldTime: 0.7, // seconds for the new plane to unfold
		ballRadius: 0.35, // × plane scale
		carry: 0.55, // share of the plane's ground speed the ball keeps
		friction: 0.9, // 1/s
		slopeAccel: 9, // m/s² per unit slope, so it rolls downhill
		respawnBack: 40, // metres back along the heading
		respawnStep: 120, // metres further out for each ring of retries
		respawnTries: 32,
		respawnClear: 250, // metres of glide ahead that must be clear
	},

	world: {
		seed: "paper",
		seaLevel: 0,
		chunkSize: 128, // metres
		chunkQuads: 64, // quads per side at LOD0; LOD1 = 32, LOD2 = 16
		chunkRadius: 8, // chunks loaded around the player (quality tiers will set this)
		lod1Distance: 200, // metres from the player to the chunk's nearest point
		lod2Distance: 520,
		skirt: 12, // metres the chunk edges drop, hiding cracks between LODs
		buildBudgetMs: 6, // main-thread prop building allowed per frame
		workers: 2, // terrain-building Web Workers
		syncRange: 260, // after a jump, terrain nearer than this is built at once
		climateScale: 1 / 2600, // temperature and moisture noise
		lapseRate: 1 / 380, // temperature drop per metre of height (snow on peaks)
		cliffSlope: 0.72, // faces with normal.y below this show bare rock
		// height(): FBM + domain warp + ridged mountains
		baseScale: 1 / 900,
		baseAmplitude: 90,
		octaves: 5,
		lacunarity: 2,
		gain: 0.5,
		warpScale: 1 / 1400,
		warpAmount: 220,
		mountainScale: 1 / 2400,
		ridgeScale: 1 / 700,
		ridgeAmplitude: 260,
		baseOffset: 18,
	},

	// ?bench autopilot (Phase 2 check: long straight flight, no hitches, flat memory)
	bench: {
		minutes: 10,
		warmup: 5, // seconds ignored at the start while the world loads
		altitude: 150, // metres above the ground the autopilot holds
	},

	camera: {
		distance: 4.2,
		height: 1.1,
		lookAhead: 6,
		positionLerp: 6, // 1/s
		rotationLerp: 8, // 1/s
		upLerp: 3, // 1/s camera roll follows the plane in loops
		airLag: 0.15, // m of camera drop per m/s of rising air, so you see the plane lift
		fovMin: 60,
		fovMax: 75,
		fovSpeedMin: 14, // airspeed at fovMin
		fovSpeedMax: 40, // airspeed at fovMax
		groundMargin: 1.5,
		near: 0.1,
		far: 3000,
	},

	plane: {
		scale: 1.25,
		flutterAmp: 0.04,
		flutterFreq: 22, // Hz-ish
		flutterSpeedRef: 30, // airspeed at full flutter
		turbulence: 0.012, // rad of shake per m/s of rising or sinking air
	},

	input: {
		mouseSensitivity: 0.004, // stick units per pixel
		mouseRecenter: 1.5, // 1/s stick returns to centre
		invertPitch: false,
	},

	render: {
		maxPixelRatio: 2,
		fogNear: 420,
		fogFar: 1000, // just inside the terrain range (chunkRadius × chunkSize), so the edge is hidden
		skyColor: 0xcfe3ea, // horizon and fog
		zenithColor: 0x8db7d6,
		sunColor: 0xfff4e0,
		sunIntensity: 2.2,
		ambientIntensity: 1.1,
		shadowMapSize: 2048,
		shadowExtent: 60, // metres around the plane
	},

	paper: {
		grain: 0.14, // fibre/grain contrast
		mottle: 0.08, // large soft blotches
		jitter: 0.08, // per-face brightness variation
		crease: 0.2, // darkening along triangle edges
		terrainGrainScale: 0.7, // grain cycles per metre on the land
		planeGrainScale: 22, // per model unit on the plane and ball
	},
};

export type Config = typeof config;
