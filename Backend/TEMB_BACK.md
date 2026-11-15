# Temb_back: DuckDB data-layer fixes

Branch made from `main` (`821a9ff`). Every endpoint and route keeps working; the JSON only **gains** fields
or turns a value into `null` where it used to crash or show a wrong 0.

## What was broken, and what changed

| Problem | Fix |
|---|---|
| `SUM()` of integer columns comes back from DuckDB as HUGEINT (`BigInteger`); `Convert.ToInt32` throws on it → 500 on summary, cells, daily, progress | Every value is read through a type-safe helper (handles HUGEINT, DECIMAL, NULL) |
| A new in-memory DuckDB per request, each with its own 400 MB limit → a burst of requests runs out of memory (502) | One shared DuckDB for the whole app, `MaxConcurrentQueries` slots (default 2), spills to disk (`TempDirectory`) |
| Only 8 countries hard-coded; the dataset has 37 (and grows) | Country list read from `countries/_manifest.json` (refreshed hourly; built-in fallback that keeps only files that exist) |
| Only 8 countries have `_human_likelihood` files; adding the others to a multi-file read fails the whole query | Each country is checked for a score file; countries without one get `null` scores (`hasScores: false`) |
| Unknown / malicious id → plain `Exception` → 500 | 404 `NotFoundException`; ids may be `United_States`, `united states` or `USA`; paths are built only from the catalog |
| Border pixels are in two countries' files with the same `fire_id` → counted twice in all-country queries | One row per `fire_id` before counting |
| Score file with a repeated `fire_id` duplicates fires in the join | Scores averaged per `fire_id` before the join |
| Undercount / legacy / harmonized were detection sums (VIIRS 375 m pixels inflate them) | Counts are **fires**: `firesLegacy` = fires MODIS saw, `firesHarmonized` = all fires, undercount from those |
| Progress compared 2000–02 (MODIS only, 2000 partial) with recent years (MODIS + VIIRS) → "worse" by construction | Complete years only, years without fires = 0, windows 2018–20 vs last 3 years (same satellites); returns `baselineYears`, `recentYears`, `basis` |
| `p_value` (or any trend value) null → `Convert.ToDouble(DBNull)` → 500 | Trend file read once, columns discovered, every value nullable |
| `EXTRACT(YEAR FROM date) = ?` / `CAST(date AS VARCHAR) = ?` read every row group | Plain date ranges (and a lat/lng box before the circle) so DuckDB skips row groups |
| Place queries read every country | Only countries whose files' lat/lng statistics can contain the circle |
| `/api/countries` scanned everything on every cold start | List returned at once; all-years stats computed in the background when idle |
| Cells: top 3000 by size → small countries vanish; border cells twice | Each country keeps its busiest `CellsPerCountry` cells first; a border cell belongs to the country with most fires in it |
| Cache unbounded; identical parallel requests each ran the query | Size-limited cache; identical in-flight requests share one query |
| `meta.maxDate` = 2025-01-01 (local-date spill-over) → a near-empty "2025" year | Trimmed to the requested years (2024-12-31); `firstFullYear` / `lastFullYear` added |
| httpfs downloaded on every cold start | Bundled in the Docker image (falls back to installing at start-up) |

## New / changed response fields

- `GET /api/countries`: `+ iso3, hasScores, firstDate, lastDate`; `undercountPct`, `humanScore`, `confidence` are `null` until computed.
- `GET /api/countries/{id}/summary`, `/api/summary`: `+ regionId, year, hasScores`; `undercountPct` `null` when MODIS saw no fire but VIIRS did; `trend` values nullable. `totalFires == firesHarmonized` now (both are fires).
- `GET /api/progress`: `+ baselineYears, recentYears, basis`; `humanLikelihood.legacy` is filled.
- `GET /api/meta`: `+ firstFullYear, lastFullYear, countries, scoredCountries`; `totalDetections` = fire observations.
- `GET /api/day?date=` must be `YYYY-MM-DD` (400 otherwise); lat/lng/radius validated (400).

## Settings (`appsettings.json` → `DataSettings`, or env `DataSettings__Name`)

`BaseUrl` (HF resolve URL or a local folder), `HfToken` (optional, raises HF rate limits), `MemoryLimit` (default 1GB;
use ~60% of the server's RAM), `Threads`, `MaxConcurrentQueries`, `TempDirectory`, `CacheMinutes`, `CacheEntries`,
`CatalogRefreshMinutes`, `CellLimit`, `CellsPerCountry`, `ProgressBaselineStart`, `ProgressWindowYears`, `PrecomputeCountryStats`.

## How it was tested

Built with .NET 10 and DuckDB.NET 1.5.6.1 against a dataset shaped like `dabroot/thermora-fires` (manifest, border
pixels in two files, score files for some countries with repeated ids, trend row with null `p_value`, 1 Jan 2025
spill-over). 82 checks of every endpoint against independent DuckDB calculations pass: from a local folder, over
HTTP with httpfs (range requests, like Hugging Face), with no manifest, a 100 MB memory limit and one query slot,
mismatched column sets between files, and a burst of 24 parallel requests. The current `main` code returns 500 on
the same data (HUGEINT cast).

## Frontend follow-ups (Agent B)

1. `normSummary` drops `totalFires` when it equals `firesHarmonized` (old detection-sum workaround): remove that check,
   or "based on X of Y fires" loses its Y.
2. Progress: label/shade the windows from `baselineYears` / `recentYears` instead of the first/last 3 series points.
