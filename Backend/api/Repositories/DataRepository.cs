using api.DTOs;
using api.Services;
using DuckDB.NET.Data;
using Microsoft.Extensions.Caching.Memory;

namespace api.Repositories;

public class DuckDbRepository : IDataRepository
{
    private readonly IDuckDbService _db;
    private readonly IMemoryCache _cache;

    public DuckDbRepository(IDuckDbService db, IMemoryCache cache)
    {
        _db = db;
        _cache = cache;
    }

    private string GetEngineerPath() => $"{_db.GetEngineerUrl()}/harmonized_data.parquet";
    private string GetScientistPath() => $"{_db.GetEngineerUrl()}/fire_level_assessment.parquet";

    public async Task<IEnumerable<CellDto>> GetCellsAsync(int year, string? regionId)
    {
        string cacheKey = $"cells_{year}_{regionId}";
        if (_cache.TryGetValue(cacheKey, out IEnumerable<CellDto>? cachedCells)) return cachedCells!;

        using var connection = _db.CreateConnection();
        using var cmd = connection.CreateCommand();

        string countryFilter = string.IsNullOrEmpty(regionId) ? "" : "AND e.country = ?";

        cmd.CommandText = $@"
            SELECT 
                ROUND(e.latitude * 2) / 2 AS Lat,
                ROUND(e.longitude * 2) / 2 AS Lng,
                e.country AS RegionId,
                SUM(e.modis_detections) AS Legacy,
                SUM(e.n_detections) AS Harmonized,
                COALESCE(AVG(s.human_association_score), 0.0) AS Human
            FROM read_parquet('{GetEngineerPath()}') e
            LEFT JOIN read_parquet('{GetScientistPath()}') s ON e.fire_id = s.fire_id
            WHERE EXTRACT(YEAR FROM e.date) = ? {countryFilter}
            GROUP BY ROUND(e.latitude * 2) / 2, ROUND(e.longitude * 2) / 2, e.country
            ORDER BY Harmonized DESC
            LIMIT 3000
        ";

        cmd.Parameters.Add(new DuckDBParameter { Value = year });
        if (!string.IsNullOrEmpty(regionId)) cmd.Parameters.Add(new DuckDBParameter { Value = regionId });

        var results = new List<CellDto>();
        using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            results.Add(new CellDto(
                Lat: Convert.ToDouble(reader["Lat"]),
                Lng: Convert.ToDouble(reader["Lng"]),
                RegionId: reader["RegionId"].ToString() ?? "",
                Legacy: Convert.ToInt32(reader["Legacy"]),
                Harmonized: Convert.ToInt32(reader["Harmonized"]),
                Human: Math.Round(Convert.ToDouble(reader["Human"]), 2)
            ));
        }

        _cache.Set(cacheKey, results, TimeSpan.FromMinutes(30));
        return results;
    }

    public async Task<RegionSummaryDto> GetRegionSummaryAsync(string id, int? year)
    {
        int filterYear = year ?? 2023;
        string cacheKey = $"summary_{id}_{filterYear}";
        if (_cache.TryGetValue(cacheKey, out RegionSummaryDto? cachedSummary)) return cachedSummary!;

        using var connection = _db.CreateConnection();
        using var cmd = connection.CreateCommand();

        cmd.CommandText = $@"
            SELECT 
                SUM(e.modis_detections) AS FiresLegacy,
                SUM(e.n_detections) AS FiresHarmonized,
                COALESCE(AVG(CASE WHEN e.modis_detections > 0 THEN s.human_association_score END), 0.0) AS HumanScoreLegacy,
                COALESCE(AVG(s.human_association_score), 0.0) AS HumanScoreHarmonized,
                COUNT(CASE WHEN EXTRACT(dow FROM e.date) = 0 THEN 1 END) AS Sun,
                COUNT(CASE WHEN EXTRACT(dow FROM e.date) = 1 THEN 1 END) AS Mon,
                COUNT(CASE WHEN EXTRACT(dow FROM e.date) = 2 THEN 1 END) AS Tue,
                COUNT(CASE WHEN EXTRACT(dow FROM e.date) = 3 THEN 1 END) AS Wed,
                COUNT(CASE WHEN EXTRACT(dow FROM e.date) = 4 THEN 1 END) AS Thu,
                COUNT(CASE WHEN EXTRACT(dow FROM e.date) = 5 THEN 1 END) AS Fri,
                COUNT(CASE WHEN EXTRACT(dow FROM e.date) = 6 THEN 1 END) AS Sat
            FROM read_parquet('{GetEngineerPath()}') e
            LEFT JOIN read_parquet('{GetScientistPath()}') s ON e.fire_id = s.fire_id
            WHERE e.country = ? AND EXTRACT(YEAR FROM e.date) = ?
        ";

        cmd.Parameters.Add(new DuckDBParameter { Value = id });
        cmd.Parameters.Add(new DuckDBParameter { Value = filterYear });

        using var reader = await cmd.ExecuteReaderAsync();
        if (await reader.ReadAsync())
        {
            int legacy = reader["FiresLegacy"] != DBNull.Value ? Convert.ToInt32(reader["FiresLegacy"]) : 0;
            int harmonized = reader["FiresHarmonized"] != DBNull.Value ? Convert.ToInt32(reader["FiresHarmonized"]) : 0;
            double undercount = legacy == 0 ? 0 : (double)(harmonized - legacy) / legacy * 100;

            var result = new RegionSummaryDto(
                UndercountPct: Math.Round(undercount, 1),
                FiresLegacy: legacy,
                FiresHarmonized: harmonized,
                WeekdayCounts: new double[] {
                    Convert.ToDouble(reader["Sun"]), Convert.ToDouble(reader["Mon"]), Convert.ToDouble(reader["Tue"]),
                    Convert.ToDouble(reader["Wed"]), Convert.ToDouble(reader["Thu"]), Convert.ToDouble(reader["Fri"]),
                    Convert.ToDouble(reader["Sat"])
                },
                HumanScoreLegacy: Math.Round(Convert.ToDouble(reader["HumanScoreLegacy"]), 2),
                HumanScoreHarmonized: Math.Round(Convert.ToDouble(reader["HumanScoreHarmonized"]), 2)
            );

            _cache.Set(cacheKey, result, TimeSpan.FromMinutes(30));
            return result;
        }
        return new RegionSummaryDto(0, 0, 0, new double[7], 0, 0);
    }

    public async Task<ProgressDto> GetProgressAsync(string? region, double? lat, double? lng, double? radiusKm)
    {
        string cacheKey = $"progress_{region}_{lat}_{lng}_{radiusKm}";
        if (_cache.TryGetValue(cacheKey, out ProgressDto? cachedProgress)) return cachedProgress!;

        using var connection = _db.CreateConnection();
        using var cmd = connection.CreateCommand();

        string spatialFilter = "";
        var parameters = new List<DuckDBParameter>();

        if (!string.IsNullOrEmpty(region))
        {
            spatialFilter = "AND e.country = ?";
            parameters.Add(new DuckDBParameter { Value = region });
        }
        else if (lat.HasValue && lng.HasValue)
        {
            double radius = radiusKm ?? 150;
            spatialFilter = $@"AND (
                6371 * 2 * ASIN(SQRT(
                    POWER(SIN((RADIANS(e.latitude) - RADIANS(?)) / 2), 2) +
                    COS(RADIANS(?)) * COS(RADIANS(e.latitude)) *
                    POWER(SIN((RADIANS(e.longitude) - RADIANS(?)) / 2), 2)
                )) <= ?
            )";
            parameters.Add(new DuckDBParameter { Value = lat.Value });
            parameters.Add(new DuckDBParameter { Value = lat.Value });
            parameters.Add(new DuckDBParameter { Value = lng.Value });
            parameters.Add(new DuckDBParameter { Value = radius });
        }
        else
        {
            return new ProgressDto(new List<ProgressSeriesDto>(), 0, 0, 0, "stable", new HumanLikelihoodDto(0, 0), false);
        }

        cmd.CommandText = $@"
            SELECT 
                EXTRACT(YEAR FROM e.date) AS Year,
                SUM(e.modis_detections) AS Legacy,
                SUM(e.n_detections) AS Harmonized
            FROM read_parquet('{GetEngineerPath()}') e
            WHERE 1=1 {spatialFilter}
            GROUP BY EXTRACT(YEAR FROM e.date)
            ORDER BY Year ASC
        ";
        foreach (var p in parameters) cmd.Parameters.Add(p);

        var series = new List<ProgressSeriesDto>();
        using (var reader = await cmd.ExecuteReaderAsync())
        {
            while (await reader.ReadAsync())
            {
                series.Add(new ProgressSeriesDto(
                    Year: Convert.ToInt32(reader["Year"]),
                    Legacy: Convert.ToInt32(reader["Legacy"]),
                    Harmonized: Convert.ToInt32(reader["Harmonized"])
                ));
            }
        }

        if (series.Count == 0) return new ProgressDto(new List<ProgressSeriesDto>(), 0, 0, 0, "stable", new HumanLikelihoodDto(0, 0), false);

        cmd.CommandText = $@"
            SELECT 
                COALESCE(AVG(CASE WHEN e.modis_detections > 0 THEN s.human_association_score END), 0.0) AS HumanLegacy,
                COALESCE(AVG(s.human_association_score), 0.0) AS HumanHarmonized
            FROM read_parquet('{GetEngineerPath()}') e
            LEFT JOIN read_parquet('{GetScientistPath()}') s ON e.fire_id = s.fire_id
            WHERE 1=1 {spatialFilter}
        ";
        cmd.Parameters.Clear();
        foreach (var p in parameters) cmd.Parameters.Add(p);

        double humanLegacy = 0.0;
        double humanHarmonized = 0.0;
        using (var reader = await cmd.ExecuteReaderAsync())
        {
            if (await reader.ReadAsync())
            {
                humanLegacy = Math.Round(Convert.ToDouble(reader["HumanLegacy"]), 2);
                humanHarmonized = Math.Round(Convert.ToDouble(reader["HumanHarmonized"]), 2);
            }
        }

        var baselineYears = series.Take(3).ToList();
        var recentYears = series.TakeLast(3).ToList();

        double baselineAvg = baselineYears.Average(x => x.Harmonized);
        double recentAvg = recentYears.Average(x => x.Harmonized);
        double changePct = baselineAvg == 0 ? 0 : ((recentAvg - baselineAvg) / baselineAvg) * 100;

        string direction = "stable";
        if (changePct > 10) direction = "worse";
        else if (changePct < -10) direction = "better";

        var result = new ProgressDto(
            Series: series,
            Baseline: Math.Round(baselineAvg, 1),
            Recent: Math.Round(recentAvg, 1),
            ChangePct: Math.Round(changePct, 1),
            Direction: direction,
            HumanLikelihood: new HumanLikelihoodDto(humanLegacy, humanHarmonized),
            Covered: true
        );

        _cache.Set(cacheKey, result, TimeSpan.FromMinutes(30));
        return result;
    }

    public async Task<DailyDto> GetDayAsync(string date, string? region, double? lat, double? lng, double? radiusKm)
    {
        using var connection = _db.CreateConnection();
        using var cmd = connection.CreateCommand();

        string spatialFilter = "";
        cmd.Parameters.Add(new DuckDBParameter { Value = date });

        if (!string.IsNullOrEmpty(region))
        {
            spatialFilter = "AND country = ?";
            cmd.Parameters.Add(new DuckDBParameter { Value = region });
        }
        else if (lat.HasValue && lng.HasValue)
        {
            double radius = radiusKm ?? 150;
            spatialFilter = $@"AND (
                6371 * 2 * ASIN(SQRT(
                    POWER(SIN((RADIANS(latitude) - RADIANS(?)) / 2), 2) +
                    COS(RADIANS(?)) * COS(RADIANS(latitude)) *
                    POWER(SIN((RADIANS(longitude) - RADIANS(?)) / 2), 2)
                )) <= ?
            )";
            cmd.Parameters.Add(new DuckDBParameter { Value = lat.Value });
            cmd.Parameters.Add(new DuckDBParameter { Value = lat.Value });
            cmd.Parameters.Add(new DuckDBParameter { Value = lng.Value });
            cmd.Parameters.Add(new DuckDBParameter { Value = radius });
        }
        else
        {
            return new DailyDto(date, 0, 0);
        }

        cmd.CommandText = $@"
            SELECT 
                CAST(date AS VARCHAR) AS Date,
                SUM(modis_detections) AS Legacy,
                SUM(n_detections) AS Harmonized
            FROM read_parquet('{GetEngineerPath()}')
            WHERE CAST(date AS VARCHAR) = ? {spatialFilter}
            GROUP BY date
        ";

        using var reader = await cmd.ExecuteReaderAsync();
        if (await reader.ReadAsync())
        {
            return new DailyDto(
                Date: reader["Date"].ToString() ?? "",
                Legacy: Convert.ToInt32(reader["Legacy"]),
                Harmonized: Convert.ToInt32(reader["Harmonized"])
            );
        }
        return new DailyDto(date, 0, 0);
    }

    public async Task<IEnumerable<DailyDto>> GetDailyAsync(int year, string? region, double? lat, double? lng, double? radiusKm)
    {
        string cacheKey = $"daily_{year}_{region}_{lat}_{lng}_{radiusKm}";
        if (_cache.TryGetValue(cacheKey, out IEnumerable<DailyDto>? cachedDaily)) return cachedDaily!;

        using var connection = _db.CreateConnection();
        using var cmd = connection.CreateCommand();

        string spatialFilter = "";
        cmd.Parameters.Add(new DuckDBParameter { Value = year });

        if (!string.IsNullOrEmpty(region))
        {
            spatialFilter = "AND country = ?";
            cmd.Parameters.Add(new DuckDBParameter { Value = region });
        }
        else if (lat.HasValue && lng.HasValue)
        {
            double radius = radiusKm ?? 150;
            spatialFilter = $@"AND (
                6371 * 2 * ASIN(SQRT(
                    POWER(SIN((RADIANS(latitude) - RADIANS(?)) / 2), 2) +
                    COS(RADIANS(?)) * COS(RADIANS(latitude)) *
                    POWER(SIN((RADIANS(longitude) - RADIANS(?)) / 2), 2)
                )) <= ?
            )";
            cmd.Parameters.Add(new DuckDBParameter { Value = lat.Value });
            cmd.Parameters.Add(new DuckDBParameter { Value = lat.Value });
            cmd.Parameters.Add(new DuckDBParameter { Value = lng.Value });
            cmd.Parameters.Add(new DuckDBParameter { Value = radius });
        }
        else
        {
            return new List<DailyDto>();
        }

        cmd.CommandText = $@"
            SELECT 
                CAST(date AS VARCHAR) AS Date,
                SUM(modis_detections) AS Legacy,
                SUM(n_detections) AS Harmonized
            FROM read_parquet('{GetEngineerPath()}')
            WHERE EXTRACT(YEAR FROM date) = ? {spatialFilter}
            GROUP BY date
            ORDER BY date ASC
        ";

        var results = new List<DailyDto>();
        using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            results.Add(new DailyDto(
                Date: reader["Date"].ToString() ?? "",
                Legacy: Convert.ToInt32(reader["Legacy"]),
                Harmonized: Convert.ToInt32(reader["Harmonized"])
            ));
        }

        _cache.Set(cacheKey, results, TimeSpan.FromMinutes(30));
        return results;
    }

    public async Task<RegionSummaryDto> GetGlobalSummaryAsync(int? year)
    {
        int filterYear = year ?? 2023;
        string cacheKey = $"global_summary_{filterYear}";
        if (_cache.TryGetValue(cacheKey, out RegionSummaryDto? cachedSummary)) return cachedSummary!;

        using var connection = _db.CreateConnection();
        using var cmd = connection.CreateCommand();

        cmd.CommandText = $@"
            SELECT 
                SUM(e.modis_detections) AS FiresLegacy,
                SUM(e.n_detections) AS FiresHarmonized,
                COALESCE(AVG(CASE WHEN e.modis_detections > 0 THEN s.human_association_score END), 0.0) AS HumanScoreLegacy,
                COALESCE(AVG(s.human_association_score), 0.0) AS HumanScoreHarmonized
            FROM read_parquet('{GetEngineerPath()}') e
            LEFT JOIN read_parquet('{GetScientistPath()}') s ON e.fire_id = s.fire_id
            WHERE EXTRACT(YEAR FROM e.date) = ?
        ";
        cmd.Parameters.Add(new DuckDBParameter { Value = filterYear });

        using var reader = await cmd.ExecuteReaderAsync();
        if (await reader.ReadAsync())
        {
            int legacy = reader["FiresLegacy"] != DBNull.Value ? Convert.ToInt32(reader["FiresLegacy"]) : 0;
            int harmonized = reader["FiresHarmonized"] != DBNull.Value ? Convert.ToInt32(reader["FiresHarmonized"]) : 0;
            double undercount = legacy == 0 ? 0 : (double)(harmonized - legacy) / legacy * 100;

            var result = new RegionSummaryDto(
                UndercountPct: Math.Round(undercount, 1),
                FiresLegacy: legacy,
                FiresHarmonized: harmonized,
                WeekdayCounts: new double[7],
                HumanScoreLegacy: Math.Round(Convert.ToDouble(reader["HumanScoreLegacy"]), 2),
                HumanScoreHarmonized: Math.Round(Convert.ToDouble(reader["HumanScoreHarmonized"]), 2)
            );

            _cache.Set(cacheKey, result, TimeSpan.FromMinutes(30));
            return result;
        }
        return new RegionSummaryDto(0, 0, 0, new double[7], 0, 0);
    }

    public Task<IEnumerable<CountryDto>> GetCountriesAsync()
    {
        var countries = new List<CountryDto>
        {
            new("Angola", "Angola"),
            new("China", "China"),
            new("Egypt", "Egypt"),
            new("Greece", "Greece"),
            new("United Kingdom", "United Kingdom"),
            new("United States", "United States of America"),
            new("Yemen", "Yemen")
        };
        return Task.FromResult<IEnumerable<CountryDto>>(countries);
    }

    public async Task<MetaDto> GetMetaAsync()
    {
        string cacheKey = "meta";
        if (_cache.TryGetValue(cacheKey, out MetaDto? cachedMeta)) return cachedMeta!;

        using var connection = _db.CreateConnection();
        using var cmd = connection.CreateCommand();

        cmd.CommandText = $@"
            SELECT 
                CAST(MIN(date) AS VARCHAR) AS MinDate,
                CAST(MAX(date) AS VARCHAR) AS MaxDate,
                COUNT(*) AS TotalDetections
            FROM read_parquet('{GetEngineerPath()}')
        ";

        using var reader = await cmd.ExecuteReaderAsync();
        if (await reader.ReadAsync())
        {
            var result = new MetaDto(
                MinDate: reader["MinDate"].ToString() ?? "",
                MaxDate: reader["MaxDate"].ToString() ?? "",
                TotalDetections: Convert.ToInt64(reader["TotalDetections"])
            );
            _cache.Set(cacheKey, result, TimeSpan.FromHours(1));
            return result;
        }
        return new MetaDto("", "", 0L);
    }
}