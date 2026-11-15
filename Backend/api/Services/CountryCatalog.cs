using System.Collections.Concurrent;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using api.Config;
using api.DTOs;
using Microsoft.Extensions.Options;

namespace api.Services;

/// <summary>Latitude/longitude box of a country's file (from Parquet statistics).</summary>
public record GeoBounds(double MinLat, double MaxLat, double MinLon, double MaxLon);

public sealed record CountryInfo(
    string Id,               // file name without .parquet, e.g. "United_States"; never read from the 'country' column
    string Name,             // display name, e.g. "United States of America"
    string? Iso3,
    string Path,             // engineer file (harmonized fires), at the exact dataset version
    string? SciencePath,     // {Id}_human_likelihood.parquet when the science team has scored this country
    DateOnly? FirstDate,
    DateOnly? LastDate,
    long? Rows,
    string FileVersion)      // changes when the file is replaced (Hugging Face object id, or size + time locally)
{
    public GeoBounds? Bounds { get; init; }
    /// <summary>Columns of this country's score file; null when it has none (or an unusable one).</summary>
    public ScienceSchema? Science { get; init; }
    /// <summary>Whether the fires file has a fire_type column (older uploads may not).</summary>
    public bool HasFireType { get; init; } = true;
    /// <summary>Changes when the score file is replaced.</summary>
    public string? ScienceVersion { get; init; }
    /// <summary>Key for anything computed from this country's files (changes when either file is replaced).</summary>
    public string StatsKey => $"{Id}@{FileVersion}@{ScienceVersion}";
}

/// <summary>Which optional columns a score file has (read once, so queries never reference a missing column).</summary>
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
    /// <summary>Dataset version this list was built from (Hugging Face commit, or a hash of the local files).</summary>
    public required string Version { get; init; }
    public required string Source { get; init; }
    public DateTime LoadedUtc { get; init; }
    public IReadOnlyList<string> Skipped { get; init; } = [];

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

    /// <summary>Check the dataset now instead of waiting for the next periodic check.</summary>
    Task<CatalogSnapshot> RefreshAsync(CancellationToken ct = default);

    DateTime LastCheckedUtc { get; }
}

/// <summary>
/// The country list is the list of FILES in the dataset's countries/ folder: every X.parquet is a
/// country with id X, and X_human_likelihood.parquet gives it human scores. Upload a file to
/// Hugging Face and it appears here at the next check (every CatalogRefreshSeconds, or at once via
/// POST /api/catalog/refresh); nothing in the code lists countries. countries/_manifest.json is
/// optional extra detail (dates, rows), never the list itself.
///
/// Files are read at an exact dataset version (the Hugging Face commit), so DuckDB's caches can
/// never mix bytes of an old and a new upload, and cached API answers are keyed by that version.
/// </summary>
public sealed class CountryCatalog : ICountryCatalog
{
    private static readonly Regex SafeId = new("^[A-Za-z0-9][A-Za-z0-9_.-]{0,80}$", RegexOptions.Compiled);
    private static readonly Regex YearColumn = new("^(19|20)\\d\\d$", RegexOptions.Compiled);
    private static readonly Regex HfResolve = new("^(?<host>https?://[^/]+)/datasets/(?<repo>[^/]+/[^/]+)/resolve/(?<rev>[^/]+)/?$", RegexOptions.Compiled);
    private const string Science = "_human_likelihood";
    private static readonly string[] Required = ["fire_id", "latitude", "longitude", "date", "modis_detections", "n_detections"];

    private readonly IDuckDbService _db;
    private readonly IHttpClientFactory _http;
    private readonly DataSettings _settings;
    private readonly ILogger<CountryCatalog> _logger;
    private readonly SemaphoreSlim _loadLock = new(1, 1);
    private CatalogSnapshot? _snapshot;
    private Task? _background;
    private long _checkedTicks;

    public CountryCatalog(IDuckDbService db, IHttpClientFactory http, IOptions<DataSettings> options, ILogger<CountryCatalog> logger)
    {
        _db = db;
        _http = http;
        _settings = options.Value;
        _logger = logger;
    }

    public DateTime LastCheckedUtc => new(Interlocked.Read(ref _checkedTicks), DateTimeKind.Utc);
    private TimeSpan RefreshEvery => TimeSpan.FromSeconds(Math.Max(15, _settings.CatalogRefreshSeconds));

    public static string Norm(string s) => new(s.ToLowerInvariant().Where(char.IsLetterOrDigit).ToArray());

    public async Task<CatalogSnapshot> GetAsync(CancellationToken ct = default)
    {
        var snap = _snapshot;
        if (snap == null) return await RefreshAsync(ct);
        // due for a check: keep answering with the current list while the check runs
        if (DateTime.UtcNow - LastCheckedUtc > RefreshEvery && (_background == null || _background.IsCompleted))
        {
            _background = Task.Run(async () =>
            {
                try { await RefreshAsync(CancellationToken.None); }
                catch (Exception e) { _logger.LogWarning(e, "Dataset check failed; keeping the current country list"); }
            });
        }
        return snap;
    }

    public async Task<CatalogSnapshot> RefreshAsync(CancellationToken ct = default)
    {
        await _loadLock.WaitAsync(ct);
        try
        {
            var listing = await ListAsync(_snapshot?.Version, CancellationToken.None);
            if (_snapshot != null && (listing == null || listing.Version == _snapshot.Version))
            {
                Interlocked.Exchange(ref _checkedTicks, DateTime.UtcNow.Ticks);
                return _snapshot;     // nothing changed: one small request, no reload
            }
            listing ??= await ListAsync(null, CancellationToken.None) ?? throw new InvalidOperationException("Dataset listing failed");
            var snap = await LoadAsync(listing, CancellationToken.None);
            if (snap.Countries.Count == 0 && _snapshot is { Countries.Count: > 0 })
            {
                _logger.LogWarning("Dataset version {V} has no readable country files; keeping the previous list", listing.Version);
                return _snapshot;
            }
            if (_snapshot != null)
            {
                var added = snap.Countries.Select(c => c.Id).Except(_snapshot.Countries.Select(c => c.Id)).ToList();
                var removed = _snapshot.Countries.Select(c => c.Id).Except(snap.Countries.Select(c => c.Id)).ToList();
                _logger.LogInformation("Dataset changed ({Old} -> {New}): countries added: {Added}; removed: {Removed}",
                    Short(_snapshot.Version), Short(snap.Version),
                    added.Count > 0 ? string.Join(", ", added) : "none", removed.Count > 0 ? string.Join(", ", removed) : "none");
            }
            _snapshot = snap;
            Interlocked.Exchange(ref _checkedTicks, DateTime.UtcNow.Ticks);
            return snap;
        }
        finally
        {
            _loadLock.Release();
        }
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

    // =============================================================================================
    // 1. what files exist, and at which version
    // =============================================================================================
    private sealed record DataFile(string Name, string Version);
    private sealed record Listing(string Version, string Base, IReadOnlyList<DataFile> Files, string Source)
    {
        public bool Has(string name) => Files.Any(f => f.Name.Equals(name, StringComparison.Ordinal));
    }

    /// <summary>Null when the dataset is still at <paramref name="known"/> (Hugging Face: one request for the commit, no listing).</summary>
    private async Task<Listing?> ListAsync(string? known, CancellationToken ct)
    {
        if (!_db.IsRemote) return ListLocal();
        var hf = HfResolve.Match(_db.BaseUrl);
        if (hf.Success)
        {
            try { return await ListHuggingFaceAsync(hf.Groups["host"].Value, hf.Groups["repo"].Value, hf.Groups["rev"].Value, known, ct); }
            catch (Exception e) { _logger.LogWarning("Could not list the Hugging Face dataset ({Msg}); trying the manifest", e.Message); }
        }
        return await ListFromManifestAsync(ct);
    }

    /// <summary>Commit of the dataset + every file in countries/ (Hugging Face API, paginated).</summary>
    private async Task<Listing?> ListHuggingFaceAsync(string host, string repo, string rev, string? known, CancellationToken ct)
    {
        var client = _http.CreateClient("dataset");
        string? sha = null;
        try
        {
            using var doc = JsonDocument.Parse(await client.GetStringAsync($"{host}/api/datasets/{repo}/revision/{Uri.EscapeDataString(rev)}", ct));
            if (doc.RootElement.TryGetProperty("sha", out var s) && s.ValueKind == JsonValueKind.String) sha = s.GetString();
        }
        catch (Exception e)
        {
            _logger.LogWarning("Could not read the dataset commit ({Msg}); using file ids as the version", e.Message);
        }
        if (sha != null && sha == known) return null;
        var at = sha ?? rev;

        var files = new List<DataFile>();
        string? url = $"{host}/api/datasets/{repo}/tree/{Uri.EscapeDataString(at)}/countries";
        for (int page = 0; url != null && page < 100; page++)
        {
            using var res = await client.GetAsync(url, ct);
            res.EnsureSuccessStatusCode();
            using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync(ct));
            foreach (var e in doc.RootElement.EnumerateArray())
            {
                if (e.TryGetProperty("type", out var t) && t.GetString() != "file") continue;
                var path = e.GetProperty("path").GetString() ?? "";
                var oid = e.TryGetProperty("lfs", out var lfs) && lfs.ValueKind == JsonValueKind.Object && lfs.TryGetProperty("oid", out var lo)
                    ? lo.GetString() : e.TryGetProperty("oid", out var o) ? o.GetString() : null;
                files.Add(new DataFile(path.Split('/').Last(), oid ?? path));
            }
            url = NextLink(res);
        }
        var version = sha ?? Hash(files.Select(f => f.Name + ":" + f.Version));
        return new Listing(version, $"{host}/datasets/{repo}/resolve/{Uri.EscapeDataString(at)}", files, "Hugging Face file list");
    }

    private static string? NextLink(HttpResponseMessage res)
    {
        if (!res.Headers.TryGetValues("Link", out var links)) return null;
        foreach (var part in string.Join(",", links).Split(','))
        {
            var m = Regex.Match(part, "<([^>]+)>\\s*;\\s*rel=\"?next\"?");
            if (m.Success) return m.Groups[1].Value;
        }
        return null;
    }

    private Listing ListLocal()
    {
        var dir = Path.Combine(_db.BaseUrl, "countries");
        var files = Directory.Exists(dir)
            ? Directory.GetFiles(dir).Select(f => new FileInfo(f))
                .Select(f => new DataFile(f.Name, $"{f.Length}:{f.LastWriteTimeUtc.Ticks}")).ToList()
            : [];
        var trend = new FileInfo(Path.Combine(_db.BaseUrl, _settings.TrendFile));
        var version = Hash(files.Select(f => f.Name + ":" + f.Version).Append(trend.Exists ? $"trend:{trend.Length}:{trend.LastWriteTimeUtc.Ticks}" : "no-trend"));
        return new Listing(version, _db.BaseUrl, files, "folder listing");
    }

    /// <summary>Plain web server (no listing API): countries from the manifest, else the built-in names; each file checked.</summary>
    private async Task<Listing> ListFromManifestAsync(CancellationToken ct)
    {
        string? manifest = null;
        try { manifest = await ReadTextAsync(_db.BaseUrl, "countries/_manifest.json", ct); }
        catch (Exception e) { _logger.LogWarning("Could not read countries/_manifest.json ({Msg})", e.Message); }
        var ids = manifest != null ? ParseManifest(manifest).Keys.ToList() : [];
        var source = ids.Count > 0 ? "manifest" : "built-in list";
        if (ids.Count == 0) ids = KnownCountries.ToList();

        var names = ids.SelectMany(id => new[] { $"{id}.parquet", $"{id}{Science}.parquet" }).ToList();
        var present = await ProbeAsync(names, ct);
        var files = present.Select(n => new DataFile(n, n)).ToList();
        if (manifest != null) files.Add(new DataFile("_manifest.json", "m"));
        return new Listing(Hash((manifest ?? "") + string.Join(",", present.OrderBy(n => n))), _db.BaseUrl, files, source);
    }

    private async Task<List<string>> ProbeAsync(IEnumerable<string> names, CancellationToken ct)
    {
        var found = new ConcurrentBag<string>();
        var client = _http.CreateClient("dataset");
        await Parallel.ForEachAsync(names, new ParallelOptions { MaxDegreeOfParallelism = 8, CancellationToken = ct }, async (name, token) =>
        {
            try
            {
                using var req = new HttpRequestMessage(HttpMethod.Head, $"{_db.BaseUrl}/countries/{name}");
                using var res = await client.SendAsync(req, token);
                if (res.IsSuccessStatusCode) found.Add(name);
            }
            catch (Exception e) { _logger.LogDebug("File check for {Name} failed: {Msg}", name, e.Message); }
        });
        return found.ToList();
    }

    // =============================================================================================
    // 2. build the country list from the files
    // =============================================================================================
    private string FilePath(Listing l, string relative) =>
        _db.IsRemote ? $"{l.Base}/{relative}" : Path.Combine(l.Base, relative.Replace('/', Path.DirectorySeparatorChar));

    private async Task<CatalogSnapshot> LoadAsync(Listing listing, CancellationToken ct)
    {
        var skipped = new List<string>();
        var byName = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var f in listing.Files) byName[f.Name] = f.Version;
        var ids = listing.Files
            .Select(f => f.Name)
            .Where(n => n.EndsWith(".parquet", StringComparison.OrdinalIgnoreCase) && !n.StartsWith('_'))
            .Select(n => n[..^".parquet".Length])
            .Where(id => !id.EndsWith(Science, StringComparison.OrdinalIgnoreCase))
            .Where(id =>
            {
                if (SafeId.IsMatch(id)) return true;
                skipped.Add($"{id} (unsafe file name)");
                return false;
            })
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        // optional details
        Dictionary<string, ManifestEntry> manifest = new(StringComparer.OrdinalIgnoreCase);
        if (listing.Has("_manifest.json"))
        {
            try { manifest = ParseManifest(await ReadTextAsync(listing.Base, "countries/_manifest.json", ct)); }
            catch (Exception e) { _logger.LogWarning("Manifest unreadable ({Msg}); dates come from the files", e.Message); }
        }

        var countries = ids.Select(id =>
        {
            manifest.TryGetValue(id, out var m);
            var sci = byName.ContainsKey($"{id}{Science}.parquet") ? FilePath(listing, $"countries/{id}{Science}.parquet") : null;
            return new CountryInfo(id, DisplayName(id), Iso3.GetValueOrDefault(id), FilePath(listing, $"countries/{id}.parquet"), sci,
                m?.First, m?.Last, m?.Rows, byName.GetValueOrDefault($"{id}.parquet") ?? listing.Version);
        }).ToList();

        // what is really inside each file (footers only): columns, lat/lng box, dates, rows.
        // A file that cannot be read (half-uploaded, wrong format) is left out instead of breaking every query.
        var stats = await ReadFileStatsAsync(countries, ct);
        var usable = new List<CountryInfo>();
        foreach (var c in countries)
        {
            if (!stats.TryGetValue(c.Path, out var s)) { skipped.Add($"{c.Id} (file not readable)"); continue; }
            var missing = Required.Where(col => !s.Columns.Contains(col)).ToList();
            if (missing.Count > 0) { skipped.Add($"{c.Id} (missing columns: {string.Join(", ", missing)})"); continue; }
            var science = c.SciencePath == null ? null : await ReadScienceSchemaAsync(c, ct);
            usable.Add(c with
            {
                Bounds = s.Bounds,
                FirstDate = c.FirstDate ?? s.MinDate,
                LastDate = c.LastDate ?? s.MaxDate,
                Rows = c.Rows ?? s.Rows,
                HasFireType = s.Columns.Contains("fire_type"),
                Science = science,
                ScienceVersion = byName.GetValueOrDefault($"{c.Id}{Science}.parquet"),
            });
        }
        foreach (var s in skipped) _logger.LogWarning("Country file left out: {Why}", s);
        usable = usable.OrderBy(c => c.Name, StringComparer.OrdinalIgnoreCase).ToList();

        var trends = await ReadTrendsAsync(FilePath(listing, _settings.TrendFile), ct);

        var minDate = usable.Where(c => c.FirstDate.HasValue).Select(c => c.FirstDate!.Value).DefaultIfEmpty().Min();
        var lastDate = usable.Where(c => c.LastDate.HasValue).Select(c => c.LastDate!.Value).DefaultIfEmpty().Max();
        // fires are dated by LOCAL solar date, so the last UTC night of a year can land on 1 January
        // of the next one: that is not a year of data. Use the requested years when the manifest has them.
        int lastFull = manifest.Values.Select(e => e.LastRequestedYear ?? 0).DefaultIfEmpty(0).Max();
        if (lastFull == 0 && lastDate != default)
            lastFull = lastDate.Month == 1 && lastDate.Day <= 7 ? lastDate.Year - 1 : lastDate.Year;
        var maxDate = lastDate == default ? (DateOnly?)null
            : lastDate.Year > lastFull && lastFull > 0 ? new DateOnly(lastFull, 12, 31) : lastDate;
        int firstFull = minDate == default ? 0 : minDate.Month == 1 && minDate.Day <= 7 ? minDate.Year : minDate.Year + 1;

        var snap = new CatalogSnapshot
        {
            Countries = usable,
            ById = usable.ToDictionary(c => c.Id, StringComparer.OrdinalIgnoreCase),
            Trends = trends,
            MinDate = minDate == default ? null : minDate,
            MaxDate = maxDate,
            FirstFullYear = firstFull,
            LastFullYear = lastFull,
            TotalRows = usable.Sum(c => c.Rows ?? 0),
            Version = listing.Version,
            Source = listing.Source,
            LoadedUtc = DateTime.UtcNow,
            Skipped = skipped,
        };
        _logger.LogInformation("Countries from {Source} (version {V}): {N} countries, {S} with human scores, {T} trend rows, data {Min}..{Max}",
            listing.Source, Short(listing.Version), usable.Count, usable.Count(snap.HasScores), trends.Count, snap.MinDate, snap.MaxDate);
        return snap;
    }

    private sealed record ManifestEntry(DateOnly? First, DateOnly? Last, long? Rows, int? LastRequestedYear);

    private static Dictionary<string, ManifestEntry> ParseManifest(string json)
    {
        var list = new Dictionary<string, ManifestEntry>(StringComparer.OrdinalIgnoreCase);
        using var doc = JsonDocument.Parse(json);
        if (!doc.RootElement.TryGetProperty("countries", out var cs) || cs.ValueKind != JsonValueKind.Object) return list;
        foreach (var p in cs.EnumerateObject())
        {
            var v = p.Value;
            var id = p.Name;
            if (v.ValueKind == JsonValueKind.Object && v.TryGetProperty("file", out var f) && f.ValueKind == JsonValueKind.String)
                id = Path.GetFileNameWithoutExtension(f.GetString()!.Replace('\\', '/').Split('/').Last());
            if (SafeId.IsMatch(id)) list[id] = new ManifestEntry(Date(v, "first_date"), Date(v, "last_date"), Long(v, "rows"), LastYear(v));
        }
        return list;
    }

    private async Task<string> ReadTextAsync(string baseUrl, string relative, CancellationToken ct)
    {
        if (!_db.IsRemote) return await File.ReadAllTextAsync(Path.Combine(baseUrl, relative.Replace('/', Path.DirectorySeparatorChar)), ct);
        return await _http.CreateClient("dataset").GetStringAsync($"{baseUrl}/{relative}", ct);
    }

    private sealed record FileStats(HashSet<string> Columns, GeoBounds? Bounds, DateOnly? MinDate, DateOnly? MaxDate, long? Rows);

    /// <summary>One footer read for all files; if that fails (one bad file), file by file so only the bad one is left out.</summary>
    private async Task<Dictionary<string, FileStats>> ReadFileStatsAsync(List<CountryInfo> countries, CancellationToken ct)
    {
        if (countries.Count == 0) return [];
        try { return await ReadFileStatsAsync(countries.Select(c => c.Path).ToList(), ct); }
        catch (Exception e)
        {
            _logger.LogWarning("Reading all file footers at once failed ({Msg}); checking each file", e.Message);
        }
        var result = new Dictionary<string, FileStats>();
        foreach (var c in countries)
        {
            try { foreach (var kv in await ReadFileStatsAsync([c.Path], ct)) result[kv.Key] = kv.Value; }
            catch (Exception e) { _logger.LogWarning("File of {Id} not readable: {Msg}", c.Id, e.Message); }
        }
        return result;
    }

    private async Task<Dictionary<string, FileStats>> ReadFileStatsAsync(List<string> paths, CancellationToken ct)
    {
        var files = FileList(paths);
        var cols = new Dictionary<string, HashSet<string>>();
        await using (var lease = await _db.AcquireAsync(ct))
        {
            using var cmd = lease.Connection.CreateCommand();
            cmd.CommandText = $"SELECT file_name, name FROM parquet_schema({files}) WHERE name IS NOT NULL";
            using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct))
            {
                var f = r.GetString(0);
                if (!cols.TryGetValue(f, out var set)) cols[f] = set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                set.Add(r.GetString(1));
            }
        }

        var acc = new Dictionary<string, (double? la0, double? la1, double? lo0, double? lo1, DateOnly? d0, DateOnly? d1, long? rows)>();
        await using (var lease = await _db.AcquireAsync(ct))
        {
            using var cmd = lease.Connection.CreateCommand();
            cmd.CommandText = $@"
                SELECT file_name, path_in_schema,
                       MIN(TRY_CAST(stats_min_value AS DOUBLE)) AS lo, MAX(TRY_CAST(stats_max_value AS DOUBLE)) AS hi,
                       MIN(TRY_CAST(stats_min_value AS DATE)) AS dlo, MAX(TRY_CAST(stats_max_value AS DATE)) AS dhi,
                       SUM(row_group_num_rows) AS nrows
                FROM parquet_metadata({files})
                WHERE path_in_schema IN ('latitude', 'longitude', 'date')
                GROUP BY ALL";
            using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct))
            {
                var file = r.GetString(0);
                acc.TryGetValue(file, out var a);
                double? lo = AsDouble(r, 2), hi = AsDouble(r, 3);
                switch (r.GetString(1))
                {
                    case "latitude": a.la0 = lo; a.la1 = hi; break;
                    case "longitude": a.lo0 = lo; a.lo1 = hi; break;
                    default: a.d0 = AsDate(r, 4); a.d1 = AsDate(r, 5); a.rows = AsLong(r, 6); break;
                }
                acc[file] = a;
            }
        }

        var result = new Dictionary<string, FileStats>();
        foreach (var (file, set) in cols)
        {
            acc.TryGetValue(file, out var a);
            var b = a is { la0: not null, la1: not null, lo0: not null, lo1: not null }
                ? new GeoBounds(a.la0.Value, a.la1.Value, a.lo0.Value, a.lo1.Value) : null;
            result[file] = new FileStats(set, b, a.d0, a.d1, a.rows);
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
            _logger.LogWarning("Could not read the score file of {Id} ({Msg}); its scores are not used until the next change", c.Id, e.Message);
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
    /// The trend file is small: read it whole at each dataset version. Columns are discovered (year
    /// columns, optional slope / direction / significance / p-value), so a renamed or missing column
    /// cannot crash a request.
    /// </summary>
    private async Task<Dictionary<string, TrendDto>> ReadTrendsAsync(string path, CancellationToken ct)
    {
        var trends = new Dictionary<string, TrendDto>();
        try
        {
            await using var lease = await _db.AcquireAsync(ct);
            using var cmd = lease.Connection.CreateCommand();
            cmd.CommandText = $"SELECT * FROM read_parquet({DuckDbService.Lit(path)})";
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

    // =============================================================================================
    // helpers
    // =============================================================================================
    public static string FileList(IEnumerable<string> paths) => "[" + string.Join(", ", paths.Select(DuckDbService.Lit)) + "]";

    private static string Hash(IEnumerable<string> parts) => Hash(string.Join("\n", parts));
    private static string Hash(string s) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(s)))[..16].ToLowerInvariant();
    private static string Short(string v) => v.Length > 12 ? v[..12] : v;

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

    /// <summary>Only for a plain web server without a listing API and without a manifest.</summary>
    private static readonly string[] KnownCountries =
    {
        "Angola", "China", "Croatia", "Cuba", "Egypt", "France", "Germany", "Greece", "Hungary", "India", "Indonesia",
        "Iran", "Iraq", "Italy", "Japan", "Kenya", "Kuwait", "Libya", "Madagascar", "Malawi", "Malaysia", "Maldives",
        "Mali", "Mexico", "Mozambique", "Oman", "South_Africa", "South_Sudan", "Spain", "Sudan", "Thailand", "Togo",
        "United_Arab_Emirates", "United_Kingdom", "United_States", "Yemen", "Zambia",
    };

    // the frontend matches these to its world map (Natural Earth names / codes); any other id is shown with spaces
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
