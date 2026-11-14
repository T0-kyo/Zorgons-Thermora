using Microsoft.Extensions.Options;
using System.Data.Common;
using DuckDB.NET.Data;
using api.Config;


namespace api.Services;

public class DuckDbService : IDuckDbService
{
    private readonly string _baseUrl;
    
    private static bool _isHttpfsInstalled = false;
    private static readonly object _lock = new();

    public DuckDbService(IOptions<DataSettings> options)
    {
        _baseUrl = options.Value.BaseUrl;
    }

    public DbConnection CreateConnection()
    {
        var connection = new DuckDBConnection("DataSource=:memory:");
        connection.Open();

        using var cmd = connection.CreateCommand();
        
        lock (_lock)
        {
            if (!_isHttpfsInstalled)
            {
                cmd.CommandText = "INSTALL httpfs;";
                cmd.ExecuteNonQuery();
                _isHttpfsInstalled = true;
            }
        }

        cmd.CommandText = @"
            LOAD httpfs;
            SET memory_limit = '400MB';
            SET http_timeout = 120;
        ";
        cmd.ExecuteNonQuery();

        return connection;
    }

    public string GetBaseUrl() => _baseUrl;
}