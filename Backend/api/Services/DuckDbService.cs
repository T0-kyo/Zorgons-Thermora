using Microsoft.Extensions.Options;
using DuckDB.NET.Data;
using System.Data;
using api.Config;


namespace api.Services;

public class DuckDbService : IDuckDbService
{
    private readonly string _baseUrl;

    public DuckDbService(IOptions<DataSettings> options)
    {
        _baseUrl = options.Value.HuggingFaceBaseUrl;
    }

    public IDbConnection CreateConnection()
    {
        var connection = new DuckDBConnection("DataSource=:memory:");
        connection.Open();

        using var cmd = connection.CreateCommand();
        cmd.CommandText = "INSTALL httpfs; LOAD httpfs;";
        cmd.ExecuteNonQuery();

        return connection;
    }

    public string GetBaseUrl() => _baseUrl;
}