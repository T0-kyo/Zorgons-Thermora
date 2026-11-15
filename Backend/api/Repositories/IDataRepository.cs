using api.DTOs;

namespace api.Repositories;

public interface IDataRepository
{
    Task<IEnumerable<CellDto>> GetCellsAsync(int year, string? regionId);
    Task<RegionSummaryDto> GetRegionSummaryAsync(string id, int? year);
    Task<ProgressDto> GetProgressAsync(string? region, double? lat, double? lng, double? radiusKm);
    Task<IEnumerable<DailyDto>> GetDailyAsync(int year, string? region, double? lat, double? lng, double? radiusKm);
    Task<DailyDto> GetDayAsync(DateOnly date, string? region, double? lat, double? lng, double? radiusKm);
    Task<IEnumerable<CountryDto>> GetCountriesAsync();
    Task<RegionSummaryDto> GetGlobalSummaryAsync(int? year);
    Task<MetaDto> GetMetaAsync();

    /// <summary>All-years stats of one country (used to fill /api/countries in the background).</summary>
    Task<CountryStats> ComputeCountryStatsAsync(string id);
}

public record CountryStats(double? UndercountPct, double? HumanScore, ConfidenceCountDto Confidence);
