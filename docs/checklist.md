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
- [x] Cockpit HUD, `U` toggles: artificial horizon + pitch ladder, roll scale, speed and height tapes, climb bar (warm in lift, blue in sink), STALL / BOOST warnings, compass tape; stats card: flight time, distance, time in lift, loops, hoops, best height, top speed, crashes, wind (`src/ui/hud.ts`, `src/ui/stats.ts`)
- [x] Unit tests: steady glide, stall recovery, dive/climb, bank + auto-level, full loop, rising/sinking air, crash; height, air and prop determinism; prop collision and arch lanes; loop counter
- [x] **Feel review (you):** approved ("it looks good, continue with the plan")

Pulled forward because they were one-liners: sun shadow that follows the plane, fog, flat water at sea level, FOV widens with speed, camera stays above terrain.

## Phase 2: endless papercraft world

- [x] `rng.ts`: `rngFor(seed, ...parts)`
- [x] Chunk geometry (128m, 64×64 quads) + skirts (`src/world/chunk.ts`, pure)
- [x] Streaming around the player, nearest first: terrain built in 2 Web Workers, props on the main thread within a per-frame budget (`src/render/streamer.ts`, `src/world/chunkWorker.ts`)
- [x] LOD: 64 / 32 / 16 quads by distance, swapped without gaps
- [x] Disposal on unload (geometries; materials are shared). Generators cached with an LRU, so memory stays flat
- [x] Climate (`createClimate` in `height.ts`) → soft biome weights: meadow, forest, desert, snow; colder with height so peaks are snowy; sand and seabed by the water (`src/world/biomes.ts`)
- [x] Biome colour blending per face, bare rock on cliffs
- [x] Paper material: grain, mottling, crease darkening, per-face jitter (`src/render/paperMaterial.ts`), on land, water, plane and ball
- [x] Sky: gradient dome, horizon = fog colour (`src/render/sky.ts`)
- [x] Instanced props: pines, tall pines (to ~35m), round trees in forest patches; rocks on slopes (`src/world/props.ts`, `src/render/propMeshes.ts`)
- [x] Sandstone arches and standing rings you can fly through, with a clear lane in front and behind
- [x] Floating rock islands (grass cap, hanging spike), solid
- [x] Floating mountains (Avatar-style pillars) in groups, with trees on top, paper waterfalls that fade in mid-air, and thick swaying vines (solid) (`src/render/floaterMeshes.ts`)
- [x] Paper hoops: floating or on poles, clear approach lanes, turn gold when flown through, counted in the HUD
- [x] Collision with trees, rocks, arches, islands, hoop rims, poles and birds (forgiving: colliders 80% of mesh size)
- [x] Houses: little villages of folded boxes with prism roofs, in meadows
- [x] Cacti in deserts, snowy pines in snow, tree mix per biome
- [x] Props streamed per cell and baked into one mesh per cell (one draw call); hoops, vines and birds are pooled
- [x] Spawns search for a clear glide path (no spawning into a floating mountain)
- [x] Water: three stacked translucent paper sheets that bob, following the player (`src/render/water.ts`)
- [x] Determinism tests for chunks and per-cell features
- [ ] **Done when:** 10 min straight flight, no hitch > 50ms, flat memory

## Phase 3: air and atmosphere

- [x] Wind: global vector, slow drift; calmer near the ground; the plane drifts with it; shown in the HUD (`src/world/wind.ts`)
- [x] Thermals: 0–1 per 384m cell, seeded (`src/world/thermals.ts`)
- [x] Sinking air columns (push you down, ease off near the ground)
- [x] Thermals weighted by biome
- [x] Thermal visual cues: tinted columns + rising warm / falling blue confetti (`src/render/airColumns.ts`)
- [x] Felt cues: camera trails the air's push so the plane visibly lifts or drops, plus a light shake
- [x] Paper birds: flocks on big circles, plus birds circling some thermals; solid, so dodge them (`src/world/birds.ts`)
- [x] Ridge lift: wind · slope near the ground, added to rising air
- [x] Paper clouds: three crossed cut-out layers, drift with the wind, fly-through (`src/render/clouds.ts`)
- [x] Camera FOV with speed
- [x] Camera terrain avoidance
- [x] **Done when:** you can stay up indefinitely on thermals and find them by sight (tested: circling a thermal climbed 64 → 162 m in 30 s)

## Phase 4: courses

- [x] Course generation per 4×4-chunk region (Catmull-Rom spline, 10–20 points), rings nudged clear of rocks and islands (`src/courses/generate.ts`)
- [x] Ring pass detection, segment vs disc (`src/courses/rings.ts`, tested); used by free hoops now
- [x] Course ring chains; rings coloured by state (next = gold, passed = green, missed = grey) (`src/render/courseMeshes.ts`)
- [x] Start gate: big red ring with a tall spinning striped ribbon, visible from far; flying through starts the run
- [x] Timer + course HUD: ring n/total, arrow + distance to the next ring, time, ± vs best; hint near a gate; finish message (`src/ui/coursePanel.ts`, `src/courses/run.ts`)
- [x] `storage.ts` + best times (more rings first, then faster)
- [x] Ghost record (100ms) / playback, Int16-packed + base64, keyed `seed:courseId` (`src/courses/ghost.ts`)
- [x] **Done when:** every seed has several findable courses, finishing saves a raceable ghost (tests: ≥4 courses within 4 km; run → finish → best + ghost saved; ghost encode/decode)

## Phase 5: mobile

- [x] Touch virtual stick (thumb down anywhere on the left two-thirds) + boost button (`src/core/input/touch.ts`)
- [x] Tilt input, iOS permission on first tap, neutral = how you hold it ("Set tilt level" in the menu), stick fallback (`src/core/input/tilt.ts`) — landscape axis signs untested on a real phone
- [x] Gamepad: left stick, A / right trigger boost, Start pauses (`src/core/input/gamepad.ts`)
- [x] Quality tiers (low / medium / high) from the device; set view distance, fog, shadows, pixel ratio, clouds, prop density (`src/render/quality.ts`)
- [x] Adaptive (auto quality): p90 > 20 ms for 3 s steps the pixel ratio down, then the tier (stands in for a separate startup benchmark)
- [x] Chunk generation in a Web Worker (done early, in Phase 2: it was needed)
- [x] Pause menu (button, Esc, P, gamepad Start, mouse release): quality, controls, invert, sensitivity, tilt level, seed (fly / new / copy link); saved in localStorage (`src/ui/menu.ts`, `src/core/settings.ts`). Audio settings come with audio in Phase 6
- [ ] **Done when:** 60fps recent iPhone (medium), 30fps+ mid Android (low), both control schemes feel good — needs a real-device check (you)

## Phase 6: polish

- [x] Day/night cycle (15 min): sky, fog, sun colour and direction, moonlight, stars; lanterns by house doors glow at night; menu: cycle / always day / always night (`src/render/lighting.ts`, `src/render/sky.ts`)
- [x] Audio, all synthesised (WebAudio): wind (louder/brighter with speed), paper rustle on sharp turns, ring/hoop chimes, finish tune, crumple on crash; starts on first gesture; menu sound toggle + volume (`src/audio/sound.ts`)
- [x] Photo mode (O, or the menu): sim frozen, UI hidden, orbit camera, Save PNG (`src/ui/photoMode.ts`)
- [x] Seed sharing: `?seed=` in the URL; menu: fly this seed, new world, copy link
- [x] PWA manifest + icons (192, 512, maskable, SVG) + Apple touch icon, full-screen display. No offline service worker yet
- [x] `?bench` scripted flight with frame-time stats
- [x] Cloudflare deploy set up (Workers static assets via `@cloudflare/vite-plugin` + `wrangler.jsonc`, GitHub Actions deploy + safe-chain security workflows; `wrangler deploy --dry-run` passes). Not deployed: needs repo secrets and a push (you)
