using System.Collections.Concurrent;
using System.Data.Common;
using System.Globalization;
using api.Config;
using api.DTOs;
using api.Services;
using DuckDB.NET.Data;
using Microsoft.Extensions.Options;

namespace api.Repositories;

/// <summary>
/// All queries share one shape:
///   e = vegetation fires (fire_type 0) of the chosen countries, ONE row per fire_id
///       (a border pixel is listed in both countries' files with the same fire_id; it counts once);
///   s = the science team's score per fire_id (averaged if a fire_id is listed twice), only from
///       countries that HAVE a score file;
///   f = e LEFT JOIN s: every fire kept exactly once, score null when not scored.
/// Filters are on the raw columns (date ranges, lat/lng boxes) so DuckDB can skip whole row groups
/// of the remote files instead of downloading them. File paths come from the country catalog only.
/// </summary>
public class DuckDbRepository : IDataRepository
{
    private readonly IDuckDbService _db;
    private readonly ICountryCatalog _catalog;
    private readonly QueryCache _cache;
    private readonly CountryStatsStore _stats;
    private readonly DataSettings _settings;

    public DuckDbRepository(IDuckDbService db, ICountryCatalog catalog, QueryCache cache, CountryStatsStore stats, IOptions<DataSettings> options)
    {
        _db = db;
        _catalog = catalog;
        _cache = cache;
        _stats = stats;
        _settings = options.Value;
    }

    // =============================================================================================
    // endpoints
    // =============================================================================================
    public async Task<IEnumerable<CellDto>> GetCellsAsync(int year, string? regionId)
    {
        var snap = await _catalog.GetAsync();
        var countries = string.IsNullOrWhiteSpace(regionId) ? snap.Countries : [await _catalog.ResolveAsync(regionId)];
        var scope = Scope.ForYear(snap, countries, year);

        return await _cache.GetOrCreateAsync($"cells:{year}:{Key(countries, snap)}", async () =>
        {
            var sql = With(scope, science: true) + @",
                g AS (SELECT round(latitude * 2) / 2 AS lat, round(longitude * 2) / 2 AS lng,
                             region, modis, score, lo, hi, conf FROM f),
                -- a 0.5-degree cell on a border belongs to the country with most fires in it (one dot, not two)
                owner AS (SELECT lat, lng, arg_max(region, n) AS region
                          FROM (SELECT lat, lng, region, count(*) AS n FROM g GROUP BY ALL) GROUP BY ALL),
                cells AS (SELECT lat, lng,
                                 count(*) FILTER (WHERE modis) AS legacy, count(*) AS harmonized,
                                 avg(score) AS human, avg(lo) AS human_low, avg(hi) AS human_high,
                                 mode(conf) AS confidence, count(score) AS scored
                          FROM g GROUP BY ALL),
                ranked AS (SELECT c.*, o.region,
                                  row_number() OVER (PARTITION BY o.region ORDER BY c.harmonized DESC, c.lat, c.lng) AS rn
                           FROM cells c JOIN owner o USING (lat, lng))
            SELECT lat, lng, region, legacy, harmonized, human, human_low, human_high, confidence, scored
            FROM ranked
            -- every country keeps its busiest cells, then the rest by size: small countries are not
            -- pushed off the globe by China / India when no country is selected
            ORDER BY (rn <= $per_country) DESC, harmonized DESC, lat, lng
            LIMIT $limit";
            sql = sql.Replace("$per_country", Math.Max(0, _settings.CellsPerCountry).ToString(CultureInfo.InvariantCulture))
                     .Replace("$limit", Math.Max(1, _settings.CellLimit).ToString(CultureInfo.InvariantCulture));

            var cells = new List<CellDto>();
            await QueryAsync(sql, scope.Params, r => cells.Add(new CellDto(
                Lat: Dbl(r, "lat"),
                Lng: Dbl(r, "lng"),
                RegionId: Str(r, "region") ?? "",
                Legacy: Int(r, "legacy"),
                Harmonized: Int(r, "harmonized"),
                Human: NDbl(r, "human"),
                HumanLow: NDbl(r, "human_low"),
                HumanHigh: NDbl(r, "human_high"),
                Confidence: Str(r, "confidence"),
                ScoredFires: Int(r, "scored"))));
            return (IEnumerable<CellDto>)cells;
        });
    }

    public async Task<RegionSummaryDto> GetRegionSummaryAsync(string id, int? year)
    {
        var snap = await _catalog.GetAsync();
        var country = await _catalog.ResolveAsync(id);
        int y = year ?? snap.LastFullYear;
        return await _cache.GetOrCreateAsync($"summary:{country.Id}:{y}", async () =>
        {
            var s = await SummaryAsync(Scope.ForYear(snap, [country], y));
            return s with { Trend = snap.TrendFor(country), RegionId = country.Id, Year = y, HasScores = snap.HasScores(country) };
        });
    }

    public async Task<RegionSummaryDto> GetGlobalSummaryAsync(int? year)
    {
        var snap = await _catalog.GetAsync();
        int y = year ?? snap.LastFullYear;
        return await _cache.GetOrCreateAsync($"summary:*:{y}:{Key(snap.Countries, snap)}", async () =>
        {
            var s = await SummaryAsync(Scope.ForYear(snap, snap.Countries, y));
            return s with { Year = y, HasScores = snap.Scored.Any() };
        });
    }

    public async Task<ProgressDto> GetProgressAsync(string? region, double? lat, double? lng, double? radiusKm)
    {
        var snap = await _catalog.GetAsync();
        var target = await TargetAsync(snap, region, lat, lng, radiusKm);
        if (target.Countries.Count == 0) return EmptyProgress(snap);
        int first = snap.FirstFullYear, last = snap.LastFullYear;
        var scope = Scope.ForDates(snap, target.Countries, new DateOnly(first, 1, 1), new DateOnly(last + 1, 1, 1)).WithPlace(target.Place);

        return await _cache.GetOrCreateAsync($"progress:{target.Key}", async () =>
        {
            var sql = With(scope, science: true) + @"
            SELECT year(date) AS y,
                   count(*) FILTER (WHERE modis) AS legacy, count(*) AS harmonized,
                   sum(score) FILTER (WHERE modis) AS leg_sum, count(score) FILTER (WHERE modis) AS leg_n,
                   sum(score) AS s_sum, count(score) AS s_n,
                   sum(lo) AS lo_sum, count(lo) AS lo_n, sum(hi) AS hi_sum, count(hi) AS hi_n,
                   count(*) FILTER (WHERE lower(conf) = 'low') AS c_low,
                   count(*) FILTER (WHERE lower(conf) = 'medium') AS c_med,
                   count(*) FILTER (WHERE lower(conf) = 'high') AS c_high
            FROM f GROUP BY 1";

            var byYear = new Dictionary<int, (int legacy, int harmonized)>();
            double legSum = 0, sSum = 0, loSum = 0, hiSum = 0;
            long legN = 0, sN = 0, loN = 0, hiN = 0, cLow = 0, cMed = 0, cHigh = 0;
            await QueryAsync(sql, scope.Params, r =>
            {
                byYear[Int(r, "y")] = (Int(r, "legacy"), Int(r, "harmonized"));
                legSum += NDbl(r, "leg_sum") ?? 0; legN += Long(r, "leg_n");
                sSum += NDbl(r, "s_sum") ?? 0; sN += Long(r, "s_n");
                loSum += NDbl(r, "lo_sum") ?? 0; loN += Long(r, "lo_n");
                hiSum += NDbl(r, "hi_sum") ?? 0; hiN += Long(r, "hi_n");
                cLow += Long(r, "c_low"); cMed += Long(r, "c_med"); cHigh += Long(r, "c_high");
            });

            // every complete year, 0 when there were no fires (a skipped year would shift the windows)
            var series = Enumerable.Range(first, Math.Max(0, last - first + 1))
                .Select(y => byYear.TryGetValue(y, out var v) ? new ProgressSeriesDto(y, v.legacy, v.harmonized) : new ProgressSeriesDto(y, 0, 0))
                .ToList();
            var human = new HumanLikelihoodDto(
                Legacy: legN > 0 ? legSum / legN : null,
                Harmonized: sN > 0 ? sSum / sN : null,
                Low: loN > 0 ? loSum / loN : null,
                High: hiN > 0 ? hiSum / hiN : null,
                Confidence: new ConfidenceCountDto((int)cLow, (int)cMed, (int)cHigh),
                ScoredFires: (int)sN);
            if (series.All(p => p.Harmonized == 0)) return EmptyProgress(snap) with { HumanLikelihood = human };

            // windows inside one satellite set (default 2018 on: MODIS + VIIRS S-NPP + NOAA-20)
            int w = Math.Max(1, _settings.ProgressWindowYears);
            int b0 = Math.Max(first, _settings.ProgressBaselineStart), r1 = last;
            if (b0 + w - 1 > r1 - w + 1 - 1) b0 = Math.Max(first, r1 - 2 * w + 1); // too few years: two adjacent windows
            var baseYears = new YearRangeDto(b0, Math.Min(b0 + w - 1, r1));
            var recentYears = new YearRangeDto(Math.Max(first, r1 - w + 1), r1);
            double baseline = series.Where(p => p.Year >= baseYears.First && p.Year <= baseYears.Last).Average(p => p.Harmonized);
            double recent = series.Where(p => p.Year >= recentYears.First && p.Year <= recentYears.Last).Average(p => p.Harmonized);
            double change = baseline > 0 ? (recent - baseline) / baseline * 100 : 0;
            string direction = baseline > 0 ? (change > 10 ? "worse" : change < -10 ? "better" : "stable") : recent > 0 ? "worse" : "stable";

            return new ProgressDto(series, Math.Round(baseline, 1), Math.Round(recent, 1), Math.Round(change, 1), direction, human, true,
                baseYears, recentYears,
                baseYears.First >= 2018 ? "MODIS + VIIRS (S-NPP, NOAA-20) in both windows" : "same satellites in both windows");
        });
    }

    public async Task<IEnumerable<DailyDto>> GetDailyAsync(int year, string? region, double? lat, double? lng, double? radiusKm)
    {
        var snap = await _catalog.GetAsync();
        var target = await TargetAsync(snap, region, lat, lng, radiusKm);
        if (target.Countries.Count == 0) return [];
        var scope = Scope.ForYear(snap, target.Countries, year).WithPlace(target.Place);
        return await _cache.GetOrCreateAsync($"daily:{year}:{target.Key}", async () =>
        {
            var sql = With(scope, science: false) + @"
            SELECT strftime(date, '%Y-%m-%d') AS d, count(*) FILTER (WHERE modis) AS legacy, count(*) AS harmonized
            FROM e GROUP BY date ORDER BY date";
            var days = new List<DailyDto>();
            await QueryAsync(sql, scope.Params, r => days.Add(new DailyDto(Str(r, "d") ?? "", Int(r, "legacy"), Int(r, "harmonized"))));
            return (IEnumerable<DailyDto>)days;
        });
    }

    public async Task<DailyDto> GetDayAsync(DateOnly date, string? region, double? lat, double? lng, double? radiusKm)
    {
        var snap = await _catalog.GetAsync();
        var target = await TargetAsync(snap, region, lat, lng, radiusKm);
        var iso = date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        if (target.Countries.Count == 0) return new DailyDto(iso, 0, 0);
        var scope = Scope.ForDates(snap, target.Countries, date, date.AddDays(1)).WithPlace(target.Place);
        return await _cache.GetOrCreateAsync($"day:{iso}:{target.Key}", async () =>
        {
            var sql = With(scope, science: false) + @"
            SELECT count(*) FILTER (WHERE modis) AS legacy, count(*) AS harmonized FROM e";
            var day = new DailyDto(iso, 0, 0);
            await QueryAsync(sql, scope.Params, r => day = new DailyDto(iso, Int(r, "legacy"), Int(r, "harmonized")));
            return day;
        });
    }

    public async Task<IEnumerable<CountryDto>> GetCountriesAsync()
    {
        var snap = await _catalog.GetAsync();
        return snap.Countries.Select(c =>
        {
            _stats.TryGet(c.Id, out var st);
            return new CountryDto(c.Id, c.Name, st?.UndercountPct, st?.HumanScore, st?.Confidence,
                c.Iso3, snap.HasScores(c), c.FirstDate?.ToString("yyyy-MM-dd"), c.LastDate?.ToString("yyyy-MM-dd"));
        }).ToList();
    }

    public async Task<MetaDto> GetMetaAsync()
    {
        var snap = await _catalog.GetAsync();
        return new MetaDto(
            MinDate: snap.MinDate?.ToString("yyyy-MM-dd") ?? "",
            MaxDate: snap.MaxDate?.ToString("yyyy-MM-dd") ?? "",
            TotalDetections: snap.TotalRows,
            FirstFullYear: snap.FirstFullYear == 0 ? null : snap.FirstFullYear,
            LastFullYear: snap.LastFullYear == 0 ? null : snap.LastFullYear,
            Countries: snap.Countries.Count,
            ScoredCountries: snap.Scored.Count());
    }

    public async Task<CountryStats> ComputeCountryStatsAsync(string id)
    {
        var snap = await _catalog.GetAsync();
        var country = await _catalog.ResolveAsync(id);
        var s = await SummaryAsync(Scope.ForDates(snap, [country], new DateOnly(1990, 1, 1), new DateOnly(2100, 1, 1)));
        return new CountryStats(s.UndercountPct, s.HumanScoreHarmonized, s.Confidence);
    }

    // =============================================================================================
    // shared pieces
    // =============================================================================================
    private async Task<RegionSummaryDto> SummaryAsync(Scope scope)
    {
        var sql = With(scope, science: true) + @"
            SELECT count(*) FILTER (WHERE modis) AS legacy, count(*) AS harmonized,
                   avg(score) FILTER (WHERE modis) AS hs_legacy, avg(score) AS hs,
                   avg(lo) AS hs_low, avg(hi) AS hs_high, count(score) AS scored,
                   count(*) FILTER (WHERE lower(conf) = 'low') AS c_low,
                   count(*) FILTER (WHERE lower(conf) = 'medium') AS c_med,
                   count(*) FILTER (WHERE lower(conf) = 'high') AS c_high,
                   count(*) FILTER (WHERE dayofweek(date) = 0) AS d0, count(*) FILTER (WHERE dayofweek(date) = 1) AS d1,
                   count(*) FILTER (WHERE dayofweek(date) = 2) AS d2, count(*) FILTER (WHERE dayofweek(date) = 3) AS d3,
                   count(*) FILTER (WHERE dayofweek(date) = 4) AS d4, count(*) FILTER (WHERE dayofweek(date) = 5) AS d5,
                   count(*) FILTER (WHERE dayofweek(date) = 6) AS d6
            FROM f";
        RegionSummaryDto? result = null;
        await QueryAsync(sql, scope.Params, r =>
        {
            int legacy = Int(r, "legacy"), harmonized = Int(r, "harmonized");
            result = new RegionSummaryDto(
                UndercountPct: legacy > 0 ? Math.Round((double)(harmonized - legacy) / legacy * 100, 1) : harmonized == 0 ? 0 : null,
                FiresLegacy: legacy,
                FiresHarmonized: harmonized,
                WeekdayCounts: Enumerable.Range(0, 7).Select(i => (double)Long(r, "d" + i)).ToArray(),
                HumanScoreLegacy: NDbl(r, "hs_legacy"),
                HumanScoreHarmonized: NDbl(r, "hs"),
                HumanScoreLow: NDbl(r, "hs_low"),
                HumanScoreHigh: NDbl(r, "hs_high"),
                Confidence: new ConfidenceCountDto(Int(r, "c_low"), Int(r, "c_med"), Int(r, "c_high")),
                ScoredFires: Int(r, "scored"),
                TotalFires: harmonized,
                Trend: null);
        });
        return result ?? new RegionSummaryDto(0, 0, 0, new double[7], null, null, null, null, new ConfidenceCountDto(0, 0, 0), 0, 0, null);
    }

    /// <summary>WITH e, s, f (see class comment). Everything that varies is in scope.Where / scope.Params.</summary>
    private static string With(Scope scope, bool science)
    {
        var files = CountryCatalog.FileList(scope.Countries.Select(c => c.Path));
        var sb = new System.Text.StringBuilder();
        sb.Append($@"
            WITH e AS (
                SELECT fire_id,
                       any_value(latitude) AS latitude, any_value(longitude) AS longitude, min(date) AS date,
                       bool_or(modis_detections > 0) AS modis,
                       arg_max(region, n_detections) AS region
                FROM (SELECT fire_id, latitude, longitude, date, modis_detections, n_detections,
                             regexp_extract(filename, '([^/\\]+)\.parquet$', 1) AS region
                      FROM read_parquet({files}, union_by_name = true, filename = true)
                      WHERE fire_type = 0 {scope.Where})
                GROUP BY fire_id
            )");
        if (!science) return sb.ToString();

        var scored = scope.Countries.Where(scope.Snap.HasScores).ToList();
        // read_parquet(union_by_name) has a column when at least one of the files has it
        var sch = new ScienceSchema(scored.Any(c => c.Science!.HasCiLower), scored.Any(c => c.Science!.HasCiUpper),
                                    scored.Any(c => c.Science!.HasConfidence));
        if (scored.Count == 0)
        {
            sb.Append(@",
            s AS (SELECT NULL::VARCHAR AS fire_id, NULL::DOUBLE AS score, NULL::DOUBLE AS lo, NULL::DOUBLE AS hi, NULL::VARCHAR AS conf WHERE false)");
        }
        else
        {
            sb.Append($@",
            s AS (
                SELECT fire_id, avg(human_association_score) AS score,
                       {(sch.HasCiLower ? "avg(ci_lower)" : "NULL::DOUBLE")} AS lo,
                       {(sch.HasCiUpper ? "avg(ci_upper)" : "NULL::DOUBLE")} AS hi,
                       {(sch.HasConfidence ? "mode(confidence_level)" : "NULL::VARCHAR")} AS conf
                FROM read_parquet({CountryCatalog.FileList(scored.Select(c => c.SciencePath!))}, union_by_name = true)
                WHERE fire_id IN (SELECT fire_id FROM e)
                GROUP BY fire_id
            )");
        }
        sb.Append(@",
            f AS (SELECT e.*, s.score, s.lo, s.hi, s.conf FROM e LEFT JOIN s USING (fire_id))");
        return sb.ToString();
    }

    private async Task QueryAsync(string sql, IReadOnlyList<object> parameters, Action<DbDataReader> row)
    {
        await using var lease = await _db.AcquireAsync();
        using var cmd = lease.Connection.CreateCommand();
        cmd.CommandText = sql;
        foreach (var p in parameters) cmd.Parameters.Add(new DuckDBParameter(p));
        using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync()) row(r);
    }

    // ---- what a request is about ----------------------------------------------------------------
    private sealed record Place(double Lat, double Lng, double RadiusKm);
    private sealed record Target(IReadOnlyList<CountryInfo> Countries, Place? Place, string Key);

    private async Task<Target> TargetAsync(CatalogSnapshot snap, string? region, double? lat, double? lng, double? radiusKm)
    {
        if (!string.IsNullOrWhiteSpace(region))
        {
            var c = await _catalog.ResolveAsync(region);
            return new Target([c], null, c.Id);
        }
        if (lat is null || lng is null) return new Target([], null, "none");
        // rounded so near-identical requests share a cache entry (~100 m, 0.1 km)
        var place = new Place(Math.Round(lat.Value, 3), Math.Round(lng.Value, 3), Math.Round(Math.Clamp(radiusKm ?? 150, 1, 2000), 1));
        var box = Scope.BoxOf(place.Lat, place.Lng, place.RadiusKm);
        // only read countries whose files can contain the circle (from the files' own statistics)
        var countries = snap.Countries.Where(c => c.Bounds is null || box.Intersects(c.Bounds)).ToList();
        return new Target(countries, place, $"{place.Lat}:{place.Lng}:{place.RadiusKm}:{Key(countries, snap)}");
    }

    private static string Key(IReadOnlyList<CountryInfo> countries, CatalogSnapshot snap) =>
        countries.Count == snap.Countries.Count ? $"all{snap.Countries.Count}:{snap.LoadedUtc.Ticks}" : string.Join(",", countries.Select(c => c.Id));

    private static ProgressDto EmptyProgress(CatalogSnapshot snap) =>
        new(new List<ProgressSeriesDto>(), 0, 0, 0, "stable",
            new HumanLikelihoodDto(null, null, null, null, new ConfidenceCountDto(0, 0, 0), 0), false);

    // ---- reading values: by column name, null-safe, any numeric type (DuckDB SUM gives HUGEINT) ---
    private static int Ord(DbDataReader r, string name) => r.GetOrdinal(name);
    private static long Long(DbDataReader r, string name) => CountryCatalog.AsLong(r, Ord(r, name)) ?? 0;
    private static int Int(DbDataReader r, string name) => (int)Math.Clamp(Long(r, name), int.MinValue, int.MaxValue);
    private static double? NDbl(DbDataReader r, string name) => CountryCatalog.AsDouble(r, Ord(r, name));
    private static double Dbl(DbDataReader r, string name) => NDbl(r, name) ?? 0;
    private static string? Str(DbDataReader r, string name) => CountryCatalog.AsString(r, Ord(r, name));

    // ---- filters ---------------------------------------------------------------------------------
    private sealed record Box(double MinLat, double MaxLat, double MinLon, double MaxLon, bool WrapsLon)
    {
        public bool Intersects(GeoBounds b) =>
            b.MaxLat >= MinLat && b.MinLat <= MaxLat && (WrapsLon || (b.MaxLon >= MinLon && b.MinLon <= MaxLon));
    }

    private sealed record Scope(CatalogSnapshot Snap, IReadOnlyList<CountryInfo> Countries, string Where, IReadOnlyList<object> Params)
    {
        public static Scope ForYear(CatalogSnapshot snap, IReadOnlyList<CountryInfo> countries, int year) =>
            ForDates(snap, countries, new DateOnly(year, 1, 1), new DateOnly(year + 1, 1, 1));

        /// <summary>[from, to): a plain range on the date column, so row groups outside it are skipped.</summary>
        public static Scope ForDates(CatalogSnapshot snap, IReadOnlyList<CountryInfo> countries, DateOnly from, DateOnly to) =>
            new(snap, countries, "AND date >= CAST(? AS DATE) AND date < CAST(? AS DATE)",
                [from.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture), to.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)]);

        public Scope WithPlace(Place? p)
        {
            if (p is null) return this;
            var box = BoxOf(p.Lat, p.Lng, p.RadiusKm);
            var where = Where + " AND latitude BETWEEN ? AND ?";
            var ps = Params.ToList();
            ps.Add(box.MinLat); ps.Add(box.MaxLat);
            if (!box.WrapsLon) { where += " AND longitude BETWEEN ? AND ?"; ps.Add(box.MinLon); ps.Add(box.MaxLon); }
            // exact circle (haversine) after the cheap box
            where += @" AND 2 * 6371 * asin(sqrt(
                            pow(sin(radians(latitude - ?) / 2), 2) +
                            cos(radians(?)) * cos(radians(latitude)) * pow(sin(radians(longitude - ?) / 2), 2))) <= ?";
            ps.Add(p.Lat); ps.Add(p.Lat); ps.Add(p.Lng); ps.Add(p.RadiusKm);
            return this with { Where = where, Params = ps };
        }

        public static Box BoxOf(double lat, double lng, double radiusKm)
        {
            double dLat = radiusKm / 111.32;
            double cos = Math.Cos(lat * Math.PI / 180);
            double dLon = cos < 1e-6 ? 360 : radiusKm / (111.32 * cos);
            double minLon = lng - dLon, maxLon = lng + dLon;
            return new Box(lat - dLat, lat + dLat, minLon, maxLon, WrapsLon: dLon >= 180 || minLon < -180 || maxLon > 180);
        }
    }
}

/// <summary>All-years stats per country for /api/countries, filled in the background.</summary>
public sealed class CountryStatsStore
{
    private readonly ConcurrentDictionary<string, CountryStats> _stats = new(StringComparer.OrdinalIgnoreCase);
    public bool TryGet(string id, out CountryStats? stats) => _stats.TryGetValue(id, out stats);
    public void Set(string id, CountryStats stats) => _stats[id] = stats;
    public bool Has(string id) => _stats.ContainsKey(id);
}
