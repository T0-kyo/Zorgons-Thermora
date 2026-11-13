# Thermora: what the frontend needs from the backend

*Frontend team (Zorgons)*
*Companion to `API_CONTRACT.md`, which has the exact JSON shapes and C# DTOs. This file lists **what each piece powers and how to compute it.***

---

## How to use this list

The app is **finished on sample data**. Every screen below already works; it just shows mock numbers and a "Sample data, not results" badge. Your job is to replace the mock with real numbers, endpoint by endpoint. Each section is one part of the app, ordered by priority.

| Priority | Meaning | Endpoints |
|---|---|---|
| **P0** | Without it the demo has no real data at all | `/cells` |
| **P1** | Core of the story; judges will look here | `/regions/{id}/summary`, `/progress`, `/daily` |
| **P2** | Nice to have; we already compute fallbacks | `/day`, `/regions`, `/summary`, `/meta` |

---

## 1. Decisions we need first

| # | Question | Why we need it | Our default if you don't answer |
|---|---|---|---|
| 1 | **Final region list**: id, name, boundary used in the analysis | Region menu, outlines on the globe, every per-region number | the 8 placeholders: `africa`, `amazon`, `seasia`, `boreal_na`, `boreal_eu`, `australia`, `med`, `india_china` |
| 2 | **Nile Delta in or out?** | It would be a strong local story for Cairo judges (rice-straw burning) | out |
| 3 | **Years** | Timeline range, playback, trend charts | 2001–2025 |
| 4 | **Grid**: 0.5°, 1°, or H3 res 3–4 | Size of the fire points on the globe | 1° grid |
| 5 | **Undercount definition**: period and CI level | The headline number "+18% missed" must match your slides | (harmonized − legacy) / legacy, per year, 95% CI |
| 6 | **Human likelihood: per cell or per region?** | Globe colors and the spectrum filter | region value copied to every cell |
| 7 | **Weekday basis** | The weekly rhythm is the human fingerprint; UTC weekdays smear it across time zones | local solar time |
| 8 | **Trend units**: counts or index | Trend chart axis label | index, 2001 = 100 |
| 9 | **Hosting**: live API URL, **or** static JSON files (Plan B) | How the frontend gets the data at the venue | Plan B |

---

## 2. Globe: the fires on the planet · `GET /cells` · **P0**

**What the user sees:** the 3D Earth with glowing fire points. In **Human or natural** mode (the default view), each point is colored from ice blue (likely natural) to magenta (likely human-driven). In **Harmonized** mode, points get bigger and brighter when harmonization adds the fires MODIS missed. The **spectrum** at the bottom is a histogram of all fires by human likelihood, with handles that filter the globe live. The **year timeline** plays 2001→2025.

**What we need per row (one row per grid cell, per year):**

| Field | Meaning | How to compute |
|---|---|---|
| `lat`, `lng` | cell centre, 2 decimals | grid you chose (decision 4) |
| `regionId` | which study region | point-in-polygon on region boundaries |
| `legacy` | vegetation fire detections in MODIS that year | count FIRMS MODIS rows, STA-masked, in the cell |
| `harmonized` | the same after harmonization | MODIS × your region-aware correction (2012+ overlap), or the VIIRS-equivalent count |
| `human` | 0–1 likelihood that fire here is human-driven | weekly-cycle test on the cell's detections (local solar weekday). Cells with too few detections (e.g. < 50) inherit the region value. |

**Rules:** one response holds both `legacy` and `harmonized` (the toggle animates without refetching). Without `?region=`, return all regions. **Max ~3,000 rows per year**: we preload all years so playback never waits.

**Done when:** `GET /cells?year=2019` returns rows that look like `{ "lat": -4.5, "lng": -61.25, "regionId": "amazon", "legacy": 812, "harmonized": 968, "human": 0.81 }`.

---

## 3. Region findings · `GET /regions/{id}/summary?year=` · **P1**

**What the user sees:** pick a region (right-hand menu, or click it on the globe). The left panel shows *Region findings* with the project's three questions:
- **Q1 "How much did the legacy record miss?"**: fires legacy vs harmonized, the undercount % with its range, and a stacked bar.
- **Q2 "Human or natural?"**: human score before vs after correction, plus the **weekly rhythm chart** (Mon–Sun bars vs the weekly mean; a weekend dip is the human fingerprint).
- **Q3 "Does the trend hold after correction?"**: yearly trend, raw vs corrected, with an uncertainty band and a verdict badge.

| Field | Meaning / how to compute |
|---|---|
| `undercountPct`, `undercountCi` | Σharmonized vs Σlegacy for the region and year; CI from your correction model (bootstrap is fine) |
| `firesLegacy`, `firesHarmonized` | the region's totals for the year |
| `humanScore.legacy` / `.harmonized` | weekly-cycle test on the raw MODIS record vs the harmonized record. **Showing how the correction shifts it is one of your success criteria.** |
| `weekdayCounts` | 7 numbers, **Monday first**: mean detections per weekday (local solar) |
| `trend[]` | every year: `raw` and `corrected` (decision 8 units), `lo`/`hi` band on corrected |
| `trendSurvives` | true if the raw trend's direction (slope sign) is still the same after correction |
| `verdict` | one plain sentence, or `""` and we'll write it |

**Done when:** `GET /regions/amazon/summary?year=2019` matches the shape in `API_CONTRACT.md` §3.2.

---

## 4. Progress view: "how much worse since 2001?" · `GET /progress` · **P1**

**What the user sees:** in a region or a picked place, the *Progress* tab shows a bar from the early-2000s average to the recent average, the % change ("+57%, getting worse"), a yearly sparkline (harmonized solid, legacy faint), and the area's human likelihood.

| Field | How to compute |
|---|---|
| `series[]` | for every year, the target's total legacy and harmonized fires |
| `baseline` / `recent` | mean harmonized fires per year over the first 3 / last 3 years |
| `changePct`, `direction` | (recent − baseline) / baseline × 100; worse > +10%, better < −10%, else stable |
| `humanLikelihood` | the area's human likelihood, legacy vs harmonized |
| `covered` | false if the target is outside every study region |

The **target** is `?region=<id>` **or** `?lat=&lng=&radiusKm=` (see section 6).

---

## 5. Calendar and comparing days · `GET /daily` (P1) and `GET /day` (P2)

**What the user sees:** the *Calendar* tab shows a month-grid calendar where each day is shaded by fire count. Click a day to get a day card: fires, weekday or weekend, vs the year's average, vs the average for that weekday, its rank in the year ("8th busiest day of 2019"), and the area's human likelihood. Users can pin up to 3 days to compare side by side, for example a weekday against a weekend.

| Endpoint | What | How to compute |
|---|---|---|
| `/daily?year=&target` | 365/366 rows `{ date, legacy, harmonized }`, zero days included | group detections by **local solar date** (acquisition UTC + lng/15 h) |
| `/day?date=&target` | the day card (optional) | we can derive it from `/daily`; skip it if short on time |

---

## 6. Place search and clicked spots · target parameters · **P1**

**What the user sees:** a search box ("Punjab", "Kalimantan", any town) and click-anywhere-on-the-globe. The camera flies there, drops a labelled marker, and the Progress and Calendar tabs switch to that spot (fires within 150 km).

**What we need from you:** nothing for the search itself; it runs in the browser. `/progress`, `/daily` and `/day` must accept **`lat`, `lng`, `radiusKm`** as the target, and sum everything within that radius (haversine distance on cells or raw detections). If the spot is outside every study region, return zeros with `covered: false`.

---

## 7. Global overview, region rankings, Methods · P2

| Endpoint | Powers | Fallback today |
|---|---|---|
| `/summary?year=` | the global headline ("Who lit it?", the global human likelihood, global undercount) and the ranked region list | we sum `/cells` in the browser |
| `/regions` | region names, one-line blurbs, real analysis boundaries | built-in placeholders + country outlines |
| `/meta` | the Methods panel: years, data version, sources (MODIS C6.1, VIIRS 375 m) | static text |

Build these after P0/P1. They keep the numbers consistent with your slides.

---

## 8. Rules for every endpoint

- **Vegetation fires only:** STA mask applied (gas flares, power plants, volcanoes out), VIIRS Type 0, agricultural burning **kept**.
- **Dates and weekdays in local solar time.**
- JSON with **camelCase** names (the ASP.NET default), numbers as numbers, lat/lng 2 decimals, likelihoods 2 decimals, percentages like `18.3`.
- `GET` only; gzip on; `Cache-Control: public, max-age=3600` (the data doesn't change during the demo).
- Errors: `400` bad parameter, `404` unknown region, body `{ "error": "..." }`.
- **Wording, in slides too:** the human signal is a *likelihood for an area*, never "this fire was set by a person".

---

## 9. Delivery and testing

**Option A: live API.** Give us the base URL and allow CORS from `http://localhost:5173`, `http://localhost:8080` and the deploy URL. Ready-to-paste C# DTOs and `Program.cs` wiring are in `API_CONTRACT.md` §5.

**Option B: static files (recommended for the demo).** Export the same JSON responses as files, and we bundle them, so there's no server to fail on venue Wi-Fi:
```
data/cells/{year}.json
data/regions/{id}/summary/{year}.json
data/regions/{id}/progress.json
data/regions/{id}/daily/{year}.json
```
Clicked places then get computed in the browser from the cells.

**How to check you match before handing over:**
1. Open the app, open the browser console, run `await window.__thermoraApi.getSummary('amazon', 2019)`: that's the exact shape we expect. Compare it with yours.
2. Run `cd frontend && VITE_API_URL=http://localhost:5042 npm run dev` and click through: globe, a region, Progress, Calendar.
3. The "Sample data, not results" badge disappears once real data is connected.

**Questions:** ask the frontend pair (or their agents, via `frontend/TASKS.md`).
