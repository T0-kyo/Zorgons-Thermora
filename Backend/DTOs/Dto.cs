namespace GtoApi.DTOs
{
    public class GtoDto
    {
        public string SatelliteName { get; set; } = string.Empty;
        public double Latitude { get; set; }
        public double Longitude { get; set; }
        public DateTime OverpassTime { get; set; }
    }
}