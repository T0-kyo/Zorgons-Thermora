using System.Net;

namespace api.Exceptions;

public class NotFoundException : BaseException
{
    public NotFoundException(string message) : base(message, HttpStatusCode.NotFound) { }
}