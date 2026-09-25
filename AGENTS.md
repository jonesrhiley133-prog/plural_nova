# PluralNova — Base44 Dev Notes

## What this is

A private PWA for plural systems. Monorepo with three npm workspaces:

- `packages/shared` — TypeScript domain library (71 collections, terminology, themes). Must be built (`npm run build -w @pluralnova/shared`) before the server or web client can import it. Outputs to `packages/shared/dist/`.
- `packages/server` — Express + SQLite (`better-sqlite3`, native module). Dev: `tsx watch src/index.ts` on port 4000. Auto-creates the database, push keys, and uploads dir under `PLURALNOVA_DATA_DIR` on first run.
- `packages/web` — React 18 + Vite 5 client. Dev: `vite` on port 5173, proxies `/api`, `/uploads`, `/realtime` to the server.

## Running in Base44

`docker-compose.base44.yml` runs three services:

1. `init` — one-shot: installs deps (compiles `better-sqlite3` native module) and builds the shared package. Exits when done.
2. `server` — `tsx watch` with live reload on port 4000 (internal, not exposed to host). SQLite data in a named volume at `/data`.
3. `web` — `vite` with HMR on port 5173, mapped to host port 3000. Proxy target set via `PLURALNOVA_DEV_API=http://server:4000`.

No external secrets needed — the app generates everything (DB, push keys) on first run.

## Dev workflow

- Server edits: `tsx watch` picks up changes automatically.
- Web edits: Vite HMR picks up changes automatically.
- Shared package edits: rebuild with `docker compose -f docker-compose.base44.yml exec server sh -c "cd /app && npm run build -w @pluralnova/shared"` (both server and web need a restart/reload after).

## Key config

- `PLURALNOVA_SERVE_WEB=false` in dev — the Vite dev server serves the client, not the server.
- CORS defaults to localhost dev origins; in the Docker setup the Vite proxy makes all browser requests same-origin, so CORS is not exercised.
- The Vite proxy target is configurable via `PLURALNOVA_DEV_API` (defaults to `http://localhost:4000` for local dev outside Docker).

## Design system

- CSS custom properties in `packages/web/src/styles/tokens.css` — all colors, spacing, radii, durations.
- Component styles in `components.css`, layout in `layout.css`, motion in `motion.css`.
- Theming engine rewrites CSS custom properties at runtime (dark, AMOLED, light, high-contrast, custom palettes).
- Icons: thin-line SVG via `packages/web/src/ui/Icon.tsx`.
