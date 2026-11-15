namespace api.DTOs;

/// <summary>
/// Counts are FIRE OBSERVATIONS (one per ~1 km pixel, local date and day/night pass), not detections:
/// VIIRS pixels are 375 m, so one fire gives several VIIRS detections where MODIS gives one, and a
/// detection ratio would measure pixel size, not missed fires.
///   FiresLegacy     = fires MODIS saw (modis_detections > 0)
///   FiresHarmonized = all fires (MODIS + VIIRS)
///   UndercountPct   = (FiresHarmonized - FiresLegacy) / FiresLegacy x 100; null when MODIS saw none
/// WeekdayCounts are Sunday-first.
/// </summary>
public record RegionSummaryDto(
    double? UndercountPct,
    int FiresLegacy,
    int FiresHarmonized,
    double[] WeekdayCounts,
    double? HumanScoreLegacy,
    double? HumanScoreHarmonized,
    double? HumanScoreLow,
    double? HumanScoreHigh,
    ConfidenceCountDto Confidence,
    int ScoredFires,
    int TotalFires,
    TrendDto? Trend,
    string? RegionId = null,
    int? Year = null,
    bool HasScores = false
);
