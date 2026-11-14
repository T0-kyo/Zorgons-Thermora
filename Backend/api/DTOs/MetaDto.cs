namespace api.DTOs;


public record MetaDto(
    string MinDate,
    string MaxDate,
    long TotalDetections
);