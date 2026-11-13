# Thermora — API contract (frontend ⇄ backend)

**Read first: `BACKEND_WANTS.md` (what each endpoint powers, and priorities).**

**Status:** the frontend calls **`https://zorgons-thermora-776b3.containers.snapdeploy.app`** (checks `GET /health` at startup). It runs in **hybrid mode**: each endpoint below is used as soon as it answers with the right shape; anything missing (return **404**), failing or malformed falls back to sample data, and the on-screen badge says so. **Ship endpoints one at a time. No frontend change is needed.** Source of truth on our side: `frontend/src/shared/types.ts` and `frontend/src/shared/api.ts`.

Backend team: the **decisions in section 1** block us. Please answer them at the bottom of this file or tell us directly.

---

## Compatibility with the current backend (checked against `main`, Fri 23:00)

The backend's controller (`Backend/api/Controllers/DataController.cs`) has every endpoint below, under the **`/api`** prefix (`/api/cells` …). The frontend calls `/api/...` and accepts these differences automatically, so **no backend change is required for them**:

| Backend sends | Frontend converts to |
|---|---|
| `undercountCi: "±4.3%"` (string) | `[pct − 4.3, pct + 4.3]` |
| `humanScoreLegacy`, `humanScoreHarmonized` | `humanScore: { legacy, harmonized }` |
| progress `humanLikelihood: 0.77` (one number) | `{ legacy: 0.77, harmonized: 0.77 }` |
| `direction: "increasing" / "decreasing"` | `worse` / `better` |
| `date: "2019-01-01T00:00:00"` (DateTime) | `"2019-01-01"` |
| cells filter `?regionId=` | we send both `region` and `regionId` |

**What is still needed:** `DuckDbRepository` returns `{ "message": "... coming soon" }` for every endpoint. Until it returns real rows, the app shows sample data and the "Sample data" badge. As soon as an endpoint returns real data, that part of the app switches to it automatically.

## 0. At a glance

| # | Endpoint | Required? | What it powers | How often we call it |
|---|---|---|---|---|
| 1 | `GET /cells?year=` (`&region=`) | **Required** | the fires on the globe, the human/natural spectrum, region list values | once per year (we preload all 25 years for smooth playback) |
| 2 | `GET /regions/{id}/summary?year=` | **Required** | "Region findings": undercount, human score, weekly rhythm, trend | when a region is opened / year changes |
| 3 | `GET /progress?target` | **Required** | Progress view: "how much worse since 2001" | when a region/place is opened |
| 4 | `GET /daily?year=&target` | **Required** | Calendar view: every day of the year | when the calendar opens / year changes |
| 5 | `GET /day?date=&target` | Optional | day card + compare days (we can derive it from `/daily`) | when a day is clicked |
| 6 | `GET /regions` | Optional | region names/blurbs/outlines (we have local defaults) | once |
| 7 | `GET /summary?year=` | Optional | global numbers (today we sum `/cells`) | once per year |
| 8 | `GET /meta` | Optional | "Methods" panel: years, data version, sources | once |

`target` is either **`region=<id>`** or a place: **`lat=<deg>&lng=<deg>&radiusKm=<km>`** (aggregate everything within that radius). Place search itself happens in the frontend (offline gazetteer + OpenStreetMap). You only receive coordinates.

---

## 1. Decisions we need from you (blocking)

1. **Region list (5–8):** for each one, an `id` (slug), a display name, and the boundary used in the analysis (GeoJSON or a bbox). Our placeholders: `africa`, `amazon`, `seasia`, `boreal_na`, `boreal_eu`, `australia`, `med`, `india_china`. Is the Nile Delta in?
2. **Years served:** we assume 2001–2025.
3. **Map grid:** 0.5° / 1° lat-lng grid or H3 res 3–4. **Max ~3,000 cells per year worldwide** (we preload all years).
4. **Definitions,** so the screen matches the slides:
   - **undercount** = (harmonized − legacy) / legacy × 100, for the selected year?
   - **CI level** for the undercount (95%?)
   - **human likelihood** (0–1): output of the weekly-cycle test. Per cell if there are enough detections, else the region's value.
   - **weekday** basis: **local solar time** (acquisition UTC + longitude/15 h), not UTC.
   - **trend** units: raw fire counts, or an index (2001 = 100)?
5. **Demo hosting:** your base URL, and CORS for `http://localhost:5173`, `http://localhost:8080` and our deploy URL. **Or** choose Plan B (static files, section 6), which is safest on venue Wi-Fi.

---

## 2. Conventions

- `GET` only, JSON, **camelCase** property names (the ASP.NET default), UTF-8, gzip/brotli on.
- Numbers are plain numbers (no strings). Lat/lng in degrees, rounded to **2 decimals**. Likelihoods 0–1 with **2 decimals**. Percentages are numbers like `18.3`, meaning 18.3%.
- Dates are `YYYY-MM-DD` in **local solar time**.
- **Vegetation fires only** everywhere: STA mask applied (gas flares, power plants and volcanoes removed), VIIRS Type 0.
- **legacy** = the original MODIS record. **harmonized** = MODIS corrected to be consistent with VIIRS (the record the app treats as "real").
- Data never changes during the demo, so send `Cache-Control: public, max-age=3600`.
- Errors: `400` bad parameter, `404` unknown region, body `{ "error": "message" }`.

---

## 3. Required endpoints

### 3.1 `GET /cells?year=2019` · `GET /cells?year=2019&region=amazon`
One row per grid cell with vegetation fires in that year. Without `region`, return all study regions.

```ts
interface FireCell {
  lat: number         // cell centre
  lng: number
  regionId: string    // which study region the cell belongs to
  legacy: number      // fire detections in the MODIS record, that year
  harmonized: number  // same cell after harmonization (>= legacy in practice)
  human: number       // 0–1 likelihood that fire here is human-driven (weekly-cycle test)
}
```
```json
[
  { "lat": -4.5, "lng": -61.25, "regionId": "amazon", "legacy": 812, "harmonized": 968, "human": 0.81 }
]
```
- Both counts come in **one response**, so the Legacy/Harmonized switch animates without a refetch.
- `human` drives the globe colors (ice = natural → magenta = human) and the spectrum filter.
- Budget: ≤ 3,000 rows per year, globally.

### 3.2 `GET /regions/{id}/summary?year=2019`
```ts
interface RegionSummary {
  regionId: string
  year: number
  undercountPct: number               // e.g. 18.3
  undercountCi: [number, number]      // e.g. [15.0, 21.6]
  firesLegacy: number
  firesHarmonized: number
  humanScore: { legacy: number; harmonized: number }  // 0–1, before vs after correction
  weekdayCounts: number[]             // 7 values, MONDAY FIRST, mean detections per weekday
  trend: { year: number; raw: number; corrected: number; lo: number; hi: number }[]  // every year
  trendSurvives: boolean              // does the raw trend's direction survive correction?
  verdict: string                     // one plain sentence; may be "" and we'll write it
}
```
```json
{
  "regionId": "amazon", "year": 2019,
  "undercountPct": 18.3, "undercountCi": [15.0, 21.6],
  "firesLegacy": 9711, "firesHarmonized": 11486,
  "humanScore": { "legacy": 0.77, "harmonized": 0.83 },
  "weekdayCounts": [1052, 1083, 1094, 1072, 1031, 886, 842],
  "trend": [ { "year": 2001, "raw": 100.0, "corrected": 119.4, "lo": 108.7, "hi": 130.1 } ],
  "trendSurvives": true,
  "verdict": "Trend survives correction; human signal strengthens."
}
```

### 3.3 `GET /progress?region=amazon` · `GET /progress?lat=31.1&lng=30.9&radiusKm=150`
"How much worse since the start of the record".
```ts
interface ProgressSummary {
  name: string                          // region name; for places, echo anything (we show our own name)
  years: { first: number; last: number }
  series: { year: number; legacy: number; harmonized: number }[]   // yearly totals, every year
  baseline: number                      // mean harmonized fires/yr, first 3 years
  recent: number                        // mean harmonized fires/yr, last 3 years
  changePct: number                     // (recent - baseline) / baseline * 100
  direction: 'worse' | 'better' | 'stable'   // worse > +10%, better < -10%
  humanLikelihood: { legacy: number; harmonized: number }          // area value, 0–1
  covered: boolean                      // false if the place is outside all study regions
}
```

### 3.4 `GET /daily?year=2019&region=india_china` (or a place target)
Every day of the year, for the calendar heatmap.
```ts
interface DailyPoint { date: string; legacy: number; harmonized: number }   // date = YYYY-MM-DD (local solar)
```
```json
[ { "date": "2019-01-01", "legacy": 12, "harmonized": 15 }, { "date": "2019-01-02", "legacy": 9, "harmonized": 13 } ]
```
365 or 366 rows, days with zero fires included.

---

## 4. Optional endpoints

### 4.1 `GET /day?date=2019-11-03&region=india_china` (or a place). We derive this from `/daily` if missing.
```ts
interface DayDetail {
  date: string; weekday: number /* 0 = Monday */; isWeekend: boolean
  firesLegacy: number; firesHarmonized: number
  humanLikelihood: number      // the area's value (same for every day)
  vsYearAvgPct: number         // this day vs the year's daily mean, %
  vsWeekdayAvgPct: number      // this day vs the mean of the same weekday that year, %
  rankInYear: number           // 1 = most fires that year
}
```

### 4.2 `GET /regions`
```ts
interface Region {
  id: string; name: string; blurb: string
  center?: { lat: number; lng: number; altitude: number }   // camera view; omit and we use ours
  geometry?: GeoJSON.MultiPolygon                           // the analysis boundary
}
```

### 4.3 `GET /summary?year=2019`
```ts
interface GlobalSummary {
  year: number; undercountPct: number; undercountCi: [number, number]
  firesLegacy: number; firesHarmonized: number; humanLikelihood: number
  regions: { regionId: string; undercountPct: number; humanLikelihood: number }[]
}
```

### 4.4 `GET /meta`
```json
{ "years": { "min": 2001, "max": 2025 }, "dataVersion": "2026-11-13T20:00Z",
  "sources": ["NASA FIRMS MODIS C6.1 (MCD14ML)", "NASA FIRMS VIIRS 375 m (S-NPP, NOAA-20)"] }
```

---

## 5. Ready-to-paste C# DTOs (ASP.NET minimal API)

```csharp
namespace Backend.DTOs;

public record FireCellDto(double Lat, double Lng, string RegionId, int Legacy, int Harmonized, double Human);

public record HumanPairDto(double Legacy, double Harmonized);
public record TrendPointDto(int Year, double Raw, double Corrected, double Lo, double Hi);
public record RegionSummaryDto(
    string RegionId, int Year, double UndercountPct, double[] UndercountCi,
    int FiresLegacy, int FiresHarmonized, HumanPairDto HumanScore,
    int[] WeekdayCounts, TrendPointDto[] Trend, bool TrendSurvives, string Verdict);

public record YearPairDto(int Year, int Legacy, int Harmonized);
public record YearsDto(int First, int Last);
public record ProgressDto(
    string Name, YearsDto Years, YearPairDto[] Series, int Baseline, int Recent,
    double ChangePct, string Direction, HumanPairDto HumanLikelihood, bool Covered);

public record DailyPointDto(string Date, int Legacy, int Harmonized);

public record DayDetailDto(
    string Date, int Weekday, bool IsWeekend, int FiresLegacy, int FiresHarmonized,
    double HumanLikelihood, double VsYearAvgPct, double VsWeekdayAvgPct, int RankInYear);
```
```csharp
// Program.cs
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p
    .WithOrigins("http://localhost:5173", "http://localhost:8080", "https://<our-deploy-url>")
    .AllowAnyHeader().WithMethods("GET")));
builder.Services.AddResponseCompression();
var app = builder.Build();
app.UseCors();
app.UseResponseCompression();

app.MapGet("/cells", (int year, string? region) => /* FireCellDto[] */);
app.MapGet("/regions/{id}/summary", (string id, int year) => /* RegionSummaryDto */);
app.MapGet("/progress", (string? region, double? lat, double? lng, double? radiusKm) => /* ProgressDto */);
app.MapGet("/daily", (int year, string? region, double? lat, double? lng, double? radiusKm) => /* DailyPointDto[] */);
app.MapGet("/day", (string date, string? region, double? lat, double? lng, double? radiusKm) => /* DayDetailDto */);
```
`UndercountCi` is serialized as a 2-element array, exactly what we expect.

---

## 6. Plan B (recommended for the demo): static JSON files, no server

Everything is precomputed, so the data scientist can write the same responses to files. We bundle them and the demo works offline.

```
data/cells/2001.json … 2025.json               ← /cells?year=Y           (all regions)
data/regions/{id}/summary/2001.json … 2025.json ← /regions/{id}/summary?year=Y
data/regions/{id}/progress.json                 ← /progress?region=id
data/regions/{id}/daily/2001.json … 2025.json   ← /daily?year=Y&region=id
```
Places (arbitrary lat/lng) can't be precomputed. In Plan B we compute place progress and daily data **in the browser from the cells** (we already do this for the mock). We'd only need **daily data per cell**, or we fall back to the region's daily curve, scaled.

---

## 7. How to check you match

1. Open the app, open the browser console, run `await window.__thermoraApi.getSummary('amazon', 2019)`. That's the exact shape our mock returns. Compare it with your response.
2. Run the frontend against your API: `cd frontend && VITE_API_URL=http://localhost:5042 npm run dev`
3. While mock data is active, the UI shows "Sample data, not results". It disappears with a real API.

---

## Decisions (backend: fill in)
- Regions + boundaries:
- Years:
- Grid:
- Undercount period / CI level:
- Human likelihood: per cell or per region?
- Weekday basis (local solar?):
- Trend units:
- Hosting (URL + CORS) or Plan B static files:
