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
        if (year < 2000 || year > 2026)
            throw new BadRequestException("Year must be between 2000 and 2026.");

        var result = await _repo.GetCellsAsync(year, regionId);
        return Ok(result);
    }

    [HttpGet("regions/{id}/summary")]
    public async Task<IActionResult> GetRegionSummary(string id, [FromQuery] int? year)
    {
        if (year.HasValue && (year < 2000 || year > 2026))
            throw new BadRequestException("Year must be between 2000 and 2026.");

        var result = await _repo.GetRegionSummaryAsync(id, year);
        return Ok(result);
    }

    [HttpGet("progress")]
    public async Task<IActionResult> GetProgress(
        [FromQuery] string? region, [FromQuery] double? lat, [FromQuery] double? lng, [FromQuery] double? radiusKm)
    {
        if (region == null && (lat == null || lng == null))
            throw new BadRequestException("Must provide either a region ID or lat/lng coordinates.");

        var result = await _repo.GetProgressAsync(region, lat, lng, radiusKm);
        return Ok(result);
    }

    [HttpGet("daily")]
    public async Task<IActionResult> GetDaily(
        [FromQuery] int year, [FromQuery] string? region, [FromQuery] double? lat, [FromQuery] double? lng, [FromQuery] double? radiusKm)
    {
        if (year < 2000 || year > 2026)
            throw new BadRequestException("Year must be between 2000 and 2026.");
            
        if (region == null && (lat == null || lng == null))
            throw new BadRequestException("Must provide either a region ID or lat/lng coordinates.");

        var result = await _repo.GetDailyAsync(year, region, lat, lng, radiusKm);
        return Ok(result);
    }

    [HttpGet("day")]
    public async Task<IActionResult> GetDay(
        [FromQuery] string date, [FromQuery] string? region, [FromQuery] double? lat, [FromQuery] double? lng, [FromQuery] double? radiusKm)
    {
        if (string.IsNullOrEmpty(date))
            throw new BadRequestException("Date is required (YYYY-MM-DD).");
            
        if (region == null && (lat == null || lng == null))
            throw new BadRequestException("Must provide either a region ID or lat/lng coordinates.");

        var result = await _repo.GetDayAsync(date, region, lat, lng, radiusKm);
        return Ok(result);
    }

    [HttpGet("regions")]
    public async Task<IActionResult> GetRegions()
    {
        var result = await _repo.GetRegionsAsync();
        return Ok(result);
    }

    [HttpGet("summary")]
    public async Task<IActionResult> GetGlobalSummary([FromQuery] int? year)
    {
        if (year.HasValue && (year < 2000 || year > 2026))
            throw new BadRequestException("Year must be between 2000 and 2026.");

        var result = await _repo.GetGlobalSummaryAsync(year);
        return Ok(result);
    }

    [HttpGet("meta")]
    public async Task<IActionResult> GetMeta()
    {
        var result = await _repo.GetMetaAsync();
        return Ok(result);
    }
}