namespace api.Repositories;

public interface IDataRepository
{
    Task<object> GetCellsAsync(int year, string? regionId);
    Task<object> GetRegionSummaryAsync(string id, int? year);
    Task<object> GetProgressAsync(string? region, double? lat, double? lng, double? radiusKm);
    Task<object> GetDailyAsync(int year, string? region, double? lat, double? lng, double? radiusKm);
    Task<object> GetDayAsync(string date, string? region, double? lat, double? lng, double? radiusKm);
    Task<object> GetRegionsAsync();
    Task<object> GetGlobalSummaryAsync(int? year);
    Task<object> GetMetaAsync();
}