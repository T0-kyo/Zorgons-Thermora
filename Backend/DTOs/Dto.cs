using System.ComponentModel.DataAnnotations;

namespace Backend.DTOs
{
    public class SatelliteDto
    {
        [Required(ErrorMessage = "Satellite name is required")]
        [StringLength(100, ErrorMessage = "Satellite name cannot exceed 100 characters")]
        public string SatelliteName { get; set; } = string.Empty;

        [Required(ErrorMessage = "Latitude is required")]
        public double Latitude { get; set; }

        [Required(ErrorMessage = "Longitude is required")]
        public double Longitude { get; set; }

        [Required(ErrorMessage = "Overpass time is required")]
        public DateTime OverpassTime { get; set; }
    }
}
