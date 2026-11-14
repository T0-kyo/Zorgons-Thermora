namespace api.DTOs;

public record CountryDto(
    string Id,
    string Name,
    double UndercountPct,
    double? HumanScore,
    ConfidenceCountDto Confidence
);