namespace api.DTOs;


public record RegionSummaryDto(
    double UndercountPct,
    int FiresLegacy,
    int FiresHarmonized,
    double[] WeekdayCounts,
    double HumanScoreLegacy,
    double HumanScoreHarmonized
);