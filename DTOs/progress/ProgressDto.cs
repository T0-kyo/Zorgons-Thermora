using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace Thermora.Api.DTOs
{
    /// <summary>
    /// Overall baseline-vs-recent progress/trend snapshot returned by GET /progress.
    /// Priority: P1.
    /// </summary>
    public sealed class ProgressDto
    {
        /// <summary>Baseline fire-detection value used as the comparison point.</summary>
        [JsonPropertyName("baseline")]
        public double Baseline { get; set; }

        /// <summary>Most recent fire-detection value.</summary>
        [JsonPropertyName("recent")]
        public double Recent { get; set; }

        /// <summary>Percentage change from baseline to recent (can be positive or negative).</summary>
        [JsonPropertyName("changePct")]
        public double ChangePct { get; set; }

        /// <summary>
        /// Direction of change (e.g. "increasing", "decreasing", "stable").
        /// </summary>
        [Required(ErrorMessage = "Direction is required.")]
        [StringLength(20, ErrorMessage = "Direction must be 20 characters or fewer.")]
        [JsonPropertyName("direction")]
        public string Direction { get; set; } = string.Empty;

        /// <summary>Likelihood (0-1) that the observed change is human-driven.</summary>
        [Range(0.0, 1.0, ErrorMessage = "HumanLikelihood must be between 0 and 1.")]
        [JsonPropertyName("humanLikelihood")]
        public double HumanLikelihood { get; set; }

        /// <summary>Whether this region/metric currently has sufficient data coverage to be reliable.</summary>
        [JsonPropertyName("covered")]
        public bool Covered { get; set; }

        /// <summary>Yearly historical series for the sparkline.</summary>
        [JsonPropertyName("series")]
        public List<ProgressYearDataDto> Series { get; set; } = new List<ProgressYearDataDto>();
    }

    /// <summary>
    /// Represents yearly breakdown for progress series.
    /// </summary>
    public sealed class ProgressYearDataDto
    {
        [JsonPropertyName("year")]
        public int Year { get; set; }

        [JsonPropertyName("legacy")]
        public int Legacy { get; set; }

        [JsonPropertyName("harmonized")]
        public int Harmonized { get; set; }
    }
}