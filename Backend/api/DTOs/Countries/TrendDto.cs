namespace api.DTOs;

public record TrendPointDto(
    int Year,
    long Count
);

/// <summary>The science team's trend for a country. Any value missing in their file is null (never a crash).</summary>
public record TrendDto(
    List<TrendPointDto> Series,
    double? Slope,
    string? Direction,
    string? Significance,
    double? PValue
);
