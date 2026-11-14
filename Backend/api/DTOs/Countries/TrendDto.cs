namespace api.DTOs;

public record TrendPointDto(
    int Year,
    long Count
);

public record TrendDto(
    List<TrendPointDto> Series,
    double Slope,
    string Direction,
    string Significance,
    double PValue
);