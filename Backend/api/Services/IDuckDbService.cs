using System.Data.Common;


namespace api.Services;

public interface IDuckDbService
{
    DbConnection CreateConnection();
    string GetBaseUrl();
}