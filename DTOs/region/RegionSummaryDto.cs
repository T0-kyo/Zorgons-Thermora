using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace Thermora.Api.DTOs
{
    /// <summary>
    /// Per-region, per-year fire detection summary returned by
    /// GET /regions/{id}/summary?year=.
    /// Priority: P1.
    /// </summary>
    public sealed class RegionSummaryDto
    {
        /// <summary>
        /// Estimated percentage by which legacy (MODIS) detections undercount
        /// harmonized detections for this region/year.
        /// </summary>
        [JsonPropertyName("undercountPct")]
        public double UndercountPct { get; set; }

        /// <summary>Human-readable confidence interval for the undercount estimate (e.g. "±4.3%").</summary>
        [Required(ErrorMessage = "UndercountCi is required.")]
        [StringLength(50, ErrorMessage = "UndercountCi must be 50 characters or fewer.")]
        [JsonPropertyName("undercountCi")]
        public string UndercountCi { get; set; } = string.Empty;

        /// <summary>Total legacy (MODIS) fire detections for the region/year.</summary>
        [Range(0, int.MaxValue, ErrorMessage = "FiresLegacy cannot be negative.")]
        [JsonPropertyName("firesLegacy")]
        public int FiresLegacy { get; set; }

        /// <summary>Total harmonized fire detections for the region/year.</summary>
        [Range(0, int.MaxValue, ErrorMessage = "FiresHarmonized cannot be negative.")]
        [JsonPropertyName("firesHarmonized")]
        public int FiresHarmonized { get; set; }

        /// <summary>Average human-driven likelihood (0-1) across legacy detections.</summary>
        [Range(0.0, 1.0, ErrorMessage = "HumanScoreLegacy must be between 0 and 1.")]
        [JsonPropertyName("humanScoreLegacy")]
        public double HumanScoreLegacy { get; set; }

        /// <summary>Average human-driven likelihood (0-1) across harmonized detections.</summary>
        [Range(0.0, 1.0, ErrorMessage = "HumanScoreHarmonized must be between 0 and 1.")]
        [JsonPropertyName("humanScoreHarmonized")]
        public double HumanScoreHarmonized { get; set; }

        /// <summary>
        /// Fire counts by day of week, Monday first. Must contain exactly 7 values.
        /// </summary>
        [Required(ErrorMessage = "WeekdayCounts is required.")]
        [MinLength(7, ErrorMessage = "WeekdayCounts must contain exactly 7 values (Monday-Sunday).")]
        [MaxLength(7, ErrorMessage = "WeekdayCounts must contain exactly 7 values (Monday-Sunday).")]
        [JsonPropertyName("weekdayCounts")]
        public List<double> WeekdayCounts { get; set; } = new List<double>();

        /// <summary>Whether the underlying trend remains statistically significant after harmonization.</summary>
        [JsonPropertyName("trendSurvives")]
        public bool TrendSurvives { get; set; }

        /// <summary>Plain-language verdict summarizing the region's result for this year.</summary>
        [Required(ErrorMessage = "Verdict is required.")]
        [StringLength(1000, ErrorMessage = "Verdict must be 1000 characters or fewer.")]
        [JsonPropertyName("verdict")]
        public string Verdict { get; set; } = string.Empty;

        /// <summary>Yearly trend data with raw, corrected, and uncertainty bands.</summary>
        [JsonPropertyName("trend")]
        public List<TrendPointDto> Trend { get; set; } = new List<TrendPointDto>();
    }

    /// <summary>
    /// Represents yearly trend data points for region summary.
    /// </summary>
    public sealed class TrendPointDto
    {
        [JsonPropertyName("year")]
        public int Year { get; set; }

        [JsonPropertyName("raw")]
        public double Raw { get; set; }

        [JsonPropertyName("corrected")]
        public double Corrected { get; set; }

        [JsonPropertyName("lo")]
        public double Lo { get; set; }

        [JsonPropertyName("hi")]
        public double Hi { get; set; }
    }
}