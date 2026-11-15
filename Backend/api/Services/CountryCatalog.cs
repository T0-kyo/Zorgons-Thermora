using System.Collections.Concurrent;
using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using api.Config;
using api.DTOs;
using Microsoft.Extensions.Options;

namespace api.Services;

/// <summary>Latitude/longitude box of a country's file (from Parquet statistics).</summary>
public record GeoBounds(double MinLat, double MaxLat, double MinLon, double MaxLon);

public sealed record CountryInfo(
    string Id,               // file name without .parquet, e.g. "United_States" (also the value of the 'country' column)
    string Name,             // display name, e.g. "United States of America"
    string? Iso3,
    string Path,             // engineer file (harmonized fires)
    string? SciencePath,     // {Id}_human_likelihood.parquet, null when the science team has not scored this country
    DateOnly? FirstDate,
    DateOnly? LastDate,
    long? Rows)
{
    public GeoBounds? Bounds { get; init; }
    /// <summary>Columns of this country's score file; null when it has none (or an unusable one).</summary>
    public ScienceSchema? Science { get; init; }
}

/// <summary>Which optional columns the science files have (read once, so queries never reference a missing column).</summary>
public sealed record ScienceSchema(bool HasCiLower, bool HasCiUpper, bool HasConfidence);

public sealed class CatalogSnapshot
{
    public required IReadOnlyList<CountryInfo> Countries { get; init; }
    public required IReadOnlyDictionary<string, CountryInfo> ById { get; init; }
    public required IReadOnlyDictionary<string, TrendDto> Trends { get; init; }   // key: Norm(country)
    public DateOnly? MinDate { get; init; }
    public DateOnly? MaxDate { get; init; }
    public int FirstFullYear { get; init; }
    public int LastFullYear { get; init; }
    public long TotalRows { get; init; }
    public required string Source { get; init; }    // "manifest" or "built-in list"
    public DateTime LoadedUtc { get; init; }

    public IEnumerable<CountryInfo> Scored => Countries.Where(HasScores);
    public bool HasScores(CountryInfo c) => c.SciencePath != null && c.Science != null;

    public TrendDto? TrendFor(CountryInfo c) =>
        Trends.TryGetValue(CountryCatalog.Norm(c.Id), out var t) ? t
        : Trends.TryGetValue(CountryCatalog.Norm(c.Name), out t) ? t
        : c.Iso3 != null && Trends.TryGetValue(CountryCatalog.Norm(c.Iso3), out t) ? t : null;
}

public interface ICountryCatalog
{
    Task<CatalogSnapshot> GetAsync(CancellationToken ct = default);

    /// <summary>The country for a URL id ("United_States", "united states", "USA"); 404 when unknown.</summary>
    Task<CountryInfo> ResolveAsync(string id, CancellationToken ct = default);
}

/// <summary>
/// The list of countries comes from the dataset itself (countries/_manifest.json), so a country
/// the data team uploads shows up without a code change. File paths are built from this list
/// only, never from user input. Score files and the trend file are optional per country.
/// </summary>
public sealed class CountryCatalog : ICountryCatalog
{
    private static readonly Regex SafeId = new("^[A-Za-z0-9][A-Za-z0-9_.-]{0,80}$", RegexOptions.Compiled);
    private static readonly Regex YearColumn = new("^(19|20)\\d\\d$", RegexOptions.Compiled);

    private readonly IDuckDbService _db;
    private readonly IHttpClientFactory _http;
    private readonly DataSettings _settings;
    private readonly ILogger<CountryCatalog> _logger;
    private readonly SemaphoreSlim _loadLock = new(1, 1);
    private CatalogSnapshot? _snapshot;
    private Task? _refresh;

    public CountryCatalog(IDuckDbService db, IHttpClientFactory http, IOptions<DataSettings> options, ILogger<CountryCatalog> logger)
    {
        _db = db;
        _http = http;
        _settings = options.Value;
        _logger = logger;
    }

    public static string Norm(string s) => new(s.ToLowerInvariant().Where(char.IsLetterOrDigit).ToArray());

    public async Task<CatalogSnapshot> GetAsync(CancellationToken ct = default)
    {
        var snap = _snapshot;
        if (snap == null)
        {
            await _loadLock.WaitAsync(ct);
            try { return _snapshot ??= await LoadAsync(CancellationToken.None); }
            finally { _loadLock.Release(); }
        }
        // stale: keep serving the current list while a fresh one loads in the background
        if (DateTime.UtcNow - snap.LoadedUtc > TimeSpan.FromMinutes(Math.Max(1, _settings.CatalogRefreshMinutes))
            && (_refresh == null || _refresh.IsCompleted))
        {
            _refresh = Task.Run(async () =>
            {
                try { _snapshot = await LoadAsync(CancellationToken.None); }
                catch (Exception e) { _logger.LogWarning(e, "Country list refresh failed; keeping the previous one"); }
            });
        }
        return snap;
    }

    public async Task<CountryInfo> ResolveAsync(string id, CancellationToken ct = default)
    {
        var snap = await GetAsync(ct);
        var key = (id ?? "").Trim();
        if (snap.ById.TryGetValue(key.Replace(' ', '_'), out var c)) return c;
        var n = Norm(key);
        c = snap.Countries.FirstOrDefault(x => Norm(x.Id) == n || Norm(x.Name) == n || (x.Iso3 != null && Norm(x.Iso3) == n));
        return c ?? throw new Exceptions.NotFoundException($"Unknown country '{id}'. See /api/countries for the list.");
    }

    // ---------------------------------------------------------------------------------------------
    private async Task<CatalogSnapshot> LoadAsync(CancellationToken ct)
    {
        var (entries, source) = await ReadManifestAsync(ct);
        if (source != "manifest")
        {
            // built-in list: keep only countries whose file really exists (one missing file in a
            // multi-file read_parquet fails the whole query)
            var present = await ProbeAsync(entries.Select(e => e.Id), id => $"countries/{id}.parquet", ct);
            entries = entries.Where(e => present.Contains(e.Id)).ToList();
        }
        var withScience = await ProbeAsync(entries.Select(e => e.Id), id => $"countries/{id}_human_likelihood.parquet", ct);

        var countries = entries
            .Select(e => new CountryInfo(
                e.Id, DisplayName(e.Id), Iso3.GetValueOrDefault(e.Id),
                _db.PathOf($"countries/{e.Id}.parquet"),
                withScience.Contains(e.Id) ? _db.PathOf($"countries/{e.Id}_human_likelihood.parquet") : null,
                e.First, e.Last, e.Rows))
            .OrderBy(c => c.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();

        // bounds (for place queries) and, without a manifest, the date range: from Parquet footers only
        var stats = await ReadFileStatsAsync(countries, ct);
        countries = countries.Select(c => stats.TryGetValue(c.Path, out var s)
            ? c with { Bounds = s.Bounds, FirstDate = c.FirstDate ?? s.MinDate, LastDate = c.LastDate ?? s.MaxDate, Rows = c.Rows ?? s.Rows }
            : c).ToList();

        // each score file is checked on its own: the science team's files need not all have the same columns
        var scored = new List<CountryInfo>();
        foreach (var c in countries)
            scored.Add(c.SciencePath == null ? c : c with { Science = await ReadScienceSchemaAsync(c, ct) });
        countries = scored;
        var trends = await ReadTrendsAsync(ct);

        var minDate = countries.Where(c => c.FirstDate.HasValue).Select(c => c.FirstDate!.Value).DefaultIfEmpty().Min();
        var lastDate = countries.Where(c => c.LastDate.HasValue).Select(c => c.LastDate!.Value).DefaultIfEmpty().Max();
        // fires are dated by LOCAL solar date, so the last UTC night of a year can land on 1 January
        // of the next one: that is not a year of data. Use the requested years when the manifest has them.
        int lastFull = entries.Select(e => e.LastRequestedYear).Where(y => y.HasValue).Select(y => y!.Value).DefaultIfEmpty(0).Max();
        if (lastFull == 0 && lastDate != default)
            lastFull = lastDate.Month == 1 && lastDate.Day <= 7 ? lastDate.Year - 1 : lastDate.Year;
        var maxDate = lastDate == default ? (DateOnly?)null
            : lastDate.Year > lastFull && lastFull > 0 ? new DateOnly(lastFull, 12, 31) : lastDate;
        int firstFull = minDate == default ? 0 : minDate.Month == 1 && minDate.Day <= 7 ? minDate.Year : minDate.Year + 1;

        var snap = new CatalogSnapshot
        {
            Countries = countries,
            ById = countries.ToDictionary(c => c.Id, StringComparer.OrdinalIgnoreCase),
            Trends = trends,
            MinDate = minDate == default ? null : minDate,
            MaxDate = maxDate,
            FirstFullYear = firstFull,
            LastFullYear = lastFull,
            TotalRows = countries.Sum(c => c.Rows ?? 0),
            Source = source,
            LoadedUtc = DateTime.UtcNow,
        };
        _logger.LogInformation("Country list from {Source}: {N} countries, {S} with human scores, {T} trend rows, data {Min}..{Max}",
            source, countries.Count, countries.Count(snap.HasScores), trends.Count, snap.MinDate, snap.MaxDate);
        return snap;
    }

    private sealed record ManifestEntry(string Id, DateOnly? First, DateOnly? Last, long? Rows, int? LastRequestedYear);

    private async Task<(List<ManifestEntry>, string)> ReadManifestAsync(CancellationToken ct)
    {
        try
        {
            var json = await ReadTextAsync("countries/_manifest.json", ct);
            using var doc = JsonDocument.Parse(json);
            var list = new List<ManifestEntry>();
            if (doc.RootElement.TryGetProperty("countries", out var cs) && cs.ValueKind == JsonValueKind.Object)
            {
                foreach (var p in cs.EnumerateObject())
                {
                    var v = p.Value;
                    var id = p.Name;
                    if (v.ValueKind == JsonValueKind.Object && v.TryGetProperty("file", out var f) && f.ValueKind == JsonValueKind.String)
                        id = System.IO.Path.GetFileNameWithoutExtension(f.GetString()!.Replace('\\', '/').Split('/').Last());
                    if (!SafeId.IsMatch(id) || id.EndsWith("_human_likelihood", StringComparison.OrdinalIgnoreCase))
                    {
                        _logger.LogWarning("Manifest entry '{Id}' skipped (not a safe file name)", id);
                        continue;
                    }
                    list.Add(new ManifestEntry(id, Date(v, "first_date"), Date(v, "last_date"), Long(v, "rows"), LastYear(v)));
                }
            }
            if (list.Count > 0) return (list, "manifest");
            _logger.LogWarning("Manifest has no countries; using the built-in list");
        }
        catch (Exception e)
        {
            _logger.LogWarning("Could not read countries/_manifest.json ({Msg}); using the built-in list", e.Message);
        }
        return (KnownCountries.Select(id => new ManifestEntry(id, null, null, null, null)).ToList(), "built-in list");
    }

    private async Task<string> ReadTextAsync(string relative, CancellationToken ct)
    {
        if (!_db.IsRemote) return await File.ReadAllTextAsync(_db.PathOf(relative), ct);
        var client = _http.CreateClient("dataset");
        return await client.GetStringAsync(_db.PathOf(relative), ct);
    }

    /// <summary>Which of these files exist. A missing file must never be put in a query (404 = the whole query fails).</summary>
    private async Task<HashSet<string>> ProbeAsync(IEnumerable<string> ids, Func<string, string> file, CancellationToken ct)
    {
        var found = new ConcurrentBag<string>();
        if (!_db.IsRemote)
        {
            foreach (var id in ids)
                if (File.Exists(_db.PathOf(file(id)))) found.Add(id);
            return found.ToHashSet();
        }
        var client = _http.CreateClient("dataset");
        await Parallel.ForEachAsync(ids, new ParallelOptions { MaxDegreeOfParallelism = 8, CancellationToken = ct }, async (id, token) =>
        {
            try
            {
                using var req = new HttpRequestMessage(HttpMethod.Head, _db.PathOf(file(id)));
                using var res = await client.SendAsync(req, token);
                if (res.IsSuccessStatusCode) found.Add(id);
                else if ((int)res.StatusCode != 404)
                    _logger.LogWarning("File check for {File} answered {Code}; treated as missing until the next refresh", file(id), (int)res.StatusCode);
            }
            catch (Exception e)
            {
                _logger.LogWarning("File check for {File} failed ({Msg}); treated as missing until the next refresh", file(id), e.Message);
            }
        });
        return found.ToHashSet();
    }

    private sealed record FileStats(GeoBounds? Bounds, DateOnly? MinDate, DateOnly? MaxDate, long? Rows);

    private async Task<Dictionary<string, FileStats>> ReadFileStatsAsync(List<CountryInfo> countries, CancellationToken ct)
    {
        var result = new Dictionary<string, FileStats>();
        if (countries.Count == 0) return result;
        try
        {
            await using var lease = await _db.AcquireAsync(ct);
            using var cmd = lease.Connection.CreateCommand();
            cmd.CommandText = $@"
                SELECT file_name, path_in_schema,
                       MIN(TRY_CAST(stats_min_value AS DOUBLE)) AS lo, MAX(TRY_CAST(stats_max_value AS DOUBLE)) AS hi,
                       MIN(TRY_CAST(stats_min_value AS DATE)) AS dlo, MAX(TRY_CAST(stats_max_value AS DATE)) AS dhi,
                       SUM(row_group_num_rows) AS nrows
                FROM parquet_metadata({FileList(countries.Select(c => c.Path))})
                WHERE path_in_schema IN ('latitude', 'longitude', 'date')
                GROUP BY ALL";
            var acc = new Dictionary<string, (double? la0, double? la1, double? lo0, double? lo1, DateOnly? d0, DateOnly? d1, long? rows)>();
            using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct))
            {
                var file = r.GetString(0);
                var col = r.GetString(1);
                acc.TryGetValue(file, out var a);
                double? lo = r.IsDBNull(2) ? null : r.GetDouble(2), hi = r.IsDBNull(3) ? null : r.GetDouble(3);
                if (col == "latitude") { a.la0 = lo; a.la1 = hi; }
                else if (col == "longitude") { a.lo0 = lo; a.lo1 = hi; }
                else
                {
                    a.d0 = AsDate(r, 4);
                    a.d1 = AsDate(r, 5);
                    a.rows = AsLong(r, 6);
                }
                acc[file] = a;
            }
            foreach (var (file, a) in acc)
            {
                var b = a is { la0: not null, la1: not null, lo0: not null, lo1: not null }
                    ? new GeoBounds(a.la0.Value, a.la1.Value, a.lo0.Value, a.lo1.Value) : null;
                result[file] = new FileStats(b, a.d0, a.d1, a.rows);
            }
        }
        catch (Exception e)
        {
            _logger.LogWarning("Could not read file statistics ({Msg}); place queries will read every country", e.Message);
        }
        return result;
    }

    private async Task<ScienceSchema?> ReadScienceSchemaAsync(CountryInfo c, CancellationToken ct)
    {
        try
        {
            var cols = await ColumnsAsync(c.SciencePath!, ct);
            if (!cols.Contains("fire_id") || !cols.Contains("human_association_score"))
            {
                _logger.LogError("Score file of {Id} lacks fire_id / human_association_score (has: {Cols}); its scores are not used",
                    c.Id, string.Join(", ", cols));
                return null;
            }
            return new ScienceSchema(cols.Contains("ci_lower"), cols.Contains("ci_upper"), cols.Contains("confidence_level"));
        }
        catch (Exception e)
        {
            _logger.LogWarning("Could not read the score file of {Id} ({Msg}); its scores are not used until the next refresh", c.Id, e.Message);
            return null;
        }
    }

    private async Task<HashSet<string>> ColumnsAsync(string path, CancellationToken ct)
    {
        await using var lease = await _db.AcquireAsync(ct);
        using var cmd = lease.Connection.CreateCommand();
        cmd.CommandText = $"DESCRIBE SELECT * FROM read_parquet({DuckDbService.Lit(path)})";
        var cols = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct)) cols.Add(r.GetString(0));
        return cols;
    }

    /// <summary>
    /// The trend file is small: read it whole, once. Columns are discovered (year columns, optional
    /// slope / direction / significance / p-value), so a renamed or missing column cannot crash a request.
    /// </summary>
    private async Task<Dictionary<string, TrendDto>> ReadTrendsAsync(CancellationToken ct)
    {
        var trends = new Dictionary<string, TrendDto>();
        try
        {
            await using var lease = await _db.AcquireAsync(ct);
            using var cmd = lease.Connection.CreateCommand();
            cmd.CommandText = $"SELECT * FROM read_parquet({DuckDbService.Lit(_db.PathOf(_settings.TrendFile))})";
            using var r = await cmd.ExecuteReaderAsync(ct);
            var names = Enumerable.Range(0, r.FieldCount).Select(r.GetName).ToList();
            int countryCol = names.FindIndex(n => n.Equals("country", StringComparison.OrdinalIgnoreCase));
            if (countryCol < 0) countryCol = Enumerable.Range(0, r.FieldCount).FirstOrDefault(i => r.GetFieldType(i) == typeof(string), -1);
            if (countryCol < 0) { _logger.LogWarning("Trend file has no country column; trends disabled"); return trends; }
            var years = names.Select((n, i) => (n, i)).Where(x => YearColumn.IsMatch(x.n)).ToList();
            int Col(string n) => names.FindIndex(x => x.Equals(n, StringComparison.OrdinalIgnoreCase));
            int slope = Col("sen_slope_per_year"), dir = Col("trend_direction"), sig = Col("trend_significance"), p = Col("p_value");

            while (await r.ReadAsync(ct))
            {
                if (r.IsDBNull(countryCol)) continue;
                var series = new List<TrendPointDto>();
                foreach (var (n, i) in years)
                {
                    var v = AsDouble(r, i);
                    if (v.HasValue) series.Add(new TrendPointDto(int.Parse(n, CultureInfo.InvariantCulture), (long)Math.Round(v.Value)));
                }
                trends[Norm(Convert.ToString(r.GetValue(countryCol), CultureInfo.InvariantCulture) ?? "")] = new TrendDto(
                    Series: series,
                    Slope: AsDouble(r, slope),
                    Direction: AsString(r, dir),
                    Significance: AsString(r, sig),
                    PValue: AsDouble(r, p));
            }
        }
        catch (Exception e)
        {
            _logger.LogWarning("Could not read the trend file ({Msg}); summaries will have no trend", e.Message);
        }
        return trends;
    }

    // ---------------------------------------------------------------------------------------------
    public static string FileList(IEnumerable<string> paths) => "[" + string.Join(", ", paths.Select(DuckDbService.Lit)) + "]";

    public static double? AsDouble(System.Data.Common.DbDataReader r, int i)
    {
        if (i < 0 || r.IsDBNull(i)) return null;
        var v = r.GetValue(i) is System.Numerics.BigInteger b ? (double)b : Convert.ToDouble(r.GetValue(i), CultureInfo.InvariantCulture);
        return double.IsFinite(v) ? v : null;
    }

    /// <summary>Any integer DuckDB returns, incl. HUGEINT (SUM of integers), which .NET's Convert cannot handle.</summary>
    public static long? AsLong(System.Data.Common.DbDataReader r, int i) => i < 0 || r.IsDBNull(i) ? null : r.GetValue(i) switch
    {
        long l => l,
        int n => n,
        short n => n,
        byte n => n,
        ulong n => (long)n,
        System.Numerics.BigInteger b => (long)b,
        decimal d => (long)d,
        double d => (long)Math.Round(d),
        var o => Convert.ToInt64(o, CultureInfo.InvariantCulture),
    };

    public static DateOnly? AsDate(System.Data.Common.DbDataReader r, int i) => i < 0 || r.IsDBNull(i) ? null : r.GetValue(i) switch
    {
        DateOnly d => d,
        DateTime t => DateOnly.FromDateTime(t),
        var o => DateOnly.TryParse(Convert.ToString(o, CultureInfo.InvariantCulture), CultureInfo.InvariantCulture, out var d) ? d : null,
    };

    public static string? AsString(System.Data.Common.DbDataReader r, int i) =>
        i < 0 || r.IsDBNull(i) ? null : Convert.ToString(r.GetValue(i), CultureInfo.InvariantCulture);

    private static DateOnly? Date(JsonElement v, string key) =>
        v.ValueKind == JsonValueKind.Object && v.TryGetProperty(key, out var d) && d.ValueKind == JsonValueKind.String
        && DateOnly.TryParse(d.GetString(), CultureInfo.InvariantCulture, out var x) ? x : null;

    private static long? Long(JsonElement v, string key) =>
        v.ValueKind == JsonValueKind.Object && v.TryGetProperty(key, out var d) && d.TryGetInt64(out var x) ? x : null;

    private static int? LastYear(JsonElement v) =>
        v.ValueKind == JsonValueKind.Object && v.TryGetProperty("years_requested", out var y) && y.ValueKind == JsonValueKind.Array
        && y.GetArrayLength() > 0 && y[y.GetArrayLength() - 1].TryGetInt32(out var x) ? x : null;

    public static string DisplayName(string id) => Names.TryGetValue(id, out var n) ? n : id.Replace('_', ' ');

    /// <summary>Used only when the manifest cannot be read (the files on Hugging Face, Nov 2026).</summary>
    private static readonly string[] KnownCountries =
    {
        "Angola", "China", "Croatia", "Cuba", "Egypt", "France", "Germany", "Greece", "Hungary", "India", "Indonesia",
        "Iran", "Iraq", "Italy", "Japan", "Kenya", "Kuwait", "Libya", "Madagascar", "Malawi", "Malaysia", "Maldives",
        "Mali", "Mexico", "Mozambique", "Oman", "South_Africa", "South_Sudan", "Spain", "Sudan", "Thailand", "Togo",
        "United_Arab_Emirates", "United_Kingdom", "United_States", "Yemen", "Zambia",
    };

    // the frontend matches these to its world map (Natural Earth names / codes)
    private static readonly Dictionary<string, string> Names = new(StringComparer.OrdinalIgnoreCase)
    {
        ["United_States"] = "United States of America",
        ["Democratic_Republic_of_the_Congo"] = "Democratic Republic of the Congo",
        ["Republic_of_the_Congo"] = "Republic of the Congo",
        ["Central_African_Republic"] = "Central African Republic",
    };

    private static readonly Dictionary<string, string> Iso3 = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Afghanistan"] = "AFG", ["Algeria"] = "DZA", ["Angola"] = "AGO", ["Argentina"] = "ARG", ["Australia"] = "AUS",
        ["Bangladesh"] = "BGD", ["Bolivia"] = "BOL", ["Botswana"] = "BWA", ["Brazil"] = "BRA", ["Burkina_Faso"] = "BFA",
        ["Cambodia"] = "KHM", ["Cameroon"] = "CMR", ["Canada"] = "CAN", ["Central_African_Republic"] = "CAF", ["Chad"] = "TCD",
        ["Chile"] = "CHL", ["China"] = "CHN", ["Colombia"] = "COL", ["Croatia"] = "HRV", ["Cuba"] = "CUB",
        ["Democratic_Republic_of_the_Congo"] = "COD", ["Egypt"] = "EGY", ["Ethiopia"] = "ETH", ["France"] = "FRA",
        ["Germany"] = "DEU", ["Ghana"] = "GHA", ["Greece"] = "GRC", ["Hungary"] = "HUN", ["India"] = "IND",
        ["Indonesia"] = "IDN", ["Iran"] = "IRN", ["Iraq"] = "IRQ", ["Italy"] = "ITA", ["Japan"] = "JPN", ["Kazakhstan"] = "KAZ",
        ["Kenya"] = "KEN", ["Kuwait"] = "KWT", ["Laos"] = "LAO", ["Libya"] = "LBY", ["Madagascar"] = "MDG", ["Malawi"] = "MWI",
        ["Malaysia"] = "MYS", ["Maldives"] = "MDV", ["Mali"] = "MLI", ["Mexico"] = "MEX", ["Morocco"] = "MAR",
        ["Mozambique"] = "MOZ", ["Myanmar"] = "MMR", ["Namibia"] = "NAM", ["Niger"] = "NER", ["Nigeria"] = "NGA",
        ["Oman"] = "OMN", ["Pakistan"] = "PAK", ["Paraguay"] = "PRY", ["Peru"] = "PER", ["Portugal"] = "PRT",
        ["Republic_of_the_Congo"] = "COG", ["Russia"] = "RUS", ["Saudi_Arabia"] = "SAU", ["South_Africa"] = "ZAF",
        ["South_Sudan"] = "SSD", ["Spain"] = "ESP", ["Sudan"] = "SDN", ["Tanzania"] = "TZA", ["Thailand"] = "THA",
        ["Togo"] = "TGO", ["Turkey"] = "TUR", ["Uganda"] = "UGA", ["Ukraine"] = "UKR", ["United_Arab_Emirates"] = "ARE",
        ["United_Kingdom"] = "GBR", ["United_States"] = "USA", ["Venezuela"] = "VEN", ["Vietnam"] = "VNM", ["Yemen"] = "YEM",
        ["Zambia"] = "ZMB", ["Zimbabwe"] = "ZWE",
    };
}
