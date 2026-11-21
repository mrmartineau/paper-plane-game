# Paper Plane: build checklist

Tracks [paper-plane-game-plan.md](./paper-plane-game-plan.md). Tick items as they land.

## Phase 1: flight feel

- [x] Vite + TS (strict) + Three scaffold (React template removed)
- [x] pnpm as package manager, Biome for lint/format, Vitest
- [x] Game loop: fixed 60Hz + accumulator, interpolated render, delta clamp, pause on `visibilitychange` (`src/core/loop.ts`)
- [x] Origami plane model, 6 triangles, two-tone paper (`src/plane/model.ts`)
- [x] Bigger plane, camera closer; camera smooths its offset so speed adds no lag
- [x] Paper animal mode (menu checkbox, or **T**): a paper crane that flies like a glider, lands anywhere with a gentle touchdown and runs (W run, S brake, A D turn), steps up ledges, is stopped by steep walls and solid things, drops off edges into a glide, Space takes off; wings flap in flight (faster when boosting) and rest folded when running; legs swing when running and tuck when flying (`src/plane/run.ts`, `src/plane/model.ts`)
- [x] Animals walk backwards: pull back (S) brakes, then reverses at 40% of top speed; legs cycle the other way (crane, cheetah, dog)
- [x] Land animals: paper cheetah (very fast) and paper dog (nimble); menu Paper animal = Off / Crane / Cheetah / Dog, **T** toggles. Ground only: W run, S brake, A D turn, **Space sprints** (legs ~2× faster, speed up, uses the boost tank, runs out of breath then recovers); fall off ledges and keep running; four legs trot in diagonal pairs
- [x] Skateboard (menu → Turn into → Skateboard, or T): rolls on momentum (W kicks to a cruise speed, S brakes, A D carve), downhill speeds up / uphill slows, crests launch you with the slope's upward speed, solid things stop you dead; Space = ollie with a kickflip spin; paper deck with grip tape and hexagon wheels (`stepSkate` in `src/plane/run.ts`)
- [x] Four planes, random each start or picked in the menu: Dart (balanced), Glider (floaty), Arrow (fast), Stunt (flips); each its own fold, tint and handling (`src/plane/types.ts`)
- [x] Wing-tip flutter scaled with speed
- [x] Chase cam: lerp position, slerp rotation (`src/camera/chaseCam.ts`)
- [x] Camera rolls with the plane in loops / inverted, horizon stays level otherwise
- [x] `height(x, z)`: FBM (5 octaves) + domain warp + ridged layer behind a mountain mask (`src/world/height.ts`)
- [x] Single static terrain mesh, flat shaded, coloured by height (`src/world/terrain.ts`)
- [x] Flight model, pure (`src/plane/flight.ts`): quaternion orientation, roll/pitch input with smoothing, auto-level, bank turns, lift capped, speed/height trade, drag ∝ v², gentle stall
- [x] Loops and rolls (release the stick upside down and it rolls upright)
- [x] Keyboard input (WASD / arrows, Space = boost)
- [x] Rocket boost: gravity, stall and sink off while held; fly anywhere, even straight up; calmer controls (0.75×, turn rate capped above 30 m/s); up to ~340 km/h, speed bleeds off after
- [x] Boost effects: paper-ball trail, big FOV kick, light camera shake, rocket rumble + hiss
- [x] Boost fuel: ~6 s tank, refills while gliding (2× in rising air); runs dry → off until 20%; HUD fuel bar (orange when low, red blinking while it refills)
- [x] Menu → Boost: unlimited boost, tank length (3–15 s), camera shake on/off (`applySettings` in `src/core/settings.ts`)
- [x] Mouse input (pointer lock, relative stick that re-centres, left button = boost)
- [x] Crash → plane scrunches into a paper ball that rolls downhill → respawn nearby → fold open (`src/plane/crash.ts`)
- [x] Controls card: short (5 lines), keyboard button bottom-left, opens on start, `?` / `H` toggles; the full guide is under "How to play" in the pause menu (`src/ui/help.ts`)
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
- [x] Cities (~every 700 m cell, 40%): grid of paper skyscrapers (to ~200 m, taller in the core), avenues to fly down, skybridges, a fly-through gate (two towers + lintel) at the edge; on hills with per-tower foundations; windows glow at night; other features keep out (`src/world/props.ts` `cityCell`, `src/render/world.ts`)
- [x] Floating rock islands (grass cap, hanging spike), solid
- [x] Land on floating islands and mountains: gentle + level touchdown on the grassy top; slide to a stop; boost refills 3× faster; Space takes off; slide off the edge to fly (`src/plane/landing.ts`)
- [x] Obvious landing spots: paper runways (dashes, threshold bars, arrows, edge lights that glow at night) on flat floating-mountain tops, kept clear of trees; H helipads on small islands; HUD points to the nearest pad
- [x] Easy landing: pads pull you in (toward the centre, down, wings level, slowing) within 60 m; boost pulls away; forgiving touchdown; no pull for 4 s after take-off
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
- [x] **Done when:** 60fps recent iPhone (medium), 30fps+ mid Android (low), both control schemes feel good — checked on a phone: tilt and touch stick both work, touch is better

## Phase 6: polish

- [x] Day/night cycle (15 min): sky, fog, sun colour and direction, moonlight, stars; lanterns by house doors glow at night; menu: cycle / always day / always night (`src/render/lighting.ts`, `src/render/sky.ts`)
- [x] Audio, all synthesised (WebAudio): wind (louder/brighter with speed), paper rustle on sharp turns, ring/hoop chimes, finish tune, crumple on crash; starts on first gesture; menu sound toggle + volume (`src/audio/sound.ts`)
- [x] Photo mode (O, or the menu): sim frozen, UI hidden, orbit camera, Save PNG (`src/ui/photoMode.ts`)
- [x] Seed sharing: `?seed=` in the URL; menu: fly this seed, new world, copy link
- [x] PWA manifest + icons (192, 512, maskable, SVG) + Apple touch icon, full-screen display. No offline service worker yet
- [x] `?bench` scripted flight with frame-time stats
- [x] Cloudflare deploy set up (Workers static assets via `@cloudflare/vite-plugin` + `wrangler.jsonc`, GitHub Actions deploy + safe-chain security workflows; `wrangler deploy --dry-run` passes). Not deployed: needs repo secrets and a push (you)

## Multiplayer

- [x] Room server: a Cloudflare Durable Object per world seed (`src/worker/index.ts`), WebSocket Hibernation, ids + paper colours, rate limits, cap 24 players; room rules in `src/net/room.ts`
- [x] Message format with checks on everything players send (`src/net/protocol.ts`)
- [x] Client link with reconnect backoff; solo play when the server is down (`src/net/client.ts`)
- [x] Other players drawn 100 ms behind, blended between updates, tinted with their colour; a paper ball when they crash (`src/net/remotes.ts`, `src/net/multiplayer.ts`)
- [x] Paper-ball shots: F, right mouse, gamepad X/RB, touch FIRE; the hit plane crumples, the shooter gets a hit (`src/plane/shots.ts`)
- [x] HUD: players online and hits. Menu: Fly with others on/off
- [x] Radar (top-right): other players as dots in their colour, you in the middle facing up; hollow = below you, dash = above (`src/ui/radar.ts`)
- [x] Spawn next to another player: on joining and after a crash (60–140 m away, same heading)
- [ ] **Done when:** two people on the same seed see each other fly smoothly and can shoot each other down (you, after deploy)

