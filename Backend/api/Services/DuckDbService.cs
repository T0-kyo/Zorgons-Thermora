using api.Config;
using DuckDB.NET.Data;
using Microsoft.Extensions.Options;

namespace api.Services;

/// <summary>
/// ONE DuckDB database for the whole app (not one per request): memory_limit is a real cap,
/// remote file metadata is cached between requests, and at most MaxConcurrentQueries queries
/// run at once. Before, every request opened its own database with its own 400 MB limit, so a
/// burst of parallel requests could take several GB and crash the server (the 502s).
/// </summary>
public sealed class DuckDbService : IDuckDbService, IDisposable
{
    private const string Shared = DuckDBConnectionStringBuilder.InMemorySharedConnectionString;

    private readonly DataSettings _settings;
    private readonly ILogger<DuckDbService> _logger;
    private readonly SemaphoreSlim _gate;
    private readonly SemaphoreSlim _initLock = new(1, 1);
    private DuckDBConnection? _anchor; // keeps the shared in-memory database alive
    private volatile bool _ready;
    private int _waiting;

    public string BaseUrl { get; }
    public bool IsRemote { get; }

    public DuckDbService(IOptions<DataSettings> options, ILogger<DuckDbService> logger)
    {
        _settings = options.Value;
        _logger = logger;
        if (string.IsNullOrWhiteSpace(_settings.BaseUrl))
            throw new InvalidOperationException("DataSettings:BaseUrl is not configured.");
        BaseUrl = _settings.BaseUrl.TrimEnd('/', '\\');
        IsRemote = BaseUrl.StartsWith("http://", StringComparison.OrdinalIgnoreCase)
                || BaseUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase);
        _gate = new SemaphoreSlim(Math.Max(1, _settings.MaxConcurrentQueries));
    }

    public bool IsIdle => Volatile.Read(ref _waiting) == 0 && _gate.CurrentCount == Math.Max(1, _settings.MaxConcurrentQueries);

    public string PathOf(string relative)
    {
        relative = relative.TrimStart('/', '\\');
        return IsRemote ? $"{BaseUrl}/{relative}" : Path.Combine(BaseUrl, relative.Replace('/', Path.DirectorySeparatorChar));
    }

    public async Task<DuckDbLease> AcquireAsync(CancellationToken ct = default)
    {
        await EnsureReadyAsync(ct);
        Interlocked.Increment(ref _waiting);
        try { await _gate.WaitAsync(ct); }
        finally { Interlocked.Decrement(ref _waiting); }
        try
        {
            var connection = new DuckDBConnection(Shared);
            await connection.OpenAsync(ct);
            return new DuckDbLease(connection, _gate);
        }
        catch
        {
            _gate.Release();
            throw;
        }
    }

    private async Task EnsureReadyAsync(CancellationToken ct)
    {
        if (_ready) return;
        await _initLock.WaitAsync(ct);
        try
        {
            if (_ready) return;
            var anchor = new DuckDBConnection(Shared);
            await anchor.OpenAsync(ct);
            Directory.CreateDirectory(_settings.TempDirectory);

            Exec(anchor, $"SET memory_limit = {Lit(_settings.MemoryLimit)}");
            Exec(anchor, $"SET threads = {Math.Max(1, _settings.Threads)}");
            Exec(anchor, $"SET temp_directory = {Lit(_settings.TempDirectory)}");
            // results are aggregated anyway; not keeping row order lets DuckDB stream with less memory
            Exec(anchor, "SET preserve_insertion_order = false");
            if (!string.IsNullOrWhiteSpace(_settings.ExtensionDirectory))
                Exec(anchor, $"SET extension_directory = {Lit(_settings.ExtensionDirectory)}");

            if (IsRemote)
            {
                // LOAD first: the Docker image ships httpfs, so a cold start does not download it
                try { Exec(anchor, "LOAD httpfs"); }
                catch
                {
                    _logger.LogInformation("httpfs not bundled, installing it");
                    Exec(anchor, "INSTALL httpfs");
                    Exec(anchor, "LOAD httpfs");
                }
                Exec(anchor, "SET http_timeout = 120");
                Exec(anchor, "SET http_retries = 5");
                Exec(anchor, "SET http_keep_alive = true");
                TryExec(anchor, "SET enable_http_metadata_cache = true");   // file footers reused across queries
                TryExec(anchor, "SET enable_external_file_cache = true");   // data blocks reused across queries
                if (!string.IsNullOrWhiteSpace(_settings.HfToken))
                    Exec(anchor, "CREATE OR REPLACE SECRET hf_http (TYPE http, EXTRA_HTTP_HEADERS MAP {'Authorization': "
                                 + Lit("Bearer " + _settings.HfToken) + "})");
            }

            _anchor = anchor;
            _ready = true;
            _logger.LogInformation("DuckDB ready (memory_limit {Mem}, threads {Threads}, {Slots} query slots, data at {Base})",
                _settings.MemoryLimit, _settings.Threads, _settings.MaxConcurrentQueries, IsRemote ? BaseUrl : "local folder");
        }
        finally
        {
            _initLock.Release();
        }
    }

    private static void Exec(DuckDBConnection c, string sql)
    {
        using var cmd = c.CreateCommand();
        cmd.CommandText = sql;
        cmd.ExecuteNonQuery();
    }

    private void TryExec(DuckDBConnection c, string sql)
    {
        try { Exec(c, sql); }
        catch (Exception e) { _logger.LogDebug("Skipped '{Sql}': {Msg}", sql, e.Message); }
    }

    /// <summary>SQL string literal with quotes escaped.</summary>
    public static string Lit(string value) => "'" + value.Replace("'", "''") + "'";

    public void Dispose()
    {
        _anchor?.Dispose();
        _gate.Dispose();
        _initLock.Dispose();
    }
}
