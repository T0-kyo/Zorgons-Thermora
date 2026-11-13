using System.Net;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using api.Exceptions;


namespace api.Middleware;

public class GlobalExceptionHandler : IExceptionHandler
{
    private readonly ILogger<GlobalExceptionHandler> _logger;


    public GlobalExceptionHandler(ILogger<GlobalExceptionHandler> logger)
    {
        _logger = logger;
    }
    
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        var problemDetails = new ProblemDetails() { Instance = httpContext.Request.Path };
        httpContext.Response.ContentType = "application/problem+json";

        if (exception is BaseException e)
        {
            httpContext.Response.StatusCode = (int)e.StatusCode;
            problemDetails.Title = e.Message;
        }
        else
        {
            httpContext.Response.StatusCode = (int)HttpStatusCode.InternalServerError;
            problemDetails.Title = "Internal Server Error";
        }

        problemDetails.Status = httpContext.Response.StatusCode;
        
        if (httpContext.Response.StatusCode >= 500)
        {
            _logger.LogError(exception, "An exception occurred: {ExceptionType}", exception.GetType().Name);
        }
        else
        {
            _logger.LogWarning("Client error: {Message} - Path: {Path}", exception.Message, httpContext.Request.Path);
        }        
        
        await httpContext.Response.WriteAsJsonAsync(problemDetails, cancellationToken);
        
        return true;
    }
}