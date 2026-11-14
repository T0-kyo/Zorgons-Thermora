using Microsoft.Extensions.Options;
using DuckDB.NET.Data;
using System.Data.Common;
using api.Config;


namespace api.Services;

public class DuckDbService : IDuckDbService
{
    private readonly string _engineerUrl;
    private readonly string _scientistUrl;


    public DuckDbService(IOptions<DataSettings> options)
    {
        _engineerUrl = options.Value.EngineerUrl;
        _scientistUrl = options.Value.ScientistUrl;
    }

    public DbConnection CreateConnection()
    {
        var connection = new DuckDBConnection("DataSource=:memory:");
        connection.Open();

        using var cmd = connection.CreateCommand();
        cmd.CommandText = "INSTALL httpfs; LOAD httpfs;";
        cmd.ExecuteNonQuery();

        return connection;
    }

    public string GetEngineerUrl() => _engineerUrl;
    public string GetScientistUrl() => _scientistUrl;
}