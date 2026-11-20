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
		glidePitch: -0.1, // rad; with no pitch input the nose relaxes here
		pitchStability: 0.4, // 1/s rate of that relax
		pitchRate: 1.1, // rad/s at full stick
		rollRate: 2.0, // rad/s at full stick
		maxPitch: 1.1, // rad, clamp so the plane never loops or spins
		maxRoll: 1.1, // rad
		autoLevel: 1.2, // 1/s roll returns to level with no roll input
		inputSmoothing: 6, // 1/s stick smoothing
		turnCoeff: 0.045, // yaw rate = turnCoeff * sin(roll) * airspeed
		boost: 4, // m/s² forward push while boost is held
		maxSpeed: 60,
		clearance: 0.4, // metres above ground before it counts as a crash
	},

	spawn: {
		altitude: 120, // metres above ground
		speed: 18,
	},

	crash: {
		crumpleTime: 0.9, // seconds
		foldTime: 0.7, // seconds
		respawnBack: 40, // metres back along the heading
	},

	world: {
		seed: "paper",
		seaLevel: 0,
		terrainSize: 4096, // metres, phase 1 single static mesh
		terrainQuads: 320,
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

	camera: {
		distance: 7,
		height: 2.2,
		lookAhead: 6,
		positionLerp: 5, // 1/s
		rotationLerp: 8, // 1/s
		fovMin: 60,
		fovMax: 75,
		fovSpeedMin: 14, // airspeed at fovMin
		fovSpeedMax: 40, // airspeed at fovMax
		groundMargin: 1.5,
		near: 0.1,
		far: 3000,
	},

	plane: {
		scale: 1,
		flutterAmp: 0.04,
		flutterFreq: 22, // Hz-ish
		flutterSpeedRef: 30, // airspeed at full flutter
	},

	input: {
		mouseSensitivity: 0.004, // stick units per pixel
		mouseRecenter: 1.5, // 1/s stick returns to centre
		invertPitch: false,
	},

	render: {
		maxPixelRatio: 2,
		fogNear: 400,
		fogFar: 1800,
		skyColor: 0xcfe3ea,
		sunColor: 0xfff4e0,
		sunIntensity: 2.2,
		ambientIntensity: 1.1,
		shadowMapSize: 2048,
		shadowExtent: 60, // metres around the plane
	},
};

export type Config = typeof config;
