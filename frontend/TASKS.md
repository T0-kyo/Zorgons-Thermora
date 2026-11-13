# Frontend task board

Status: ⚪ todo · 🟡 in progress · 🟢 done (merged into submain) · 🔴 blocked
"Done" = merged into `submain` (the frontend integration branch). `main` is not touched until the team says so.
Update your own lines in every commit that changes status. Times are Cairo, Fri 13 → Sat 14 Nov.

## Milestones
- **Fri 18:00** — globe with fire hexes + toggle + spotlight panel working on mock data, deployed
- **Fri 22:00** — all charts, year playback, tour mode
- **Sat 02:00** — switched to real backend data (`VITE_API_URL`)
- **Sat 09:00** — FEATURE FREEZE · **10:00** record demo video · **11:00** deploy freeze · **12:00** submit

## Agent A — globe & 3D (`src/globe/`)
- 🟢 A0 Setup: scaffold, shared contract, stub UI, this board
- 🟢 A1 Real-time Earth: day/night shader from live sun position, city lights, drifting clouds, atmosphere
- 🟢 A2 Fire layer: glowing "ember" points (FireGlow.ts, one draw call; hex columns kept as fallback via FIRE_STYLE) from `getCells()`, size + brightness by count, per `mode` (legacy / harmonized / difference=`missed` in magenta)
- 🟢 A3 Toggle animation: hexes grow/shrink smoothly when `mode` changes
- 🟢 A4 Region focus: glowing outline of selected region, only its hexes shown, pulsing rings on hottest cells
- 🟡 A5 Year playback (PR: frontend/globe-playback): react to `year`/`playing`, smooth transitions between years
- 🟡 A6 Performance + mobile: done: fewer hexes, DPR cap, pause when hidden. Todo: mobile detail level
- 🟡 A7 Globe hooks for the tour (PR: frontend/globe-playback) — see Requests

## Agent B — UI, panels, charts (`src/ui/`, `src/charts/`)
- 🟡 B1 (branch: frontend/ui-agent-b) Top bar: brand, Legacy / Harmonized / Missed-fires toggle (segmented control, clear active state), live UTC clock — subsolar-point readout to add once `src/shared/sun.ts` (Agent A) is merged
- 🟡 B2 (branch: frontend/ui-agent-b) Region list: cards with name + mini undercount %, hover/selected states, "Global view"
- 🟡 B3 (branch: frontend/ui-agent-b) Spotlight panel: slide-in, big undercount % with CI, legacy vs harmonized fire counts — **numbers count up on toggle**
- 🟡 B4 (branch: frontend/ui-agent-b) Human-influence gauge: semicircle 0–1, marker for legacy and harmonized score
- 🟡 B5 (branch: frontend/ui-agent-b) Weekly-cycle chart: 7 bars Mon–Sun + mean line ("nature has no weekends")
- 🟡 B6 (branch: frontend/ui-agent-b) Trend chart: raw vs corrected lines, uncertainty band, verdict badge (`trendSurvives`)
- 🟡 B7 (branch: frontend/ui-agent-b) Timeline: year slider + ▶ play (sets `playing`, steps `year` ~every 1.2s)
- 🟡 B8 (branch: frontend/ui-agent-b) Guided tour: ▶ Tour button, ~60s script over 2–3 regions toggling modes, caption overlay; any click stops it
- 🟡 B9 (branch: frontend/ui-agent-b) Global overview panel when no region selected (headline question + global undercount)
- 🟡 B10 (branch: frontend/ui-agent-b) Mobile layout: bottom sheet for spotlight, chips for regions
- 🟡 B11 (branch: frontend/ui-agent-b) About / Methods modal: data sources (NASA FIRMS MODIS + VIIRS), method summary, team, AI-use disclosure

## Requests (one agent asking the other)
- A → B (FYI): `src/shared/sun.ts` exports `sunPosition()` — use it for a live "subsolar point" readout in the HUD if you like.
- A → B (FYI): the globe already reacts to `mode`, `regionId`, `year`. The spotlight numbers should also count up/animate when `mode` changes (B3).

- A → B (B7/B8): **tour + playback hooks are ready** (once `frontend/globe-playback` is in submain):
  - `useApp.getState().setCameraTarget({ lat, lng, altitude, ms })` flies the camera anywhere (tour shots); `null` releases it back to the selected region / global view. `stopTour()` also clears it.
  - Any manual drag/zoom on the globe calls `stopTour()` automatically.
  - Year playback: just step `setYear()` every ~1.2s while `playing`; the globe pre-loads years and animates hex heights on a fixed cross-year scale (growth/decline is real, not re-normalised).

## Contract changes (shared/ edits that rename/remove things)
- _none yet_

## Notes for the backend
- Frontend (B) aggregates `GET /cells?year=` (no region) for the global and per-region undercount in the region list / overview, using (harmonized − legacy) / legacy. If the backend computes undercount differently, a `GET /summary?year=` (global) endpoint would keep these consistent with `/regions/:id/summary`.
- Frontend expects: `GET /regions`, `GET /cells?year=&region=` (both `legacy` and `harmonized` counts per cell in one response), `GET /regions/:id/summary?year=`. Exact shapes: `src/shared/types.ts`.
