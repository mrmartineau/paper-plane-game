# Paper Plane

A calm browser game. Fly an origami plane over a papercraft landscape.

```sh
bun install
bun run dev      # http://localhost:5173
bun run test     # vitest
bun run lint     # biome
bun run build
```

## Controls

Press `?` or the keyboard button (bottom left) for the controls card.

- **Mouse:** click the game to lock the pointer. Move to steer. Hold left button to boost. Esc to release.
- **Keys:** W / ↑ nose down, S / ↓ nose up (hold it to loop), A D / ← → bank, Space boost.
- **Air:** warm confetti columns lift you; blue ones push you down.
- **U** shows or hides the flight info (compass, height, speed, stats).
- Fly through paper hoops (they turn gold) and sandstone arches. Trees, rocks, floating islands, poles and birds are solid.

## URL flags

- `?debug` opens the dev panel: live telemetry, every flight constant, "go to updraft", "go to arch", "go to hoop" and "go to birds".
- `?seed=abc123` picks the world.

Plan: [docs/paper-plane-game-plan.md](docs/paper-plane-game-plan.md). Progress: [docs/checklist.md](docs/checklist.md).
