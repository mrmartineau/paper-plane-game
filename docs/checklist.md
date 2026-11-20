# Paper Plane: build checklist

Tracks [paper-plane-game-plan.md](./paper-plane-game-plan.md). Tick items as they land.

## Phase 1: flight feel

- [x] Vite + TS (strict) + Three scaffold (React template removed)
- [x] Bun as package manager, Biome for lint/format, Vitest
- [x] Game loop: fixed 60Hz + accumulator, interpolated render, delta clamp, pause on `visibilitychange` (`src/core/loop.ts`)
- [x] Origami plane model, 6 triangles, two-tone paper (`src/plane/model.ts`)
- [x] Wing-tip flutter scaled with speed
- [x] Chase cam: lerp position, slerp rotation (`src/camera/chaseCam.ts`)
- [x] `height(x, z)`: FBM (5 octaves) + domain warp + ridged layer behind a mountain mask (`src/world/height.ts`)
- [x] Single static terrain mesh, flat shaded, coloured by height (`src/world/terrain.ts`)
- [x] Flight model, pure (`src/plane/flight.ts`): roll/pitch input with smoothing, auto-level, bank turns, lift capped, speed/height trade, drag ∝ v², gentle stall
- [x] Keyboard input (WASD / arrows, Space = boost)
- [x] Mouse input (pointer lock, relative stick that re-centres, left button = boost)
- [x] Crash → crumple → respawn nearby → fold open (`src/plane/crash.ts`)
- [x] lil-gui dev panel behind `?debug`, with live telemetry (`src/debug.ts`)
- [x] Unit tests: steady glide, stall recovery, dive/climb, bank + auto-level, limits, crash; height determinism
- [ ] **Feel review (you):** gliding, turning, diving and climbing feel good for 5 minutes

Pulled forward because they were one-liners: sun shadow that follows the plane, fog, flat water at sea level, FOV widens with speed, camera stays above terrain.

## Phase 2: endless papercraft world

- [ ] `rng.ts`: `hash(seed, cx, cz)`
- [ ] Chunk geometry (128m, 64×64 quads) + skirts
- [ ] Chunk streaming around the player, N builds per frame
- [ ] LOD: 64 / 32 / 16 quads by distance
- [ ] Disposal on unload, check `renderer.info`
- [ ] `biome(x, z)`: temperature + moisture + height → meadow, forest, desert, snow, water
- [ ] Biome vertex colour blending
- [ ] Paper material: grain, crease darkening, per-face jitter
- [ ] Sky
- [ ] Instanced props: trees, rocks, houses
- [ ] Water sheets that bob
- [ ] Determinism test for chunk heights and props
- [ ] **Done when:** 10 min straight flight, no hitch > 50ms, flat memory

## Phase 3: air and atmosphere

- [ ] Wind: global vector, slow drift
- [ ] Thermals: 0–2 per chunk, seeded, biome-weighted
- [ ] Thermal visual cues: circling birds, rising confetti
- [ ] Ridge lift
- [ ] Paper clouds
- [x] Camera FOV with speed
- [x] Camera terrain avoidance
- [ ] **Done when:** you can stay up indefinitely on thermals and find them by sight

## Phase 4: courses

- [ ] Course generation per 4×4-chunk region (Catmull-Rom spline, 10–20 points)
- [ ] Ring meshes + segment-vs-disc pass detection (tested)
- [ ] Start gate (big, flagged, visible from far)
- [ ] Timer + course HUD (time, rings, ghost delta)
- [ ] `storage.ts` + best times
- [ ] Ghost record (100ms) / playback, keyed `seed:courseId`
- [ ] **Done when:** every seed has several findable courses, finishing saves a raceable ghost

## Phase 5: mobile

- [ ] Touch virtual stick
- [ ] Tilt input, iOS permission, neutral calibration, stick fallback
- [ ] Gamepad left stick
- [ ] Quality tiers (low / medium / high) + startup benchmark
- [ ] Adaptive resolution (p90 > 20ms for 3s)
- [ ] Chunk generation in a Web Worker
- [ ] Pause menu + settings (quality, controls, invert, sensitivity, audio)
- [ ] **Done when:** 60fps recent iPhone (medium), 30fps+ mid Android (low), both control schemes feel good

## Phase 6: polish

- [ ] Day/night cycle + paper lanterns
- [ ] Audio: wind, rustle, ring chime, crumple
- [ ] Photo mode (orbit cam, PNG save)
- [ ] Seed sharing (`?seed=` is already read; add copy link + new seed)
- [ ] PWA manifest
- [ ] `?bench` scripted flight with frame-time stats
- [ ] Deploy to Cloudflare Pages
