# Paper Plane: build checklist

Tracks [paper-plane-game-plan.md](./paper-plane-game-plan.md). Tick items as they land.

## Phase 1: flight feel

- [x] Vite + TS (strict) + Three scaffold (React template removed)
- [x] pnpm as package manager, Biome for lint/format, Vitest
- [x] Game loop: fixed 60Hz + accumulator, interpolated render, delta clamp, pause on `visibilitychange` (`src/core/loop.ts`)
- [x] Origami plane model, 6 triangles, two-tone paper (`src/plane/model.ts`)
- [x] Bigger plane, camera closer; camera smooths its offset so speed adds no lag
- [x] Wing-tip flutter scaled with speed
- [x] Chase cam: lerp position, slerp rotation (`src/camera/chaseCam.ts`)
- [x] Camera rolls with the plane in loops / inverted, horizon stays level otherwise
- [x] `height(x, z)`: FBM (5 octaves) + domain warp + ridged layer behind a mountain mask (`src/world/height.ts`)
- [x] Single static terrain mesh, flat shaded, coloured by height (`src/world/terrain.ts`)
- [x] Flight model, pure (`src/plane/flight.ts`): quaternion orientation, roll/pitch input with smoothing, auto-level, bank turns, lift capped, speed/height trade, drag ∝ v², gentle stall
- [x] Loops and rolls (release the stick upside down and it rolls upright)
- [x] Keyboard input (WASD / arrows, Space = boost)
- [x] Boost trail: little scrunched paper balls that trail behind and drop + FOV kick
- [x] Mouse input (pointer lock, relative stick that re-centres, left button = boost)
- [x] Crash → plane scrunches into a paper ball that rolls downhill → respawn nearby → fold open (`src/plane/crash.ts`)
- [x] Controls card: keyboard button bottom-left (native popover), opens on start, `?` / `H` toggles (`src/ui/help.ts`)
- [x] lil-gui dev panel behind `?debug`, with live telemetry, "go to updraft" and "go to arch" (`src/debug.ts`)
- [x] HUD, `U` toggles: compass, height, speed, climb rate, stall flag, flight time, distance, time in lift, loops, best height, top speed, crashes (`src/ui/hud.ts`, `src/ui/stats.ts`)
- [x] Unit tests: steady glide, stall recovery, dive/climb, bank + auto-level, full loop, rising/sinking air, crash; height, air and prop determinism; prop collision and arch lanes; loop counter
- [ ] **Feel review (you):** gliding, turning, diving and climbing feel good for 5 minutes

Pulled forward because they were one-liners: sun shadow that follows the plane, fog, flat water at sea level, FOV widens with speed, camera stays above terrain.

## Phase 2: endless papercraft world

- [x] `rng.ts`: `rngFor(seed, ...parts)`
- [ ] Chunk geometry (128m, 64×64 quads) + skirts
- [ ] Chunk streaming around the player, N builds per frame
- [ ] LOD: 64 / 32 / 16 quads by distance
- [ ] Disposal on unload, check `renderer.info`
- [ ] `biome(x, z)`: temperature + moisture + height → meadow, forest, desert, snow, water
- [ ] Biome vertex colour blending
- [x] Paper material: grain, mottling, crease darkening, per-face jitter (`src/render/paperMaterial.ts`), on land, water, plane and ball
- [ ] Sky
- [x] Instanced props: pines, tall pines (to ~35m), round trees in forest patches; rocks on slopes (`src/world/props.ts`, `src/render/propMeshes.ts`)
- [x] Sandstone arches and standing rings you can fly through, with a clear lane in front and behind
- [x] Floating rock islands (grass cap, hanging spike), solid
- [x] Paper hoops: floating or on poles, clear approach lanes, turn gold when flown through, counted in the HUD
- [x] Collision with trees, rocks, arches, islands, hoop rims, poles and birds (forgiving: colliders 80% of mesh size)
- [ ] Houses
- [ ] Move props to per-chunk instancing (now: one batch per kind for the whole map)
- [ ] Water sheets that bob
- [ ] Determinism test for chunk heights and props
- [ ] **Done when:** 10 min straight flight, no hitch > 50ms, flat memory

## Phase 3: air and atmosphere

- [ ] Wind: global vector, slow drift
- [x] Thermals: 0–1 per 384m cell, seeded (`src/world/thermals.ts`)
- [x] Sinking air columns (push you down, ease off near the ground)
- [ ] Thermals weighted by biome (needs Phase 2 biomes)
- [x] Thermal visual cues: tinted columns + rising warm / falling blue confetti (`src/render/airColumns.ts`)
- [x] Felt cues: camera trails the air's push so the plane visibly lifts or drops, plus a light shake
- [x] Paper birds: flocks on big circles, plus birds circling some thermals; solid, so dodge them (`src/world/birds.ts`)
- [ ] Ridge lift
- [ ] Paper clouds
- [x] Camera FOV with speed
- [x] Camera terrain avoidance
- [ ] **Done when:** you can stay up indefinitely on thermals and find them by sight

## Phase 4: courses

- [ ] Course generation per 4×4-chunk region (Catmull-Rom spline, 10–20 points)
- [x] Ring pass detection, segment vs disc (`src/courses/rings.ts`, tested); used by free hoops now
- [ ] Course ring chains
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
