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

- **Mouse:** click the game to lock the pointer. Move to steer. Hold left button to boost. Esc to release.
- **Keys:** W / ↑ nose down, S / ↓ nose up, A D / ← → bank, Space boost.

## URL flags

- `?debug` opens the dev panel: live telemetry and every flight constant.
- `?seed=abc123` picks the world.

Plan: [docs/paper-plane-game-plan.md](docs/paper-plane-game-plan.md). Progress: [docs/checklist.md](docs/checklist.md).
