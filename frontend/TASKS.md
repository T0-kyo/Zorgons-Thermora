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
- ⚪ A1 Real-time Earth: day/night shader from live sun position, city lights, drifting clouds, atmosphere
- ⚪ A2 Fire layer: hexbins from `getCells()`, height + colour by count, per `mode` (legacy / harmonized / difference=`missed` in magenta)
- ⚪ A3 Toggle animation: hexes grow/shrink smoothly when `mode` changes
- ⚪ A4 Region focus: glowing outline of selected region, dim others, pulsing rings on hottest cells
- ⚪ A5 Year playback: react to `year`/`playing`, smooth transitions between years
- ⚪ A6 Performance + mobile: lower detail on small/weak devices, pause rendering when hidden
- ⚪ A7 Globe hooks for the tour (camera paths) — coordinate with B8

## Agent B — UI, panels, charts (`src/ui/`, `src/charts/`)
- ⚪ B1 Top bar: brand, Legacy / Harmonized / Missed-fires toggle (segmented control, clear active state), live UTC clock
- ⚪ B2 Region list: cards with name + mini undercount %, hover/selected states, "Global view"
- ⚪ B3 Spotlight panel: slide-in, big undercount % with CI, legacy vs harmonized fire counts — **numbers count up on toggle**
- ⚪ B4 Human-influence gauge: semicircle 0–1, marker for legacy and harmonized score
- ⚪ B5 Weekly-cycle chart: 7 bars Mon–Sun + mean line ("nature has no weekends")
- ⚪ B6 Trend chart: raw vs corrected lines, uncertainty band, verdict badge (`trendSurvives`)
- ⚪ B7 Timeline: year slider + ▶ play (sets `playing`, steps `year` ~every 1.2s)
- ⚪ B8 Guided tour: ▶ Tour button, ~60s script over 2–3 regions toggling modes, caption overlay; any click stops it
- ⚪ B9 Global overview panel when no region selected (headline question + global undercount)
- ⚪ B10 Mobile layout: bottom sheet for spotlight, chips for regions
- ⚪ B11 About / Methods modal: data sources (NASA FIRMS MODIS + VIIRS), method summary, team, AI-use disclosure

## Requests (one agent asking the other)
- _none yet_

## Contract changes (shared/ edits that rename/remove things)
- _none yet_

## Notes for the backend
- Frontend expects: `GET /regions`, `GET /cells?year=&region=` (both `legacy` and `harmonized` counts per cell in one response), `GET /regions/:id/summary?year=`. Exact shapes: `src/shared/types.ts`.
