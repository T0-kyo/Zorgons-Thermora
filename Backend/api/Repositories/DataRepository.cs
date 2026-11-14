using api.DTOs;
using api.Services;
using DuckDB.NET.Data;


namespace api.Repositories;

public class DuckDbRepository : IDataRepository
{
    private readonly IDuckDbService _db;

    public DuckDbRepository(IDuckDbService db)
    {
        _db = db;
    }

    private string GetParquetPath() => $"{_db.GetEngineerUrl()}/harmonized_data.parquet";

    public async Task<IEnumerable<CellDto>> GetCellsAsync(int year, string? regionId)
    {
        using var connection = _db.CreateConnection();
        using var cmd = connection.CreateCommand();

        string countryFilter = string.IsNullOrEmpty(regionId) ? "" : $"AND country = '{regionId}'";

        cmd.CommandText = $@"
            SELECT 
                ROUND(latitude, 2) AS Lat,
                ROUND(longitude, 2) AS Lng,
                country AS RegionId,
                SUM(modis_detections) AS Legacy,
                SUM(n_detections) AS Harmonized,
                0.0 AS Human
            FROM read_parquet('{GetParquetPath()}')
            WHERE EXTRACT(YEAR FROM date) = {year} {countryFilter}
            GROUP BY ROUND(latitude, 2), ROUND(longitude, 2), country
            LIMIT 3000
        ";

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
                Human: Convert.ToDouble(reader["Human"])
            ));
        }
        return results;
    }

    public async Task<IEnumerable<DailyDto>> GetDailyAsync(int year, string? region, double? lat, double? lng, double? radiusKm)
    {
        using var connection = _db.CreateConnection();
        using var cmd = connection.CreateCommand();

        string countryFilter = string.IsNullOrEmpty(region) ? "" : $"AND country = '{region}'";

        cmd.CommandText = $@"
            SELECT 
                CAST(date AS VARCHAR) AS Date,
                SUM(modis_detections) AS Legacy,
                SUM(n_detections) AS Harmonized
            FROM read_parquet('{GetParquetPath()}')
            WHERE EXTRACT(YEAR FROM date) = {year} {countryFilter}
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
        return results;
    }

    public async Task<IEnumerable<CountryDto>> GetCountriesAsync()
    {
        using var connection = _db.CreateConnection();
        using var cmd = connection.CreateCommand();

        cmd.CommandText = $@"
            SELECT DISTINCT country AS Id, country AS Name 
            FROM read_parquet('{GetParquetPath()}') 
            WHERE country IS NOT NULL 
            ORDER BY country
        ";

        var results = new List<CountryDto>();
        using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            results.Add(new CountryDto(
                Id: reader["Id"].ToString() ?? "",
                Name: reader["Name"].ToString() ?? ""
            ));
        }
        return results;
    }

    public async Task<MetaDto> GetMetaAsync()
    {
        using var connection = _db.CreateConnection();
        using var cmd = connection.CreateCommand();

        cmd.CommandText = $@"
            SELECT 
                CAST(MIN(date) AS VARCHAR) AS MinDate,
                CAST(MAX(date) AS VARCHAR) AS MaxDate,
                COUNT(*) AS TotalDetections
            FROM read_parquet('{GetParquetPath()}')
        ";

        using var reader = await cmd.ExecuteReaderAsync();
        if (await reader.ReadAsync())
        {
            return new MetaDto(
                MinDate: reader["MinDate"].ToString() ?? "",
                MaxDate: reader["MaxDate"].ToString() ?? "",
                TotalDetections: Convert.ToInt64(reader["TotalDetections"])
            );
        }
        return new MetaDto("", "", 0L);
    }

    // --- STILL WAITING ON DATA SCIENTIST ---
    public Task<RegionSummaryDto> GetRegionSummaryAsync(string id, int? year) => throw new NotImplementedException();
    public Task<ProgressDto> GetProgressAsync(string? region, double? lat, double? lng, double? radiusKm) => throw new NotImplementedException();
    public Task<DailyDto> GetDayAsync(string date, string? region, double? lat, double? lng, double? radiusKm) => throw new NotImplementedException();
    public Task<RegionSummaryDto> GetGlobalSummaryAsync(int? year) => throw new NotImplementedException();
}