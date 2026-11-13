# Thermora — frontend

Interactive 3D globe showing how much the legacy MODIS fire record undercounts fires, and what changes once it is harmonized with VIIRS. NASA Space Apps Cairo 2026 · team Zorgons.

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build
```

## With Docker (same setup for everyone)

```bash
cd frontend
docker compose up --build web            # production build → http://localhost:8080
docker compose --profile dev up dev      # dev server with hot reload → http://localhost:5173
VITE_API_URL=http://localhost:5000 docker compose up --build web   # against the real backend
```

Node 22 and nginx 1.27 are pinned in the `Dockerfile`; dependencies come from `package-lock.json` via `npm ci`.

## Notes

- Uses mock data until `VITE_API_URL` points at the backend (a "MOCK DATA" badge is shown meanwhile).
- Deploy on Vercel: import the repo, **Root Directory `frontend`** (settings come from `frontend/vercel.json`), **Production Branch `submain`**. Optional env var `VITE_API_URL` (defaults to the team backend).
- Agents/teammates: read `CLAUDE.md`, `DESIGN.md` and `TASKS.md` first.

Earth textures and country outlines come from the `three-globe` examples (NASA Blue Marble / Black Marble, Natural Earth).
This frontend was built with AI assistance (Claude), directed and reviewed by the team.
