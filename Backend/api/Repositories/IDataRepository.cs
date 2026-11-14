using api.DTOs;


namespace api.Repositories;

public interface IDataRepository
{
    Task<IEnumerable<CellDto>> GetCellsAsync(int year, string? regionId);
    Task<RegionSummaryDto> GetRegionSummaryAsync(string id, int? year);
    Task<ProgressDto> GetProgressAsync(string? region, double? lat, double? lng, double? radiusKm);
    Task<IEnumerable<DailyDto>> GetDailyAsync(int year, string? region, double? lat, double? lng, double? radiusKm);
    Task<DailyDto> GetDayAsync(string date, string? region, double? lat, double? lng, double? radiusKm);
    Task<IEnumerable<RegionDto>> GetRegionsAsync();
    Task<RegionSummaryDto> GetGlobalSummaryAsync(int? year);
    Task<MetaDto> GetMetaAsync();
}