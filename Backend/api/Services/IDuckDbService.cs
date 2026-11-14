using System.Data;


namespace api.Services;

public interface IDuckDbService
{
    IDbConnection CreateConnection();
    string GetEngineerUrl();
    string GetScientistUrl();
}