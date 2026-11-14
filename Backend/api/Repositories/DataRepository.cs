using api.DTOs;
using api.Services;
using DuckDB.NET.Data;
using Microsoft.Extensions.Caching.Memory;
using System.Data.Common;

namespace api.Repositories;

public class DuckDbRepository : IDataRepository
{
    private readonly IDuckDbService _db;
    private readonly IMemoryCache _cache;

    // Tuple: (File Name on Hugging Face, Display Name for Frontend)
    private static readonly (string FileName, string DisplayName)[] AllCountries = {
        ("Angola", "Angola"), 
        ("China", "China"), 
        ("Egypt", "Egypt"), 
        ("Greece", "Greece"), 
        ("Oman", "Oman"),
        ("United_Kingdom", "United Kingdom"), 
        ("United_States", "United States of America"), 
        ("Yemen", "Yemen")
    };

    public DuckDbRepository(IDuckDbService db, IMemoryCache cache)
    {
        _db = db;
        _cache = cache;
    }

    // Returns a single quoted path for one country, or a comma-separated list of paths for all
    private string GetEngineerPath(string? country)
    {
        if (!string.IsNullOrEmpty(country))
        {
            // Replace spaces with underscores for the file name
            string fileName = country.Replace(" ", "_");
            return $"'{_db.GetBaseUrl()}/countries/{fileName}.parquet'";
        }
        
        // Use c.FileName to extract just the string from the tuple
        return string.Join(", ", AllCountries.Select(c => $"'{_db.GetBaseUrl()}/countries/{c.FileName}.parquet'"));
    }

    private string GetScientistPath(string? country)
    {
        if (!string.IsNullOrEmpty(country))
        {
            // Replace spaces with underscores for the file name
            string fileName = country.Replace(" ", "_");
            return $"'{_db.GetBaseUrl()}/countries/{fileName}_human_likelihood.parquet'";
        }
        
        return string.Join(", ", AllCountries.Select(c => $"'{_db.GetBaseUrl()}/countries/{c.FileName}_human_likelihood.parquet'"));
    }

    private static double? GetNullableDouble(DbDataReader reader, string columnName)
    {
        int ordinal = reader.GetOrdinal(columnName);
        return reader.IsDBNull(ordinal) ? null : reader.GetDouble(ordinal);
    }

    public async Task<IEnumerable<CellDto>> GetCellsAsync(int year, string? regionId)
    {
        string cacheKey = $"cells_{year}_{regionId}";
        if (_cache.TryGetValue(cacheKey, out IEnumerable<CellDto>? cachedCells)) return cachedCells!;

        using var connection = _db.CreateConnection();
        using var cmd = connection.CreateCommand();

        cmd.CommandText = $@"
            SELECT 
                ROUND(e.latitude * 2) / 2 AS Lat,
                ROUND(e.longitude * 2) / 2 AS Lng,
                e.country AS RegionId,
                SUM(e.modis_detections) AS Legacy,
                SUM(e.n_detections) AS Harmonized,
                AVG(s.human_association_score) AS Human,
                AVG(s.ci_lower) AS HumanLow,
                AVG(s.ci_upper) AS HumanHigh,
                MODE(s.confidence_level) AS Confidence,
                COUNT(s.fire_id) AS ScoredFires
            FROM read_parquet({GetEngineerPath(regionId)}) e
            LEFT JOIN read_parquet({GetScientistPath(regionId)}) s ON e.fire_id = s.fire_id
            WHERE EXTRACT(YEAR FROM e.date) = ? AND e.fire_type = 0
            GROUP BY ROUND(e.latitude * 2) / 2, ROUND(e.longitude * 2) / 2, e.country
            ORDER BY Harmonized DESC
            LIMIT 3000
        ";

        cmd.Parameters.Add(new DuckDBParameter { Value = year });

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
                Human: GetNullableDouble(reader, "Human"),
                HumanLow: GetNullableDouble(reader, "HumanLow"),
                HumanHigh: GetNullableDouble(reader, "HumanHigh"),
                Confidence: reader["Confidence"] != DBNull.Value ? reader["Confidence"].ToString() : null,
                ScoredFires: Convert.ToInt32(reader["ScoredFires"])
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

        string trendUrl = $"{_db.GetBaseUrl()}/Vegetation_Fire_Trend_Analysis_2018_2024.parquet";

        cmd.CommandText = $@"
            WITH MainData AS (
                SELECT 
                    SUM(e.modis_detections) AS FiresLegacy,
                    SUM(e.n_detections) AS FiresHarmonized,
                    COUNT(*) AS TotalFires,
                    AVG(CASE WHEN e.modis_detections > 0 THEN s.human_association_score END) AS HumanScoreLegacy,
                    AVG(s.human_association_score) AS HumanScoreHarmonized,
                    AVG(s.ci_lower) AS HumanScoreLow,
                    AVG(s.ci_upper) AS HumanScoreHigh,
                    COUNT(s.fire_id) AS ScoredFires,
                    COALESCE(SUM(CASE WHEN s.confidence_level = 'Low' THEN 1 ELSE 0 END), 0) AS ConfLow,
                    COALESCE(SUM(CASE WHEN s.confidence_level = 'Medium' THEN 1 ELSE 0 END), 0) AS ConfMed,
                    COALESCE(SUM(CASE WHEN s.confidence_level = 'High' THEN 1 ELSE 0 END), 0) AS ConfHigh,
                    COUNT(CASE WHEN EXTRACT(dow FROM e.date) = 0 THEN 1 END) AS Sun,
                    COUNT(CASE WHEN EXTRACT(dow FROM e.date) = 1 THEN 1 END) AS Mon,
                    COUNT(CASE WHEN EXTRACT(dow FROM e.date) = 2 THEN 1 END) AS Tue,
                    COUNT(CASE WHEN EXTRACT(dow FROM e.date) = 3 THEN 1 END) AS Wed,
                    COUNT(CASE WHEN EXTRACT(dow FROM e.date) = 4 THEN 1 END) AS Thu,
                    COUNT(CASE WHEN EXTRACT(dow FROM e.date) = 5 THEN 1 END) AS Fri,
                    COUNT(CASE WHEN EXTRACT(dow FROM e.date) = 6 THEN 1 END) AS Sat
                FROM read_parquet({GetEngineerPath(id)}) e
                LEFT JOIN read_parquet({GetScientistPath(id)}) s ON e.fire_id = s.fire_id
                WHERE EXTRACT(YEAR FROM e.date) = ? AND e.fire_type = 0
            ),
            TrendData AS (
                SELECT * FROM read_parquet('{trendUrl}')
                WHERE REPLACE(country, '_', ' ') = ?
            )
            SELECT 
                m.*,
                t.sen_slope_per_year, t.trend_direction, t.trend_significance, t.p_value,
                t.""2018"", t.""2019"", t.""2020"", t.""2021"", t.""2022"", t.""2023"", t.""2024""
            FROM MainData m
            LEFT JOIN TrendData t ON 1=1
        ";

        cmd.Parameters.Add(new DuckDBParameter { Value = filterYear });
        cmd.Parameters.Add(new DuckDBParameter { Value = id });

        using var reader = await cmd.ExecuteReaderAsync();
        if (await reader.ReadAsync())
        {
            int legacy = reader["FiresLegacy"] != DBNull.Value ? Convert.ToInt32(reader["FiresLegacy"]) : 0;
            int harmonized = reader["FiresHarmonized"] != DBNull.Value ? Convert.ToInt32(reader["FiresHarmonized"]) : 0;
            int totalFires = Convert.ToInt32(reader["TotalFires"]);
            double undercount = legacy == 0 ? 0 : (double)(harmonized - legacy) / legacy * 100;

            TrendDto? trend = null;
            if (reader["sen_slope_per_year"] != DBNull.Value)
            {
                var series = new List<TrendPointDto>();
                string[] years = { "2018", "2019", "2020", "2021", "2022", "2023", "2024" };
                foreach (var y in years)
                {
                    if (reader[y] != DBNull.Value)
                        series.Add(new TrendPointDto(int.Parse(y), Convert.ToInt64(reader[y])));
                }

                trend = new TrendDto(
                    Series: series,
                    Slope: Convert.ToDouble(reader["sen_slope_per_year"]),
                    Direction: reader["trend_direction"].ToString() ?? "",
                    Significance: reader["trend_significance"].ToString() ?? "",
                    PValue: Convert.ToDouble(reader["p_value"])
                );
            }

            var result = new RegionSummaryDto(
                UndercountPct: Math.Round(undercount, 1),
                FiresLegacy: legacy,
                FiresHarmonized: harmonized,
                WeekdayCounts: new double[] {
                    Convert.ToDouble(reader["Sun"]), Convert.ToDouble(reader["Mon"]), Convert.ToDouble(reader["Tue"]),
                    Convert.ToDouble(reader["Wed"]), Convert.ToDouble(reader["Thu"]), Convert.ToDouble(reader["Fri"]),
                    Convert.ToDouble(reader["Sat"])
                },
                HumanScoreLegacy: GetNullableDouble(reader, "HumanScoreLegacy"),
                HumanScoreHarmonized: GetNullableDouble(reader, "HumanScoreHarmonized"),
                HumanScoreLow: GetNullableDouble(reader, "HumanScoreLow"),
                HumanScoreHigh: GetNullableDouble(reader, "HumanScoreHigh"),
                Confidence: new ConfidenceCountDto(
                    Low: Convert.ToInt32(reader["ConfLow"]),
                    Medium: Convert.ToInt32(reader["ConfMed"]),
                    High: Convert.ToInt32(reader["ConfHigh"])
                ),
                ScoredFires: Convert.ToInt32(reader["ScoredFires"]),
                TotalFires: totalFires,
                Trend: trend
            );

            _cache.Set(cacheKey, result, TimeSpan.FromMinutes(30));
            return result;
        }
        return new RegionSummaryDto(0, 0, 0, new double[7], null, null, null, null, new ConfidenceCountDto(0,0,0), 0, 0, null);
    }

    public async Task<ProgressDto> GetProgressAsync(string? region, double? lat, double? lng, double? radiusKm)
    {
        string cacheKey = $"progress_{region}_{lat}_{lng}_{radiusKm}";
        if (_cache.TryGetValue(cacheKey, out ProgressDto? cachedProgress)) return cachedProgress!;

        using var connection = _db.CreateConnection();
        using var cmd = connection.CreateCommand();

        string spatialFilter = "";
        var parameters = new List<DuckDBParameter>();
        string engineerPath = GetEngineerPath(region);
        string scientistPath = GetScientistPath(region);

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
            return new ProgressDto(new List<ProgressSeriesDto>(), 0, 0, 0, "stable", new HumanLikelihoodDto(null, null, null, null, new ConfidenceCountDto(0,0,0), 0), false);
        }

        cmd.CommandText = $@"
            SELECT 
                EXTRACT(YEAR FROM e.date) AS Year,
                SUM(e.modis_detections) AS Legacy,
                SUM(e.n_detections) AS Harmonized
            FROM read_parquet({engineerPath}) e
            WHERE e.fire_type = 0 {spatialFilter}
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

        if (series.Count == 0) return new ProgressDto(new List<ProgressSeriesDto>(), 0, 0, 0, "stable", new HumanLikelihoodDto(null, null, null, null, new ConfidenceCountDto(0,0,0), 0), false);

        cmd.CommandText = $@"
            SELECT 
                AVG(s.human_association_score) AS HumanHarmonized,
                AVG(s.ci_lower) AS HumanLow,
                AVG(s.ci_upper) AS HumanHigh,
                COUNT(s.fire_id) AS ScoredFires,
                COALESCE(SUM(CASE WHEN s.confidence_level = 'Low' THEN 1 ELSE 0 END), 0) AS ConfLow,
                COALESCE(SUM(CASE WHEN s.confidence_level = 'Medium' THEN 1 ELSE 0 END), 0) AS ConfMed,
                COALESCE(SUM(CASE WHEN s.confidence_level = 'High' THEN 1 ELSE 0 END), 0) AS ConfHigh
            FROM read_parquet({engineerPath}) e
            LEFT JOIN read_parquet({scientistPath}) s ON e.fire_id = s.fire_id
            WHERE e.fire_type = 0 {spatialFilter}
        ";
        cmd.Parameters.Clear();
        foreach (var p in parameters) cmd.Parameters.Add(p);

        HumanLikelihoodDto humanLikelihood = new HumanLikelihoodDto(null, null, null, null, new ConfidenceCountDto(0,0,0), 0);
        using (var reader = await cmd.ExecuteReaderAsync())
        {
            if (await reader.ReadAsync())
            {
                humanLikelihood = new HumanLikelihoodDto(
                    Legacy: null,
                    Harmonized: GetNullableDouble(reader, "HumanHarmonized"),
                    Low: GetNullableDouble(reader, "HumanLow"),
                    High: GetNullableDouble(reader, "HumanHigh"),
                    Confidence: new ConfidenceCountDto(
                        Low: Convert.ToInt32(reader["ConfLow"]),
                        Medium: Convert.ToInt32(reader["ConfMed"]),
                        High: Convert.ToInt32(reader["ConfHigh"])
                    ),
                    ScoredFires: Convert.ToInt32(reader["ScoredFires"])
                );
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
            HumanLikelihood: humanLikelihood,
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
        string engineerPath = GetEngineerPath(region);
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
            FROM read_parquet({engineerPath})
            WHERE CAST(date AS VARCHAR) = ? AND fire_type = 0 {spatialFilter}
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
        string engineerPath = GetEngineerPath(region);
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
            FROM read_parquet({engineerPath})
            WHERE EXTRACT(YEAR FROM date) = ? AND fire_type = 0 {spatialFilter}
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
                COUNT(*) AS TotalFires,
                AVG(CASE WHEN e.modis_detections > 0 THEN s.human_association_score END) AS HumanScoreLegacy,
                AVG(s.human_association_score) AS HumanScoreHarmonized,
                AVG(s.ci_lower) AS HumanScoreLow,
                AVG(s.ci_upper) AS HumanScoreHigh,
                COUNT(s.fire_id) AS ScoredFires,
                COALESCE(SUM(CASE WHEN s.confidence_level = 'Low' THEN 1 ELSE 0 END), 0) AS ConfLow,
                COALESCE(SUM(CASE WHEN s.confidence_level = 'Medium' THEN 1 ELSE 0 END), 0) AS ConfMed,
                COALESCE(SUM(CASE WHEN s.confidence_level = 'High' THEN 1 ELSE 0 END), 0) AS ConfHigh
            FROM read_parquet({GetEngineerPath(null)}) e
            LEFT JOIN read_parquet({GetScientistPath(null)}) s ON e.fire_id = s.fire_id
            WHERE EXTRACT(YEAR FROM e.date) = ? AND e.fire_type = 0
        ";
        cmd.Parameters.Add(new DuckDBParameter { Value = filterYear });

        using var reader = await cmd.ExecuteReaderAsync();
        if (await reader.ReadAsync())
        {
            int legacy = reader["FiresLegacy"] != DBNull.Value ? Convert.ToInt32(reader["FiresLegacy"]) : 0;
            int harmonized = reader["FiresHarmonized"] != DBNull.Value ? Convert.ToInt32(reader["FiresHarmonized"]) : 0;
            int totalFires = Convert.ToInt32(reader["TotalFires"]);
            double undercount = legacy == 0 ? 0 : (double)(harmonized - legacy) / legacy * 100;

            var result = new RegionSummaryDto(
                UndercountPct: Math.Round(undercount, 1),
                FiresLegacy: legacy,
                FiresHarmonized: harmonized,
                WeekdayCounts: new double[7], 
                HumanScoreLegacy: GetNullableDouble(reader, "HumanScoreLegacy"),
                HumanScoreHarmonized: GetNullableDouble(reader, "HumanScoreHarmonized"),
                HumanScoreLow: GetNullableDouble(reader, "HumanScoreLow"),
                HumanScoreHigh: GetNullableDouble(reader, "HumanScoreHigh"),
                Confidence: new ConfidenceCountDto(
                    Low: Convert.ToInt32(reader["ConfLow"]),
                    Medium: Convert.ToInt32(reader["ConfMed"]),
                    High: Convert.ToInt32(reader["ConfHigh"])
                ),
                ScoredFires: Convert.ToInt32(reader["ScoredFires"]),
                TotalFires: totalFires,
                Trend: null
            );

            _cache.Set(cacheKey, result, TimeSpan.FromMinutes(30));
            return result;
        }
        return new RegionSummaryDto(0, 0, 0, new double[7], null, null, null, null, new ConfidenceCountDto(0,0,0), 0, 0, null);
    }

    public async Task<IEnumerable<CountryDto>> GetCountriesAsync()
    {
        string cacheKey = "countries_list";
        if (_cache.TryGetValue(cacheKey, out IEnumerable<CountryDto>? cachedCountries)) return cachedCountries!;

        using var connection = _db.CreateConnection();
        using var cmd = connection.CreateCommand();

        cmd.CommandText = $@"
            SELECT 
                e.country AS Id,
                SUM(e.modis_detections) AS Legacy,
                SUM(e.n_detections) AS Harmonized,
                AVG(s.human_association_score) AS HumanScore,
                COALESCE(SUM(CASE WHEN s.confidence_level = 'Low' THEN 1 ELSE 0 END), 0) AS ConfLow,
                COALESCE(SUM(CASE WHEN s.confidence_level = 'Medium' THEN 1 ELSE 0 END), 0) AS ConfMed,
                COALESCE(SUM(CASE WHEN s.confidence_level = 'High' THEN 1 ELSE 0 END), 0) AS ConfHigh
            FROM read_parquet({GetEngineerPath(null)}) e
            LEFT JOIN read_parquet({GetScientistPath(null)}) s ON e.fire_id = s.fire_id
            WHERE e.fire_type = 0 AND e.country IS NOT NULL
            GROUP BY e.country
            ORDER BY e.country
        ";

        var results = new List<CountryDto>();
        using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            int legacy = reader["Legacy"] != DBNull.Value ? Convert.ToInt32(reader["Legacy"]) : 0;
            int harmonized = reader["Harmonized"] != DBNull.Value ? Convert.ToInt32(reader["Harmonized"]) : 0;
            double undercount = legacy == 0 ? 0 : (double)(harmonized - legacy) / legacy * 100;

            string rawCountry = reader["Id"].ToString() ?? "";
            string id = rawCountry.Replace(" ", "_");
            string name = rawCountry == "United States" ? "United States of America" : rawCountry;

            results.Add(new CountryDto(
                Id: id,
                Name: name,
                UndercountPct: Math.Round(undercount, 1),
                HumanScore: GetNullableDouble(reader, "HumanScore"),
                Confidence: new ConfidenceCountDto(
                    Low: Convert.ToInt32(reader["ConfLow"]),
                    Medium: Convert.ToInt32(reader["ConfMed"]),
                    High: Convert.ToInt32(reader["ConfHigh"])
                )
            ));
        }

        _cache.Set(cacheKey, results, TimeSpan.FromMinutes(30));
        return results;
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
            FROM read_parquet({GetEngineerPath(null)})
            WHERE fire_type = 0
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