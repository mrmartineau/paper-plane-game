# Paper Plane: build plan

A calm browser game. You fly an origami paper plane over an endless, procedurally generated papercraft landscape. Everything runs locally: no backend, no accounts, no multiplayer.

## Pillars

1. **Zen first.** No fail state. Crashing crumples the plane and respawns it nearby after a short fold animation.
2. **Papercraft look.** The world looks folded and cut from cardstock.
3. **Flight feel above all.** If gliding isn't fun on a flat plane, nothing else matters. Tune this before building content.
4. **Mobile and desktop are both first-class.**

## Modes

- **Zen (default):** free flight. No HUD.
- **Courses:** chains of paper rings over the terrain, generated from the world seed. You start one by flying through a start gate found in the world, with no menu. Optional timer, plus a local best-time ghost. A missed ring doesn't count but isn't a fail.

## Stack

- Bun, Vite, TypeScript (strict)
- Three.js (vanilla, no R3F, to keep the game loop simple)
- `simplex-noise` + `alea` (seeded PRNG)
- Biome for lint/format
- Vitest for pure logic (noise, chunk maths, flight model, course gen)
- Cloudflare Pages for static hosting
- Persistence: localStorage only (settings, last seed, best times, ghost data)

No UI framework. The HUD and menus are a few DOM elements styled with CSS.

## Project structure

```
src/
  main.ts                 // bootstrap, renderer, resize, loop
  config.ts               // tunables (flight, world, quality tiers)
  core/
    loop.ts               // fixed-timestep update (60Hz) + interpolated render
    input/
      index.ts            // unified InputState { pitch, roll, boost? }
      keyboard.ts
      mouse.ts
      touch.ts            // virtual stick
      tilt.ts             // DeviceOrientation, permission flow on iOS
      gamepad.ts
    rng.ts                // seeded PRNG helpers, hash(seed, cx, cz)
    storage.ts            // typed localStorage wrapper
  world/
    noise.ts              // fbm, ridged noise, domain warp
    height.ts             // height(x, z) and biome(x, z), pure functions
    biomes.ts             // biome defs: palette, prop density, height curve
    chunk.ts              // build geometry for one chunk
    chunkManager.ts       // stream chunks around the player, LOD, disposal
    props.ts              // instanced trees/rocks/houses per chunk
    water.ts
    wind.ts               // global wind vector, slow drift
    thermals.ts           // seeded thermal columns per chunk
  plane/
    model.ts              // origami plane geometry
    flight.ts             // flight model, pure and testable
    crash.ts              // crumple + respawn
  camera/
    chaseCam.ts
  render/
    paperMaterial.ts      // custom shader: grain, creases, flat shading
    lighting.ts           // sun, shadows, day/night
    sky.ts
    clouds.ts             // layered cut-out paper clouds
    quality.ts            // tier detection + adaptive resolution
  courses/
    generate.ts           // spline + ring placement from seed
    rings.ts              // ring meshes, pass detection
    ghost.ts              // record/playback
    timer.ts
  ui/
    hud.ts
    menu.ts               // pause, settings, seed share
    photoMode.ts
  audio/
    wind.ts               // WebAudio noise, gain/filter tied to speed
```

## Core systems

### Game loop

- Fixed 60Hz update with an accumulator. Render each frame, interpolating between states.
- Clamp delta when the tab regains focus. Pause on `visibilitychange`.

### World generation

- World coords are in metres. Chunks are 128m × 128m, with 64×64 quads at LOD0.
- `height(x, z)`: FBM simplex (5 octaves) with a light domain warp, then a ridged layer blended in by a mountain mask noise.
- `biome(x, z)`: from two low-frequency noises (temperature, moisture), plus height for snow and water.
  - Biomes: meadow, forest, desert, snowy peaks, lakes/sea.
- Biome blending: lerp vertex colours across borders, sampling the biome at each vertex.
- Every chunk is deterministic from `hash(seed, cx, cz)`.
- Streaming: keep a radius of chunks around the player (e.g. 5 on desktop high, 3 on mobile low). Build at most N chunks per frame (start with 1). Move geometry building into a Web Worker once it's needed (phase 5 at the latest).
- LOD: 3 levels by distance (64, 32, 16 quads). Use skirts to hide seams.
- Dispose of geometry and materials on unload. Watch `renderer.info` for leaks.
- Fog colour matches the sky so the draw distance edge is hidden.

### Papercraft rendering

- Flat shading: compute normals per face (non-indexed geometry, or `flatShading`).
- `paperMaterial`: extend `MeshLambertMaterial` via `onBeforeCompile`:
  - fine paper grain (tileable noise in world space, triplanar for slopes)
  - faint crease darkening along triangle edges (barycentric attribute)
  - slight per-face colour jitter so faces read as separate paper pieces
- Palette: muted cardstock colours per biome. Keep them in `biomes.ts`.
- Props are InstancedMesh, each kind built from a few folded planes:
  - trees: pop-up cones/pyramids, or two crossed cards
  - rocks: low-poly folded shapes
  - houses: little folded boxes with a triangular roof
- Water: 2–3 stacked translucent blue sheets that bob gently in the vertex shader.
- Clouds: stacked paper cut-out sprites/planes at altitude. The plane can fly through them.
- Shadows: one directional sun, PCFSoft shadow map that follows the player. These shadows are most of the paper look, so tune them early.

### Plane

- Origami dart geometry: 6–8 triangles, two-tone paper (white with a faint fold line).
- Flutter: small vertex wobble on the wing tips, scaled with speed.

### Flight model (arcade, `plane/flight.ts`, pure function)

State: position, velocity, orientation (quaternion), airspeed.

Per step:

1. Apply input: roll rate and pitch rate, with smoothing. Auto-level roll gently when there's no input.
2. Bank turns the plane: yaw rate ∝ sin(roll) × airspeed.
3. Gravity pulls down. Lift ∝ airspeed² × liftCoeff, along the plane's up vector, capped.
4. Speed trades with height: nose down gains speed, nose up loses it.
5. Drag ∝ airspeed².
6. Stall: below `stallSpeed`, lift drops off and the nose gently drops (recoverable, never a spin).
7. Air movement: add wind velocity. Thermals give an upward force inside a column (smooth radial falloff). Ridge lift = wind · slope normal near the ground, when positive.
8. Collision: if altitude < terrain height + clearance, crash. Water counts as ground for now.

All constants live in `config.ts`. Add a dev panel (lil-gui behind `?debug`) to tweak them live.

### Thermals & wind

- Wind: a global vector whose direction and strength drift slowly over time (low-freq noise).
- Thermals: 0–2 per chunk, seeded. More over desert and meadow. Each has a radius, strength and top height.
- Visual cues: circling paper birds plus rising dust/paper-confetti particles.

### Camera

- Chase cam behind and above the plane. Lerp position, slerp rotation.
- FOV widens with speed (e.g. 60 → 75).
- Avoid clipping into terrain: raise the camera above `height(x, z) + margin`.

### Courses

- `generate.ts`: per region (e.g. every 4×4 chunks) the seed decides whether a course exists. If so, build a Catmull-Rom spline of 10–20 points that follows the terrain at a sensible altitude, and place rings along it.
- Ring = folded paper torus/octagon. Pass detection: segment (previous position → current position) vs ring disc.
- Start gate: a larger, flagged ring that's visible from a distance.
- Timer starts at the gate and ends at the last ring.
- Ghost: record a transform every 100ms and store it compressed in localStorage, keyed by `seed:courseId`. Play it back as a translucent plane.

### Input

- Unified `InputState` with pitch and roll in [-1, 1].
- Desktop: mouse (pointer lock, relative movement) or WASD/arrow keys.
- Mobile: tilt by default. On iOS, call `DeviceOrientationEvent.requestPermission()` on first tap. Calibrate "neutral" on start. Fall back to the virtual stick if permission is denied.
- Gamepad: left stick.
- Settings: invert pitch, sensitivity.

### Quality tiers

- Tiers: low / medium / high. Pick one from `devicePixelRatio`, `navigator.hardwareConcurrency` and a short startup benchmark.
- Each tier sets chunk radius, shadow map size, prop density, cloud count and pixel ratio cap.
- Adaptive: if the frame-time p90 stays > 20ms for 3s, step down the pixel ratio, then the tier.

### UI

- Zen: no HUD. A tap or Esc opens the pause menu.
- Pause menu: resume, settings (quality, controls, invert, audio), seed (copy share link, new seed), photo mode.
- Course HUD: timer, rings passed/total, ghost delta.
- Photo mode: freeze the sim, free orbit camera, hide the UI, save a PNG via `canvas.toBlob`.
- Seed lives in the URL: `?seed=abc123`.

### Audio

- Wind: filtered noise. Gain and cutoff follow airspeed.
- Soft paper rustle on sharp turns, a chime for each ring, a crumple sound on crash.
- Start audio after the first user gesture.

## Phases

Each phase ends playable. Don't start the next until the acceptance criteria pass.

### Phase 1: flight feel

- Vite + TS + Three scaffold, Biome, Vitest, game loop.
- Origami plane model, chase cam.
- A single large static terrain mesh from `height()`, with basic flat shading.
- Flight model + keyboard/mouse input + crash/respawn.
- lil-gui dev panel for flight constants.
- **Done when:** gliding, turning, diving and climbing feel good for 5 minutes with nothing else in the world. Flight model has unit tests (e.g. no input → steady glide descent, stall recovers).

### Phase 2: endless papercraft world

- Chunk streaming + LOD + disposal.
- Biomes + vertex colour blending.
- Paper material (grain, creases, face jitter), sun shadows, fog, sky.
- Instanced props per biome, water sheets.
- **Done when:** you can fly in a straight line for 10 minutes with no hitches > 50ms on desktop, and memory stays flat.

### Phase 3: air and atmosphere

- Wind, thermals (with visual cues), ridge lift.
- Paper clouds.
- Camera polish (FOV, terrain avoidance).
- **Done when:** you can stay airborne indefinitely by finding thermals, and they're findable by sight.

### Phase 4: courses

- Course generation, rings, start gates, pass detection.
- Timer, HUD, best times, ghost.
- **Done when:** every seed has several findable courses, and finishing one saves a ghost you can race.

### Phase 5: mobile

- Touch stick, tilt with iOS permission + calibration, gamepad.
- Quality tiers + adaptive resolution.
- Move chunk generation into a Web Worker.
- Pause menu + settings.
- **Done when:** 60fps on a recent iPhone on the medium tier, 30fps+ on a mid-range Android on low, and both control schemes feel good.

### Phase 6: polish

- Day/night cycle (sun colour, sky gradient, warm paper lanterns at night).
- Audio.
- Photo mode.
- Seed sharing, PWA manifest for an installable home-screen game.
- Deploy to Cloudflare Pages.

## Testing

- Vitest for pure modules: `height`, `biome`, `rng`, `flight`, `courses/generate`, ring pass detection.
- Determinism test: the same seed gives identical chunk heights and prop placements.
- Perf: an `?bench` URL flag that flies a scripted path and logs frame-time stats.

## Notes for Claude Code

- Keep `world/height.ts` and `plane/flight.ts` pure and free of Three.js, so they're testable and can run in a worker.
- Every tunable goes in `config.ts`. No magic numbers in systems.
- Prefer InstancedMesh and merged geometry. Avoid per-object materials.
- Commit at the end of each phase. Pause after Phase 1 for a feel review before continuing.
