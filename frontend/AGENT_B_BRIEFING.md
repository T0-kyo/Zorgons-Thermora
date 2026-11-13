# Agent B briefing — read this first

You are **Agent B**, one of two Claude agents building the frontend of **Thermora** for team **Zorgons** at **NASA Space Apps Cairo 2026**. A human teammate directs you; another teammate directs **Agent A** (globe & 3D) in a separate session. You cannot talk to Agent A directly. You coordinate through files in this repo:

- `frontend/CLAUDE.md` — the rules (ownership, git, design language). **Binding.**
- `frontend/TASKS.md` — the task board. Your tasks are **B1–B11**. Requests to Agent A go in its "Requests" section.
- this file — the context you are missing.

---

## 1. The hackathon

- Runs **Fri 13 Nov 13:00 → Sat 14 Nov 13:00** (Cairo time, UTC+2). ~24 hours total.
- Submission needs: a public project link (no login), the GitHub repo, a **30-second video or 7 slides**, a summary, and resources used.
- Judged on **Impact, Creativity, Validity (sound science/data), Relevance (to the challenge), Presentation**.
- The event requires disclosing AI use (already in `frontend/README.md`).

**Frontend timeline (Cairo):**
| When | Milestone |
|---|---|
| Fri 18:00 | Globe + fire hexes + toggle + spotlight panel on mock data |
| Fri 22:00 | All charts, year playback, tour mode |
| Sat 02:00 | Switched to real backend data |
| Sat 09:00 | **Feature freeze** |
| Sat 10:00 | Record demo video (the guided tour is used for it) |
| Sat 11:00 | Deploy freeze · Sat 12:00 submit |

## 2. The project (what the science is)

Challenge: **harmonizing NASA's MODIS and VIIRS satellite fire detections (FIRMS hotspots).**

**Core question:** *How much have we underestimated global fire activity, and the human fingerprint behind it, by treating MODIS and VIIRS as if they tell the same story? Which regions are most affected?*

MODIS (2000–present) is the long historical record; VIIRS (2012–present) has finer resolution and catches many **small fires MODIS misses**. The team's edge is not just merging them: we **measure the gap, correct the historical record, and show what changes.**

Pitch line: *"We didn't just harmonize the data. We found that the historical fire record systematically undercounts small fires, and we show exactly where, by how much, and what it means."*

**Three results the app must show:**
1. **Correction / undercount**: a region-aware MODIS→VIIRS correction, giving **% of fires the legacy record missed** per region (with uncertainty).
2. **Human-influence score**: vegetation fires only (gas flares, power plants and volcanoes removed). Weekly-cycle test: *nature has no 7-day rhythm*, so a weekday/weekend pattern is a **human fingerprint**. Output: probability 0–1 per region, and **how the correction shifts it**.
3. **Bias-corrected regional trends**: fire-regime trends, raw vs corrected, with uncertainty. Does the raw trend **survive** the correction?

**Regions (placeholder, data team may change them):** Sub-Saharan Africa, Amazon, Southeast Asia, Boreal North America, Boreal Eurasia, Australia, Mediterranean, India & China crop belts. They're defined in `src/shared/regions.ts`.

**Team roles:** data engineer (FIRMS pulls and filtering), data scientist (correction, human score, trends), backend lead (API contract and endpoints), integration (deploy and CI), and two frontend people (us). The frontend's success criteria: **the app answers all three questions in under 60 seconds**, the **toggle visibly changes the numbers, not just the labels**, it works on mobile, and it has good demo defaults.

## 3. The product

A full-screen **"real-time Earth"** (dark mission-control style, like a live-Earth wallpaper) with fire activity drawn as glowing hex columns. The user:
1. Lands on a slowly rotating Earth with live day/night and city lights. The headline poses the core question.
2. Picks a region → the camera flies there, the region is outlined, and the **spotlight panel** slides in.
3. Flips the **Legacy (MODIS) / Harmonized / Missed fires** toggle → hexes grow on the globe **and** the panel numbers count up.
4. Reads the panel: undercount %, human-influence gauge, weekly-cycle bars, raw vs corrected trend with a verdict.
5. Scrubs or plays years 2001–2025.
6. Or presses **▶ Tour** for an automatic ~60-second walkthrough (this becomes the demo video).

## 4. Who does what

**Agent A (other session):** `src/globe/**`. Real-time Earth shader, clouds, fire hexes, toggle animation, region outline and rings, camera, year transitions, globe performance. Already built on branch `frontend/globe-earth` (not merged into `submain` yet).

**You, Agent B:** everything the user reads and clicks, in `src/ui/**` and `src/charts/**`, plus layout and restyling in `src/App.tsx` and `src/index.css`. Tasks **B1–B11** in `TASKS.md`:
- B1 Top bar: brand, Legacy/Harmonized/Missed toggle, live UTC clock (+ optional subsolar-point readout)
- B2 Region list with mini undercount %
- B3 Spotlight panel: big undercount % with CI, legacy vs harmonized counts, **count-up animation on toggle**
- B4 Human-influence gauge (0–1, legacy and harmonized markers)
- B5 Weekly-cycle chart (7 bars Mon–Sun + mean line)
- B6 Trend chart (raw vs corrected, uncertainty band, verdict badge)
- B7 Timeline (year slider + play)
- B8 Guided tour (~60s, any click stops it)
- B9 Global overview panel (no region selected)
- B10 Mobile layout (bottom sheet, region chips)
- B11 About/Methods modal (sources: NASA FIRMS MODIS + VIIRS; method; team; AI-use note)

**Start with B1 → B3 → B6 → B4 → B5**, then B7, B8, B9, B10, B11.

## 5. How the code is wired (current state on `submain`)

- Vite + React 19 + TypeScript, Tailwind v4, zustand, recharts, framer-motion, react-globe.gl.
- `src/shared/types.ts`: data shapes (`Region`, `FireCell`, `RegionSummary`, `TrendPoint`, `Mode`).
- `src/shared/store.ts`: `useApp()` global state: `regionId`, `mode`, `year`, `playing`, `touring` and their setters. **The globe reacts to these**, so your controls just set them.
- `src/shared/api.ts`: `getRegions()`, `getCells(year, regionId?)`, `getSummary(regionId, year)`. Serves **mock data** (`mock.ts`) until `VITE_API_URL` is set. **Never `fetch` in components; always go through api.ts.** When the backend lands, only api.ts changes.
- `src/ui/*.tsx`: simple **stubs** (TopBar, RegionList, SpotlightPanel, Timeline). Replace them freely.
- `src/App.tsx`: the globe fills the screen; UI floats on a `pointer-events-none` overlay, and panels opt back in with `pointer-events-auto`.
- The **"MOCK DATA — NOT REAL RESULTS"** badge must stay visible while `USING_MOCK` is true.

**Coming from Agent A's branch** (will reach `submain` when merged; don't duplicate it):
- `src/shared/sun.ts` → `sunPosition()` for a live subsolar-point readout
- assets load via relative paths (`import.meta.env.BASE_URL`); `public/data/countries.geojson` becomes `countries.json`

## 6. Design rules (short; full version in CLAUDE.md)
- Dark only. Glass `.panel` cards with cyan corner brackets; `.label` for small uppercase mono captions.
- Color tokens only (`text-fire`, `text-cyan`, `text-missed`, `text-ok`, `text-warn`, `bg-panel`, `border-line`, `text-dim`): **fire = legacy, cyan = harmonized/corrected, magenta `missed` = fires the legacy record missed.**
- Space Grotesk for text, JetBrains Mono for numbers.
- Motion: panels slide 250–350ms; numbers animate on toggle. The UI should look like a NASA mission-control HUD, not a generic dashboard.
- Mobile: panels become a bottom sheet, regions become chips.

## 7. Git workflow (strict)
- **Never touch `main`.** Don't commit, merge, open PRs into it, or suggest doing so.
- Integration branch is **`submain`**. Open PRs into `submain`; humans merge.
- Work on `frontend/ui-<topic>` branches (this one, `frontend/ui-agent-b`, is fine to start on).
- Prefix commits `[B]`. Run `npm run build` before every push (it type-checks).
- Only edit inside `frontend/`, and never inside `src/globe/**`.
- Update your lines in `TASKS.md` (⚪ → 🟡 → 🟢) as you go.

## 8. Getting started
```bash
git fetch origin
git checkout frontend/ui-agent-b
cd frontend && npm install && npm run dev   # http://localhost:5173
```
Then mark B1 🟡 in `TASKS.md` and start.
