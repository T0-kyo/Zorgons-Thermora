namespace api.DTOs;

public record YearRangeDto(int First, int Last);

/// <summary>
/// Series: fires per complete year (years without fires are 0, not missing).
/// Baseline / Recent: mean harmonized fires per year in BaselineYears and RecentYears. Both windows
/// lie in years seen by the same satellites (Basis), so the change is not an artefact of VIIRS
/// joining in 2012 / 2018.
/// </summary>
public record ProgressDto(
    List<ProgressSeriesDto> Series,
    double Baseline,
    double Recent,
    double ChangePct,
    string Direction,
    HumanLikelihoodDto HumanLikelihood,
    bool Covered,
    YearRangeDto? BaselineYears = null,
    YearRangeDto? RecentYears = null,
    string? Basis = null
);
