# Thermora — frontend

Interactive 3D globe showing how much the legacy MODIS fire record undercounts fires, and what changes once it is harmonized with VIIRS. NASA Space Apps Cairo 2026 · team Zorgons.

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build
```

- Uses mock data until `VITE_API_URL` points at the backend (a "MOCK DATA" badge is shown meanwhile).
- Deploy (Vercel/Netlify): root directory `frontend`, build `npm run build`, output `dist`.
- Agents/teammates: read `CLAUDE.md` and `TASKS.md` first.

Earth textures and country outlines come from the `three-globe` examples (NASA Blue Marble / Black Marble, Natural Earth).
This frontend was built with AI assistance (Claude), directed and reviewed by the team.
