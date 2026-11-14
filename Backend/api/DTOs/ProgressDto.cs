namespace api.DTOs;

public record ProgressDto(
    List<ProgressSeriesDto> Series,
    double Baseline,
    double Recent,
    double ChangePct,
    string Direction,
    HumanLikelihoodDto HumanLikelihood,
    bool Covered
);