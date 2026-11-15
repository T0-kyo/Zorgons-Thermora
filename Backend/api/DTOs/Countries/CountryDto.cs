namespace api.DTOs;

/// <summary>
/// One country of the dataset. Stats are over all years and stay null until the server has
/// computed them (in the background, when idle); the list itself is available immediately.
/// </summary>
public record CountryDto(
    string Id,
    string Name,
    double? UndercountPct,
    double? HumanScore,
    ConfidenceCountDto? Confidence,
    string? Iso3 = null,
    bool HasScores = false,
    string? FirstDate = null,
    string? LastDate = null
);
