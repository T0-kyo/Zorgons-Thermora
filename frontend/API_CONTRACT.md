# What the frontend needs from the backend

Owner of this file: frontend (Agent A). Backend team: please reply in the "Decisions" section at the bottom, or tell us directly.
The frontend already runs on mock data with exactly these shapes (`src/shared/types.ts`, `src/shared/api.ts`). When your endpoints match, we set `VITE_API_URL` and nothing else in the UI changes.

---

## 1. Decisions we need first (blocking)

1. **The final region list** (5–8). For each: `id` (slug), display name, and the **boundary you actually used in the analysis** (GeoJSON polygon/multipolygon, or a lat/lng bounding box). We currently assume:
   `africa` Sub-Saharan Africa · `amazon` Amazon Basin · `seasia` Southeast Asia · `boreal_na` Boreal North America · `boreal_eu` Boreal Eurasia · `australia` Australia · `med` Mediterranean · `india_china` India & China crop belts.
   Is the Nile Delta (rice-straw burning) in or out?
2. **Year range** you'll serve (we assume 2001–2025; VIIRS overlap from 2012).
3. **Grid for the map cells**: a fixed lat/lng grid (e.g. 0.5° or 1°) or H3 (resolution 3 or 4). Max about **5,000 cells per year for the whole world**, so the globe stays smooth.
4. **Definitions**, so the numbers on screen mean the same thing as in your slides:
   - `undercountPct` = (harmonized − legacy) / legacy × 100? Over which period: the selected year, or the whole record?
   - The confidence interval level (95%?).
   - `humanScore`: probability 0–1 from the weekly-cycle test. "legacy" = computed on raw MODIS, "harmonized" = after correction.
   - `weekdayCounts`: for the selected year or all years? Weekday in **local solar time** (not UTC), please, or the weekend signal smears across time zones.
   - `trend` units: raw counts, or an index (2001 = 100)?
5. **Where it runs** for the demo (URL), and **CORS** allowed for our frontend origin (Vercel URL + `http://localhost:5173` + `http://localhost:8080`).

> The current `GtoDto` (satellite name, lat/lng, overpass time) looks like satellite overpass data. The frontend doesn't need raw detections or overpasses, only the **aggregates below**. If overpass data is meant for something else, tell us and we'll plan for it.

---

## 2. Endpoints (all `GET`, JSON, gzip on)

### `GET /regions`
```json
[
  {
    "id": "amazon",
    "name": "Amazon Basin",
    "center": { "lat": -7, "lng": -60, "altitude": 1.35 },
    "blurb": "Deforestation fires and pasture clearing.",
    "geometry": { "type": "MultiPolygon", "coordinates": [] }
  }
]
```
`center.altitude` is a camera distance in globe radii. If you don't want to own it, omit it and we'll keep our own values. `geometry` is optional (we fall back to country outlines).

### `GET /cells?year=2019` and `GET /cells?year=2019&region=amazon`
One row per grid cell that had **vegetation fires** that year (STA-filtered, VIIRS Type 0 / MODIS via STA mask).
```json
[
  { "lat": -4.5, "lng": -61.2, "regionId": "amazon", "legacy": 812, "harmonized": 968 }
]
```
- `legacy` = detections in the original MODIS record.
- `harmonized` = the corrected count (MODIS × your correction, or the VIIRS-calibrated equivalent).
- **Both in the same response**, so the Legacy/Harmonized toggle animates without refetching.
- Without `region`, return all regions (the global view). Cells outside the study regions can be omitted.

### `GET /regions/{id}/summary?year=2019`
```json
{
  "regionId": "amazon",
  "year": 2019,
  "undercountPct": 18.3,
  "undercountCi": [15.0, 21.6],
  "firesLegacy": 9711,
  "firesHarmonized": 11486,
  "humanScore": { "legacy": 0.77, "harmonized": 0.83 },
  "weekdayCounts": [1052, 1083, 1094, 1072, 1031, 886, 842],
  "trend": [
    { "year": 2001, "raw": 100.0, "corrected": 119.4, "lo": 108.7, "hi": 130.1 }
  ],
  "trendSurvives": true,
  "verdict": "Trend survives correction; human signal strengthens."
}
```
- `weekdayCounts` is **Monday first**, 7 values.
- `trend` covers every year in the range, the same for any `year` parameter.
- `verdict` is one plain sentence. If you'd rather not write copy, omit it and we'll generate it from `trendSurvives` and `humanScore`.

### `GET /summary?year=2019` (global; requested by the UI side)
```json
{
  "year": 2019,
  "undercountPct": 20.5,
  "undercountCi": [17.1, 23.8],
  "firesLegacy": 87545,
  "firesHarmonized": 105455,
  "regions": [ { "regionId": "india_china", "undercountPct": 41.2 } ]
}
```
Keeps the global numbers consistent with the per-region ones (today the UI sums cells itself).

### `GET /meta` (nice to have)
```json
{ "years": { "min": 2001, "max": 2025 }, "dataVersion": "2026-11-13T20:00Z", "sources": ["NASA FIRMS MODIS C6.1", "NASA FIRMS VIIRS S-NPP/NOAA-20 375m"] }
```
Shown in the Methods panel.

### Errors
`400` for a bad `year`, `404` for an unknown region, with `{ "error": "message" }`.

---

## 3. Plan B: static JSON files (strongly recommended for the demo)

All of this is **precomputed**; nothing depends on user input. If hosting the .NET API is risky on venue Wi-Fi, the data scientist can export the same responses as files and we bundle them into the frontend:

```
data/regions.json
data/cells/2001.json … data/cells/2025.json
data/summary/2019.json                 (global)
data/regions/amazon/summary/2019.json  (per region per year)
```
Same JSON shapes as above. Then the demo works with **zero servers**, and the API can still exist for the "real" product. Switching between the two is a one-line change in `src/shared/api.ts`.

---

## 4. .NET notes (minimal API)

```csharp
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p
    .WithOrigins("http://localhost:5173", "http://localhost:8080", "https://<our-vercel-url>")
    .AllowAnyHeader().WithMethods("GET")));
builder.Services.AddResponseCompression();
// ...
app.UseCors();
app.UseResponseCompression();
app.MapGet("/regions", ...);
app.MapGet("/cells", (int year, string? region) => ...);
app.MapGet("/regions/{id}/summary", (string id, int year) => ...);
app.MapGet("/summary", (int year) => ...);
```
Use camelCase JSON (the ASP.NET default), so the property names above match exactly.

---

## Decisions (backend: fill in)
- Regions + boundaries:
- Years:
- Grid:
- Definitions (undercount period, CI level, weekday basis, trend units):
- Demo URL / CORS:
- API or static files for the demo:
