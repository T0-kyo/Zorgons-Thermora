using System.Net;

namespace api.Exceptions;

public class BadRequestException : BaseException
{
    public BadRequestException(string message) : base(message, HttpStatusCode.BadRequest) { }
}