using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace Thermora.Api.DTOs
{
    /// <summary>
    /// Represents a single grid cell returned by GET /cells.
    /// Priority: P0.
    /// </summary>
    public sealed class CellDto
    {
        /// <summary>Latitude of the cell center, rounded to 2 decimal places.</summary>
        [Range(-90.0, 90.0, ErrorMessage = "Lat must be between -90 and 90 degrees.")]
        [JsonPropertyName("lat")]
        public double Lat { get; set; }

        /// <summary>Longitude of the cell center, rounded to 2 decimal places.</summary>
        [Range(-180.0, 180.0, ErrorMessage = "Lng must be between -180 and 180 degrees.")]
        [JsonPropertyName("lng")]
        public double Lng { get; set; }

        /// <summary>Identifier of the study region this cell belongs to.</summary>
        [Required(ErrorMessage = "RegionId is required.")]
        [StringLength(100, MinimumLength = 1, ErrorMessage = "RegionId must be between 1 and 100 characters.")]
        [JsonPropertyName("regionId")]
        public string RegionId { get; set; } = string.Empty;

        /// <summary>Vegetation fire detections reported by MODIS for that year (pre-harmonization).</summary>
        [Range(0, int.MaxValue, ErrorMessage = "Legacy detections cannot be negative.")]
        [JsonPropertyName("legacy")]
        public int Legacy { get; set; }

        /// <summary>Fire detections for that year after harmonization.</summary>
        [Range(0, int.MaxValue, ErrorMessage = "Harmonized detections cannot be negative.")]
        [JsonPropertyName("harmonized")]
        public int Harmonized { get; set; }

        /// <summary>Likelihood (0-1) that fire activity in this cell is human-driven.</summary>
        [Range(0.0, 1.0, ErrorMessage = "Human likelihood must be between 0 and 1.")]
        [JsonPropertyName("human")]
        public double Human { get; set; }
    }
}
