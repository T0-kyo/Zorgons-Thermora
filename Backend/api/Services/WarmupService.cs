using api.Config;
using api.Repositories;
using Microsoft.Extensions.Options;

namespace api.Services;

/// <summary>
/// After start-up: opens DuckDB and loads the country list (so the first visitor does not pay for
/// it), then, only while no request is running, fills the all-years stats of /api/countries one
/// country at a time. It never competes with visitors for a query slot.
/// </summary>
public sealed class WarmupService : BackgroundService
{
    private readonly IServiceScopeFactory _scopes;
    private readonly ICountryCatalog _catalog;
    private readonly IDuckDbService _db;
    private readonly CountryStatsStore _stats;
    private readonly DataSettings _settings;
    private readonly ILogger<WarmupService> _logger;

    public WarmupService(IServiceScopeFactory scopes, ICountryCatalog catalog, IDuckDbService db, CountryStatsStore stats,
        IOptions<DataSettings> options, ILogger<WarmupService> logger)
    {
        _scopes = scopes;
        _catalog = catalog;
        _db = db;
        _stats = stats;
        _settings = options.Value;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stop)
    {
        try
        {
            await Task.Delay(TimeSpan.FromSeconds(1), stop);
            await _catalog.GetAsync(stop);
            if (!_settings.PrecomputeCountryStats) return;

            // keeps running: a country uploaded (or replaced) later gets its stats too
            var failed = new Dictionary<string, int>();
            while (!stop.IsCancellationRequested)
            {
                var snap = await _catalog.GetAsync(stop);   // also triggers the periodic dataset check
                var todo = snap.Countries.Where(c => !_stats.Has(c.StatsKey) && failed.GetValueOrDefault(c.StatsKey) < 3).ToList();
                foreach (var country in todo)
                {
                    while (!_db.IsIdle) await Task.Delay(TimeSpan.FromSeconds(2), stop);
                    try
                    {
                        using var scope = _scopes.CreateScope();
                        var repo = scope.ServiceProvider.GetRequiredService<IDataRepository>();
                        _stats.Set(country.StatsKey, await repo.ComputeCountryStatsAsync(country.Id));
                    }
                    catch (Exception e) when (!stop.IsCancellationRequested)
                    {
                        failed[country.StatsKey] = failed.GetValueOrDefault(country.StatsKey) + 1;
                        _logger.LogWarning("Background stats for {Country} failed: {Msg}", country.Id, e.Message);
                    }
                }
                if (todo.Count > 0) _logger.LogInformation("Background stats ready for {N} countries", snap.Countries.Count(c => _stats.Has(c.StatsKey)));
                await Task.Delay(TimeSpan.FromSeconds(30), stop);
            }
        }
        catch (OperationCanceledException) { }
        catch (Exception e)
        {
            _logger.LogWarning(e, "Warm-up stopped early");
        }
    }
}
