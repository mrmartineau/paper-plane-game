# Paper Plane

A calm browser game. Fly an origami plane over a papercraft landscape.

```sh
pnpm install
pnpm dev       # http://localhost:5173
pnpm test      # vitest
pnpm lint      # biome
pnpm build
pnpm deploy      # build + wrangler deploy (needs Cloudflare login)
```

## Deploy

Pushing to `main` deploys to Cloudflare (Workers static assets) through `.github/workflows/deploy.yml`.
It needs two repo secrets: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

## Controls

Press `?` or the keyboard button (bottom left) for the controls card.

- **Mouse:** click the game to lock the pointer. Move to steer. Hold left button to boost. Esc to release.
- **Keys:** W / ↑ nose down, S / ↓ nose up (hold it to loop), A D / ← → bank, Space boost.
- **Air:** warm confetti columns lift you; blue ones push you down.
- **U** shows or hides the flight info (compass, height, speed, stats).
- Fly through paper hoops (they turn gold) and sandstone arches. Trees, rocks, floating islands, poles and birds are solid.

## URL flags

- `?bench` flies an autopilot for 10 minutes and reports frame times and memory.
- `?debug` opens the dev panel: live telemetry, every flight constant, and "go to" buttons for an updraft, arch, hoop, birds, floating mountain and waterfall.
- `?seed=abc123` picks the world.

Plan: [docs/paper-plane-game-plan.md](docs/paper-plane-game-plan.md). Progress: [docs/checklist.md](docs/checklist.md).
