# Handoff to Agent B (Sat 14 Nov 2026, evening)

Agent A and its human are stopping for today. **You (Agent B) own the frontend from here.** This file is
the full context: what exists, why it is built this way, what the backend still owes us and why we asked
for each thing, and what is left. Read it whole before changing anything. `CLAUDE.md` still holds the
standing rules; where this file is newer, this file wins.

---

## 0. Where things are (read first)

| Thing | Where |
|---|---|
| Latest frontend | branch **`frontend/final-backend`** (this commit). It is `main` + one frontend commit (`f841c83`, backend v2 adaptation) + this handoff. |
| `main` | at the backend's `9c99e89` ("finish backend v2"). Everything frontend up to `b5676da` is on main. |
| How we put work on main | the humans say "push", then a **fast-forward** push: `git push origin frontend/final-backend:main`. No force pushes, ever. Check `git merge-base --is-ancestor origin/main HEAD` first; if main moved (backend pushes often), merge `origin/main` into the branch, re-test, then push. |
| Deployed app | Vercel, imported by Tokyo (repo owner). Root Directory `frontend`. **Check which branch Vercel builds** (README says `submain`, but we have been pushing to `main`; the humans believe Vercel deploys `main`). |
| Backend URL | `https://zorgons-thermora-776b3.containers.snapdeploy.app` (default in `src/shared/api.ts`, override with `VITE_API_URL`). The backend team says it is **moving to a new 16 GB server**: when they send the new URL, change `DEFAULT_API` in `src/shared/api.ts` (or set `VITE_API_URL` on Vercel) and push. |
| Pitch deck | Claude Slides artifact "Thermora: Who lit it?" (owned by the human's Claude account): https://claude.ai/artifact/EpeEV86CXrHrJcsNzjr4wK. 15 slides. Slide 13 (findings) has `[__]` placeholders to fill from live data; slide 15 needs team names and the live link; slides 9–10 use screenshots of **test data** (captioned as such) to be swapped for live screenshots. |
| Stand-in backend for testing | `frontend/dev/standin/` (see its README). Same SQL and JSON as the real backend, synthetic data. |

---

## 1. The non-negotiable rule: real data or nothing

The humans decided (twice, explicitly): **"either we use real data or we don't."**

- There is **no sample/mock data anywhere**. `src/shared/mock.ts` was deleted. Country outlines live in `src/shared/geo.ts` (geometry only).
- Every number on screen comes from the backend. If a call fails, that part shows "unavailable" and nothing in its place.
- A missing human score (backend `null`) is **"no score"**: grey on the globe, the text "no score" in panels. Never 0, never 0.5. A real `0.0` stays `0.0`.
- No hand-written claims about countries (the old blurbs like "Rice-straw burning in the Nile Delta" are gone). The tour picks its countries **from the data** and every caption figure comes from the backend; a step with no data is skipped.
- Methods text describes the real pipeline (engineering fire matching → science team score → per-area average), not methods we don't run.
- Do not reintroduce a fallback "to be safe". If you must show something while waiting, show a loading or waking state.

---

## 2. How the frontend works now (data layer)

All data goes through `src/shared/api.ts`. Components never `fetch()`.

**Request lifecycle**
1. `checkHealth()` runs at startup and **never gives up**: it calls `GET /health` (150 s timeout per try), backing off 3 s → 30 s between tries.
   Status (`src/shared/dataStatus.ts`): `checking` → `waking` (first ~5 min) → `down` (after 5 min, still retrying) → `up`.
2. Data calls go through `live(endpoint, path, normalize)`. They **wait for `/health` to succeed** before firing (so we don't hammer a waking server), allow 180 s, and retry only a dropped connection or a **502/503/504** (twice, 4 s then 8 s). A 4xx, a 500, or an unusable shape fails fast. Failure marks the endpoint `error` and throws.
3. On `up`: `syncRegions()` loads `GET /api/countries` (3 tries) into the shared `REGIONS` array; `syncMeta()` loads `GET /api/meta` and narrows the year slider (`YEARS` in `types.ts` is mutable) to the backend's years, opening on the latest one. Both bump `regionsVersion`; the menu, globe, filter and totals re-render/reload on that and on `backend === 'up'`.

**Badge** (`MockBadge` in `src/ui/TopBar.tsx`, name kept for history): "Connecting to data…", "Waking up the data server m:ss", "Backend not answering, retrying m:ss", "Live data", or "Live data, some parts unavailable" (when one request failed but the backend is up — one failure no longer turns the whole badge red).

**Normalizers** (in `api.ts`) turn the backend's shapes into ours (`src/shared/types.ts`):
- `normCells`: `human: null → -1` ("no score"); also reads `humanLow`, `humanHigh`, `confidence`, `scoredFires`.
- `normSummary`: weekday counts arrive **Sunday-first** (`EXTRACT(dow)`), we rotate to Monday-first. Human score `null → NaN`. `humanStats` = `{ low, high, counts{low,medium,high}, confidence (most common level), scoredFires, totalFires }`. `totalFires` is ignored if it equals `firesHarmonized` (that was the old detection-sum bug). `statTrend` = the science team's trend object (below).
- `normProgress`: `humanLikelihood { legacy, harmonized, low, high, confidence, scoredFires }` → `humanLikelihood` + `humanStats`.
- `countriesToRegions`: matches each backend country to Natural Earth (`public/data/countries.json`) by iso/id/name to get the outline, centroid and camera altitude. Ids are used **exactly as sent** (e.g. `United_States`); names for display (`United States of America`).
- `toRegionId`: maps a cell's country label ("United States") to our region id (`United_States`) via Natural Earth names.

**Where numbers come from in the UI**
- Country menu + Global view (`src/ui/data.ts → fetchYearTotals`): **per-country `/api/countries/{id}/summary?year=` + `/api/summary?year=`**, not the globe grid, because `/api/cells` is capped at the 3000 busiest 0.5° cells. Each figure stands alone: one failed call blanks only its own number.
- Globe + filter (Spectrum): `/api/cells?year=` (whole year, cached per year in `api.ts`, filtered client-side per country).
- Country panel: `/api/countries/{id}/summary` (Q1 undercount, Q2 human score with 95% range, confidence and "based on X of Y fires scored", weekly rhythm, **Q3 "Is fire activity changing?"** = `StatTrendChart`).
- Progress tab (countries and searched places): `/api/progress?region=` or `?lat=&lng=&radiusKm=`.
- Calendar: `/api/daily?year=&region=` or lat/lng. The **day card is derived from the same daily series** (+ progress for the human score), not from `/api/day`, so the calendar and the card always agree.

**Human-score display** (`src/ui/RecordBar.tsx → HumanHero`, `HumanEvidence`; `src/ui/HumanLegend.tsx → HumanScale` with a `range` bracket): score, a bracket for the 95% range on the natural→human ramp, confidence level with a high/medium/low bar, "Based on N of M fires scored, <period>". The period says which years the number covers (progress = all years, findings = selected year).

---

## 3. The backend contract we rely on (as of `9c99e89`)

All under `/api`, camelCase JSON. `/health` at the root returns `{"status":"Healthy"}`.

| Endpoint | We read |
|---|---|
| `GET /api/countries` | `[{ id, name, undercountPct, humanScore, confidence{low,medium,high} }]` (ids like `United_States`; stats are all-years, we only use id/name today) |
| `GET /api/meta` | `{ minDate, maxDate, totalDetections }` |
| `GET /api/cells?year=[&regionId=]` | `[{ lat, lng, regionId, legacy, harmonized, human, humanLow, humanHigh, confidence, scoredFires }]`, 0.5° grid, top 3000 by harmonized |
| `GET /api/countries/{id}/summary?year=` | `{ undercountPct, firesLegacy, firesHarmonized, weekdayCounts[7 Sun-first], humanScoreLegacy, humanScoreHarmonized, humanScoreLow, humanScoreHigh, confidence{low,medium,high}, scoredFires, totalFires, trend{ series[{year,count}], slope, direction, significance, pValue } \| null }` |
| `GET /api/summary?year=` | same as above, no weekday counts, `trend: null` |
| `GET /api/progress?region=\|lat,lng,radiusKm` | `{ series[{year,legacy,harmonized}], baseline, recent, changePct, direction worse/better/stable, humanLikelihood{legacy,harmonized,low,high,confidence{…},scoredFires}, covered }` |
| `GET /api/daily?year=&region=\|lat,lng,radiusKm` | `[{ date YYYY-MM-DD, legacy, harmonized }]` (only days with fires) |

Data (from the data team's contract, `harmonized_data` + `fire_level_assessment`, now partitioned per country on Hugging Face `dabroot/thermora-fires`): fires matched on a ~0.01° pixel per date/pass; `modis_detections`, `n_detections`, `fire_type` (0 vegetation, 1 volcano, 2 static land source, 3 offshore). Science table: `human_association_score` 0–1, `ci_lower`/`ci_upper` (95%), `confidence_level` Low/Medium/High (confidence in the human score, **not** the satellite detection confidence). Not all fires are scored. Industrial (`fire_type` 2/3) were auto-scored 1.0, which is why we asked for the `fire_type = 0` filter. Countries: Angola, China, Egypt, Greece, Oman, United Kingdom, United States, Yemen (2000–2025). Trend file: `Vegetation_Fire_Trend_Analysis_2018_2024.parquet` (Sen's slope, Mann-Kendall-style significance and p-value per country).

---

## 4. What we asked the backend for, and why

### Done by the backend (verified in their code)
| Request | Why we asked |
|---|---|
| `null` instead of `0.0` when nothing is scored | `0.0` reads as "100% natural"; it's actually unknown. |
| `humanLow/High`, `confidence`, `scoredFires` (cells); `humanScoreLow/High`, confidence counts, `scoredFires`, `totalFires` (summaries); same inside `progress.humanLikelihood` | The science team computed 95% intervals and confidence; showing a score without them overstates certainty. "Based on X of Y" tells people how much of the area is actually scored. |
| `COALESCE(SUM(CASE …),0)` for confidence counts | `SUM` over zero rows is NULL and `Convert.ToInt32` threw → a 500 for any country-year without fires. |
| `totalFires = COUNT(*)` | It was the detection sum, so "X of Y fires" compared fires with detections. |
| `humanScoreLegacy` restored | Feeds the "legacy vs corrected" human comparison (shown only when present). |
| `fire_type = 0` everywhere | Industrial/offshore sources were scored 1.0 human with high confidence and volcanoes counted as fires; the story is who lights **vegetation** fires. |
| Per-country Parquet files | Single-country queries read far less data (faster, less memory). |

### Still open (sent to the backend team today; **check their code before assuming fixed**)
1. **BLOCKER — multi-file `read_parquet`.** For all-country queries they build `read_parquet('a.parquet', 'b.parquet', …)`. DuckDB only accepts a **list**: `read_parquet(['a.parquet', 'b.parquet'])`. Verified failing on DuckDB 1.4.1 and 2.0.0 (`Binder Error: No function matches … read_parquet(VARCHAR, VARCHAR)`). This breaks `/api/countries`, `/api/cells` (no regionId), `/api/summary`, `/api/meta`, and place (lat/lng) progress/daily ⇒ **the app shows no countries and no globe**. Fix: wrap the joined list in `[...]` in `GetEngineerPath(null)` / `GetScientistPath(null)`. Single-country Swagger tests pass, which is likely why it was missed.
2. **US/UK progress and daily come back empty.** Those queries still filter `e.country = ?` with the id `United_States`, but the column says `United States`. Fix: drop the filter (each file is already one country) or compare `REPLACE(?, '_', ' ')`.
3. **US/UK get no trend.** Trend query does `REPLACE(country,'_',' ') = ?` with `United_States`. Fix: `REPLACE(country,'_',' ') = REPLACE(?,'_',' ')`.
4. **Security: SQL/path injection.** The `{id}` from the URL is interpolated into a quoted file path in SQL (`'…/countries/{id}.parquet'`). A crafted id with a quote can read other files/URLs. Fix: accept only ids in their `AllCountries` list, else 404 (also fixes 2/3 cleanly via the file-name mapping).
5. **`/api/countries` is now a full scan** (it used to be a fixed list) and it's the first thing the app needs. Cached 30 min, but every cold start pays it. Suggest: fixed list for ids/names, stats computed separately or precomputed.
6. **Hosting / cold start.** SnapDeploy free tier sleeps when idle; waking took 10–15 min for the humans today. Observed: a browser visit to the sleeping URL shows "Container is Sleeping… ready in 60–90 s" (HTTP 503) and woke it within ~40 s; then it returned **502 for a short while** right after becoming healthy (likely an out-of-memory restart: each request opens its own DuckDB with `memory_limit = 400MB` reading remote Parquet, and our first burst is ~10 parallel queries). They say they're migrating to a 16 GB server. Until then: SnapDeploy "always-on" ($1/24 h sprint pack) for demo day, or open `/health` in a tab ~2 min before presenting.

Older requests (all resolved earlier today): parameterized SQL (was injectable), `ORDER BY` before `LIMIT` on cells, 0.5° grid, `/daily` and `/progress` honouring lat/lng, real human scores (were all 0), country-name ids.

---

## 5. Decisions and why (so you don't undo them)

- **Countries, not regions.** Team decision (Sat 10:10). Ids are the backend's labels; we never invent ids.
- **Menu numbers from summaries, not cells** (cells are capped at 3000; small countries would be undercounted).
- **Day card from `/daily`, not `/day`** (`/day` returns only counts; deriving keeps calendar and card consistent).
- **Wait for `/health` before data calls; never give up.** Cold start is minutes; giving up looked like "backend unreachable" to judges.
- **Fail fast on 500.** A deterministic query error won't fix itself; retrying it delayed the whole menu ~12 s.
- **Two mode tabs only:** "Human or natural" (default) and "Harmonized (MODIS + VIIRS)". MODIS-only tab was removed on request.
- **Selecting a country stops the spin** and keeps it centred (human request).
- **Design:** editorial "Who lit it?" look, Gloock display + Archivo text, ice-blue natural → magenta human ramp, collapsible rails (keys `[` `]` `\`), Spectrum filter (keys N/M/U/A, H toggles colouring). See `DESIGN.md`.

---

## 6. Testing (how A verified everything)

- Stand-in backend: `frontend/dev/standin/` (`makedata.py`, `server.py`). It runs the backend's SQL in DuckDB and returns the same JSON, with open bugs 1–3 **fixed** (so it shows what the app does once the backend is fixed). `WAKE`/`MODE` env vars simulate the sleeping container.
- Build against it: `VITE_API_URL=http://localhost:5098 npm run build && npx vite preview --port 4199`.
- Headless checks: Playwright with `/usr/bin/google-chrome` and `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`. Useful handles in the page: `window.__thermoraApi.status()` (backend state + per-endpoint real/error), `window.__thermoraApi.getSummary(id, year)` etc., `window.__thermora` (app store).
- Verified today: live data path end to end; backend down (badge + empty states, no numbers); 75 s held wake + 25 s slow first query (data at ~100 s); 503 wake for 50 s (timer then Live); range/confidence/coverage panels; underscore ids; Oman; trend Q3.
- **Never** present stand-in screenshots as results (the deck's two screenshots are captioned "test data" for this reason).

---

## 7. What's left for you

1. **When the backend fixes item 1** (and 2–4), merge `origin/main` into this branch, run the stand-in check, and confirm on the deployed site: badge "Live data", 8 countries with numbers, globe embers, US/UK calendars and trend.
2. **New server URL** → update `DEFAULT_API` (or Vercel `VITE_API_URL`), push after the humans say so.
3. **Optional frontend hardening** (agreed as ideas, not built yet):
   - a "Wake the server" link in the badge after ~30 s of waking (opens the backend URL in a new tab; a real visit wakes SnapDeploy);
   - stagger the first burst of requests (menu summaries) so a freshly woken small server isn't hit with ~10 parallel queries;
   - fill the menu progressively instead of waiting for all summaries;
   - use `/api/countries` stats for an all-years menu view if the humans want it.
4. **Deck:** fill slide 13 findings from the live app (the tour picks exactly those: biggest undercount, most human, most natural), team names + live link on slide 15, swap slides 9–10 screenshots for live ones and drop the "test data" caption.
5. Keep `API_CONTRACT.md` in step with whatever the backend ships.

Rules recap: work only in `frontend/`; branches `frontend/ui-*` for you; never force-push; nothing on `main` unless the humans say "push"; real data only.
