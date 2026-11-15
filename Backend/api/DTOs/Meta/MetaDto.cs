namespace api.DTOs;

/// <summary>
/// MinDate / MaxDate: span of the data. MaxDate leaves out the 1 January spill-over (fires are
/// dated by local solar date, so the last UTC night of 2024 can be 1 Jan 2025 locally).
/// TotalDetections: fire observations (rows) in the dataset.
/// </summary>
public record MetaDto(
    string MinDate,
    string MaxDate,
    long TotalDetections,
    int? FirstFullYear = null,
    int? LastFullYear = null,
    int Countries = 0,
    int ScoredCountries = 0
);
