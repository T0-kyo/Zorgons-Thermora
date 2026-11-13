using System;
using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace Thermora.Api.DTOs
{
    /// <summary>
    /// Single day's fire detection counts returned by GET /daily.
    /// Priority: P1.
    ///
    /// Modeled as DateTime (one of the two forms named in the spec) rather than
    /// a raw string, so System.Text.Json serializes it as a well-formed ISO-8601
    /// value and callers get compile-time type safety plus free parsing/formatting,
    /// while still round-tripping cleanly to the frontend as a string on the wire.
    /// </summary>
    public sealed class DailyDto
    {
        /// <summary>Calendar date this record covers.</summary>
        [DataType(DataType.Date)]
        [JsonPropertyName("date")]
        public DateTime Date { get; set; }

        /// <summary>Legacy (MODIS) fire detections for this date.</summary>
        [Range(0, int.MaxValue, ErrorMessage = "Legacy detections cannot be negative.")]
        [JsonPropertyName("legacy")]
        public int Legacy { get; set; }

        /// <summary>Harmonized fire detections for this date.</summary>
        [Range(0, int.MaxValue, ErrorMessage = "Harmonized detections cannot be negative.")]
        [JsonPropertyName("harmonized")]
        public int Harmonized { get; set; }
    }
}
