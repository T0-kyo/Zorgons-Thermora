namespace api.Repositories;

public class DuckDbRepository : IDataRepository
{
    public Task<object> GetCellsAsync(int year, string? regionId) 
        => Task.FromResult<object>(new { message = "Cells data coming soon" });

    public Task<object> GetRegionSummaryAsync(string id, int? year) 
        => Task.FromResult<object>(new { message = $"Summary for {id} coming soon" });

    public Task<object> GetProgressAsync(string? region, double? lat, double? lng, double? radiusKm) 
        => Task.FromResult<object>(new { message = "Progress data coming soon" });

    public Task<object> GetDailyAsync(int year, string? region, double? lat, double? lng, double? radiusKm) 
        => Task.FromResult<object>(new { message = "Daily data coming soon" });

    public Task<object> GetDayAsync(string date, string? region, double? lat, double? lng, double? radiusKm) 
        => Task.FromResult<object>(new { message = $"Day {date} data coming soon" });

    public Task<object> GetRegionsAsync() 
        => Task.FromResult<object>(new { message = "Regions coming soon" });

    public Task<object> GetGlobalSummaryAsync(int? year) 
        => Task.FromResult<object>(new { message = "Global summary coming soon" });

    public Task<object> GetMetaAsync() 
        => Task.FromResult<object>(new { message = "Metadata coming soon" });
}