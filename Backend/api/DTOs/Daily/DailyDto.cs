namespace api.DTOs;

public record DailyDto(
    string Date,
    int Legacy,
    int Harmonized
);