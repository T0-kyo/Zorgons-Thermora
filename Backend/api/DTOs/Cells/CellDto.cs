namespace api.DTOs;

public record CellDto(
    double Lat,
    double Lng,
    string RegionId,
    int Legacy,
    int Harmonized,
    double? Human,
    double? HumanLow,
    double? HumanHigh,
    string? Confidence,
    int ScoredFires
);