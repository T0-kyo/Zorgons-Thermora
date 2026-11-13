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
- 🟢 A5 Year playback: react to `year`/`playing`, smooth transitions between years
- 🟢 A6 Performance + mobile: fewer meshes, DPR cap, pause when hidden, camera fits portrait screens
- 🟢 A7 Globe hooks for the tour — see Requests

- 🟢 A9 Cinematic camera: sunrise intro, swoop fly-to, region drift, toggle flare
- 🟢 A11 Human vs natural globe mode (`mode: 'human'`), click-to-pick place, place marker + fly-to, place search + data APIs (progress / daily / day)
- 🟡 A12 Editorial refactor (team request): editorial column + full-bleed globe, Spectrum instrument (human/natural filter, histogram, keys), Gloock display, default mode `human`, solid surfaces. Branch `frontend/globe-editorial`
- 🟡 A10 Backend contract: `frontend/API_CONTRACT.md` (waiting on backend decisions), then swap `api.ts`
- 🟢 A8 Design system refresh (DESIGN.md, tokens, Archivo) + Docker (`frontend/Dockerfile`, `docker-compose.yml`)

## Agent B — UI, panels, charts (`src/ui/`, `src/charts/`)
- 🟢 B1 Top bar: brand, Legacy / Harmonized / Missed-fires toggle (segmented control, clear active state), live UTC clock — subsolar-point readout to add once `src/shared/sun.ts` (Agent A) is merged
- 🟢 B2 Region list: cards with name + mini undercount %, hover/selected states, "Global view"
- 🟢 B3 Spotlight panel: slide-in, big undercount % with CI, legacy vs harmonized fire counts — **numbers count up on toggle**
- 🟢 B4 Human-influence gauge: semicircle 0–1, marker for legacy and harmonized score
- 🟢 B5 Weekly-cycle chart: 7 bars Mon–Sun + mean line ("nature has no weekends")
- 🟢 B6 Trend chart: raw vs corrected lines, uncertainty band, verdict badge (`trendSurvives`)
- 🟢 B7 Timeline: year slider + ▶ play (sets `playing`, steps `year` ~every 1.2s)
- 🟢 B8 Guided tour: ▶ Tour button, ~60s script over 2–3 regions toggling modes, caption overlay; any click stops it
- 🟢 B9 Global overview panel when no region selected (headline question + global undercount)
- 🟢 B10 Mobile layout: bottom sheet for spotlight, chips for regions
- 🟢 B11 About / Methods modal: data sources (NASA FIRMS MODIS + VIIRS), method summary, team, AI-use disclosure


### Agent B — round 2 (from the team, 14:45). Do these in order. Everything you need from A is already in `src/shared/`.

**Product direction from the team:** the app's job is to show whether fires are **human-made or natural**. We present it as a **likelihood for an area** (from the weekly-cycle test), never as a label on a single fire. Wording: "likely human-driven" / "likely natural", "human likelihood 0.89", never "these fires were set by humans".

- 🟢 **B12 Toggle: replace "Missed fires" with "Human vs natural".** In `TopBar.tsx` the third option becomes `{ id: 'human', label: 'Human vs natural' }` (sentence case). The globe already colours fires from cool ice (likely natural) to hot magenta (likely human) when `mode === 'human'`. Update `RecordBar.tsx`/`SpotlightPanel.tsx` so the human mode shows the **human likelihood** as the hero (not the missed count). A added a placeholder `human` entry in `RecordBar.tsx` only so the build stays green; restyle freely. Keep `'difference'` out of the UI.
- 🟢 **B13 Legend for human mode:** a small gradient bar (natural → human, `cyan` → `missed`) with "Likely natural" / "Likely human-driven" end labels, shown only when `mode === 'human'`.
- 🟢 **B14 Place search box** (top of the right panel, or in the top bar): `searchPlaces(query)` from `src/shared/api.ts` returns `Place[]` (offline gazetteer + OpenStreetMap). Debounce 250ms, show name + `context` (e.g. "India, India & China crop belts"). On pick: `useApp.getState().setPlace(place)`; the globe flies there and drops a labelled marker. Users can also **click anywhere on the globe** to pick a spot (A already wires that to `setPlace`). Show the picked place as a removable chip ("× Near Lahore"); `setPlace(null)` clears it. If `place.regionId === null`, say "Outside the study regions. No data here yet."
- 🟢 **B15 Right panel: two views, "Progress" and "Calendar"** (a segmented switch at the top of the region panel). The panel's subject is `currentTarget(useApp.getState())` from `api.ts`: the place if one is picked, else the region.
- 🟢 **B16 Progress view: "how much worse since 2001".** `getProgress(target)` returns a `ProgressSummary`. Show:
  - a **progress bar** from the baseline (mean of 2001–2003) to recent (mean of the last 3 years), with `changePct` as the hero readout (`+132%`) and `direction` in words ("Getting worse" / "Getting better" / "Stable");
  - a sparkline of `series` (harmonized solid, legacy faint);
  - human likelihood (legacy → harmonized) as a small bar with the natural/human legend from B13.
- 🟢 **B17 Calendar view: pick a day.** `getDaily(target, year)` gives every day of the year (`DailyPoint[]`). Show a **month-grid calendar popup/panel** (Mon-first weeks), each day shaded by `harmonized` fires (use the `fire` ramp), with month/year navigation (year follows `useApp.year`; `setYear` when the user changes it). Clicking a day calls `useApp.getState().setDate('YYYY-MM-DD')` and shows a **day card** from `getDay(target, date)`: fires (legacy vs harmonized), weekday + weekend flag, "vs the year's daily average" and "vs the average <weekday>" %, rank in the year ("8th busiest day of 2019"), and the area's human likelihood. Keyboard: arrow keys move between days, Enter selects.
- 🟢 **B18 Compare days:** a "Compare" action on the day card calls `toggleCompare(date)` (max 3 kept in `compareDates`). Show the pinned days side by side (fires, weekday, vs average), so users can compare, e.g., a weekday and a weekend, or the same date across years. "Clear" calls `clearCompare()`.
- 🟢 **B19 Design cleanup still pending** (see the earlier A → B design request and `DESIGN.md` rules 1–7): no caps, no `·`-joined strings, `.wordmark`, badge "Sample data, not results".
- 🟢 **B20 Tour update:** add one step that switches to `mode: 'human'` over India & China ("Crop-residue burning: a strong human rhythm") and one over Boreal North America ("Lightning fires: mostly natural").

**State you'll use** (`src/shared/store.ts`): `place`, `setPlace`, `date`, `setDate` (also sets `year`), `compareDates`, `toggleCompare`, `clearCompare`. `selectRegion()` clears place/date/compare.
**Debug in the browser console:** `window.__thermora.getState()`, `window.__thermoraApi.getProgress({ kind: 'region', regionId: 'amazon' })`.

## Requests (one agent asking the other)
- A → B (**heads-up, 15:50**): per the team, A did an editorial refactor across `App.tsx`, `index.css` and a few `src/ui/**` files (`GlobalOverview` headline/copy, `TopBar` mode order + `UtcClock` export, `MobileSheet` legend removed) and added `src/ui/Spectrum.tsx` + `src/ui/ModeTabs.tsx`. **Before any new UI work, merge `origin/submain` (once A12 is merged) or `origin/frontend/globe-editorial`.** Store: new `humanRange` + `setHumanRange`; default `mode` is now `'human'`.
- A → B (FYI): `src/shared/sun.ts` exports `sunPosition()` — use it for a live "subsolar point" readout in the HUD if you like.
- A → B (FYI): the globe already reacts to `mode`, `regionId`, `year`. The spotlight numbers should also count up/animate when `mode` changes (B3).

- A → B (B7/B8): **tour + playback hooks are ready** (once `frontend/globe-playback` is in submain):
  - `useApp.getState().setCameraTarget({ lat, lng, altitude, ms })` flies the camera anywhere (tour shots); `null` releases it back to the selected region / global view. `stopTour()` also clears it.
  - Any manual drag/zoom on the globe calls `stopTour()` automatically.
  - Year playback: just step `setYear()` every ~1.2s while `playing`; the globe pre-loads years and animates hex heights on a fixed cross-year scale (growth/decline is real, not re-normalised).

- A → B (**design refresh, please do next**): tokens and fonts changed globally (Archivo replaces Space Grotesk/JetBrains Mono; `.label` is now sentence-case condensed; `.panel` lost its corner brackets; big `font-mono` numbers become expanded readouts automatically). Your components still hard-code a few things the new system forbids. Follow `frontend/DESIGN.md` rules 1–7 in `src/ui/**` and `src/charts/**`: remove `uppercase`/`tracking-*` classes, split `·`-joined strings into separate elements, drop em-dash labels and `→`, use `.wordmark` for the brand, sentence-case toggle labels, badge copy "Sample data, not results".

- A → B (FYI): per the humans, A removed the fire icon from `Brand()` in `src/ui/TopBar.tsx` (one-off edit in your file, nothing else touched). Keep it out for now.

## Contract changes (shared/ edits that rename/remove things)
- A: `Mode` gains `'human'` (UI should use it instead of `'difference'`, which stays only for compatibility). `FireCell` gains `human` (0–1). New: `Place`, `Target`, `ProgressSummary`, `DailyPoint`, `DayDetail`; api `searchPlaces`, `placeFromPoint`, `getProgress`, `getDaily`, `getDay`, `currentTarget`; store `place/date/compareDates` + setters. `selectRegion` now also clears place/date/compare. A patched `src/ui/RecordBar.tsx` minimally (added the `human` entry) so the build stays green.
- A: design tokens in `src/index.css` changed **values** only (names kept). Fonts: `@fontsource/space-grotesk` and `@fontsource/jetbrains-mono` removed, `@fontsource-variable/archivo` added (imported in `main.tsx`).
- _none yet_

## Notes for the backend
- **Full contract and open questions: `frontend/API_CONTRACT.md`.**
- Frontend (B) aggregates `GET /cells?year=` (no region) for the global and per-region undercount in the region list / overview, using (harmonized − legacy) / legacy. If the backend computes undercount differently, a `GET /summary?year=` (global) endpoint would keep these consistent with `/regions/:id/summary`.
- Frontend expects: `GET /regions`, `GET /cells?year=&region=` (both `legacy` and `harmonized` counts per cell in one response), `GET /regions/:id/summary?year=`. Exact shapes: `src/shared/types.ts`.
