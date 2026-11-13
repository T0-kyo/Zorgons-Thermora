using System.Net;


namespace api.Exceptions;

public class BaseException : Exception
{
    public HttpStatusCode StatusCode { get; init; }

    public BaseException(string message, HttpStatusCode statusCode = HttpStatusCode.InternalServerError) : base(message)
    {
        StatusCode = statusCode;
    }
}