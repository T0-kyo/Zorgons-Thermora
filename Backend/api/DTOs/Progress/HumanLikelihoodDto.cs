namespace api.DTOs;

public record HumanLikelihoodDto(
    double? Legacy,
    double? Harmonized,
    double? Low,
    double? High,
    ConfidenceCountDto Confidence,
    int ScoredFires
);