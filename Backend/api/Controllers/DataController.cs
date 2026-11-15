using System.Globalization;
using api.Exceptions;
using api.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace api.Controllers;

[ApiController]
[Route("api")]
public class DataController : ControllerBase
{
    private readonly IDataRepository _repo;

    public DataController(IDataRepository repo)
    {
        _repo = repo;
    }

    [HttpGet("cells")]
    public async Task<IActionResult> GetCells([FromQuery] int year, [FromQuery] string? regionId)
    {
        CheckYear(year);
        return Ok(await _repo.GetCellsAsync(year, regionId));
    }

    [HttpGet("countries/{id}/summary")]
    public async Task<IActionResult> GetRegionSummary(string id, [FromQuery] int? year)
    {
        if (year.HasValue) CheckYear(year.Value);
        return Ok(await _repo.GetRegionSummaryAsync(id, year));
    }

    [HttpGet("progress")]
    public async Task<IActionResult> GetProgress(
        [FromQuery] string? region, [FromQuery] double? lat, [FromQuery] double? lng, [FromQuery] double? radiusKm)
    {
        CheckTarget(region, lat, lng, radiusKm);
        return Ok(await _repo.GetProgressAsync(region, lat, lng, radiusKm));
    }

    [HttpGet("daily")]
    public async Task<IActionResult> GetDaily(
        [FromQuery] int year, [FromQuery] string? region, [FromQuery] double? lat, [FromQuery] double? lng, [FromQuery] double? radiusKm)
    {
        CheckYear(year);
        CheckTarget(region, lat, lng, radiusKm);
        return Ok(await _repo.GetDailyAsync(year, region, lat, lng, radiusKm));
    }

    [HttpGet("day")]
    public async Task<IActionResult> GetDay(
        [FromQuery] string date, [FromQuery] string? region, [FromQuery] double? lat, [FromQuery] double? lng, [FromQuery] double? radiusKm)
    {
        if (!DateOnly.TryParseExact(date ?? "", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var day))
            throw new BadRequestException("Date is required as YYYY-MM-DD.");
        CheckYear(day.Year);
        CheckTarget(region, lat, lng, radiusKm);
        return Ok(await _repo.GetDayAsync(day, region, lat, lng, radiusKm));
    }

    [HttpGet("countries")]
    public async Task<IActionResult> GetCountries() => Ok(await _repo.GetCountriesAsync());

    [HttpGet("summary")]
    public async Task<IActionResult> GetGlobalSummary([FromQuery] int? year)
    {
        if (year.HasValue) CheckYear(year.Value);
        return Ok(await _repo.GetGlobalSummaryAsync(year));
    }

    [HttpGet("meta")]
    public async Task<IActionResult> GetMeta() => Ok(await _repo.GetMetaAsync());

    private static long _lastManualRefresh;

    /// <summary>
    /// Check the dataset now (after uploading a country to Hugging Face) instead of waiting for the
    /// periodic check. Cheap when nothing changed; at most one manual check every 10 s.
    /// </summary>
    [HttpPost("catalog/refresh")]
    public async Task<IActionResult> RefreshCatalog([FromServices] Services.ICountryCatalog catalog)
    {
        var now = DateTime.UtcNow.Ticks;
        var last = Interlocked.Read(ref _lastManualRefresh);
        if (now - last < TimeSpan.FromSeconds(10).Ticks || Interlocked.CompareExchange(ref _lastManualRefresh, now, last) != last)
            return StatusCode(429, new { title = "Refreshed less than 10 s ago; try again shortly." });
        await catalog.RefreshAsync(HttpContext.RequestAborted);
        return Ok(await _repo.GetMetaAsync());
    }

    private static void CheckYear(int year)
    {
        if (year < 2000 || year > 2100)
            throw new BadRequestException("Year must be between 2000 and 2100.");
    }

    private static void CheckTarget(string? region, double? lat, double? lng, double? radiusKm)
    {
        if (string.IsNullOrWhiteSpace(region) && (lat == null || lng == null))
            throw new BadRequestException("Must provide either a region ID or lat/lng coordinates.");
        if (lat is < -90 or > 90 || lng is < -180 or > 180)
            throw new BadRequestException("lat must be within -90..90 and lng within -180..180.");
        if (radiusKm is <= 0 or > 2000)
            throw new BadRequestException("radiusKm must be between 0 and 2000.");
    }
}
