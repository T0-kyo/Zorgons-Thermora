namespace api.Config;

public class DataSettings
{
    public const string SectionName = "DataSettings";

    /// <summary>
    /// Root of the dataset: the Hugging Face "resolve" URL, or a local folder (handy for tests).
    /// Country files live under {BaseUrl}/countries/.
    /// </summary>
    public string BaseUrl { get; set; } = "";

    /// <summary>Trend file at the dataset root (science team).</summary>
    public string TrendFile { get; set; } = "Vegetation_Fire_Trend_Analysis_2018_2024.parquet";

    /// <summary>Optional Hugging Face token (raises rate limits). Set via env DataSettings__HfToken.</summary>
    public string? HfToken { get; set; }

    // ---- DuckDB ---------------------------------------------------------------------------------
    /// <summary>Memory DuckDB may use in total (one shared database for the whole app).</summary>
    public string MemoryLimit { get; set; } = "1GB";
    public int Threads { get; set; } = 4;
    /// <summary>Queries allowed to run at the same time; the rest wait their turn.</summary>
    public int MaxConcurrentQueries { get; set; } = 2;
    /// <summary>Where DuckDB may spill to disk instead of running out of memory.</summary>
    public string TempDirectory { get; set; } = "/tmp/duckdb_spill";
    /// <summary>Folder holding pre-downloaded DuckDB extensions (see Dockerfile).</summary>
    public string? ExtensionDirectory { get; set; }

    // ---- caching --------------------------------------------------------------------------------
    public int CacheMinutes { get; set; } = 30;
    /// <summary>Most cached responses kept at once (each response counts as 1).</summary>
    public int CacheEntries { get; set; } = 2000;
    /// <summary>How often the country list / file availability is re-read from the dataset.</summary>
    public int CatalogRefreshMinutes { get; set; } = 60;

    // ---- API shape ------------------------------------------------------------------------------
    /// <summary>Most globe cells returned by /api/cells.</summary>
    public int CellLimit { get; set; } = 3000;
    /// <summary>Every country keeps at least this many of its busiest cells inside CellLimit.</summary>
    public int CellsPerCountry { get; set; } = 40;
    /// <summary>
    /// /api/progress compares years observed by the same set of satellites: a baseline window
    /// starting here (MODIS + VIIRS S-NPP + NOAA-20 all fly from 2018) against the last
    /// complete years. Comparing 2000s (MODIS only) with today (MODIS + VIIRS) would mostly
    /// measure the arrival of VIIRS.
    /// </summary>
    public int ProgressBaselineStart { get; set; } = 2018;
    public int ProgressWindowYears { get; set; } = 3;
    /// <summary>Compute all-years stats for /api/countries in the background when the server is idle.</summary>
    public bool PrecomputeCountryStats { get; set; } = true;
}
