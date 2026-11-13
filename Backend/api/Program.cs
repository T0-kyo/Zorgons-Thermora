using api.Middleware;


var builder = WebApplication.CreateBuilder(args);



builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddProblemDetails(); 



var app = builder.Build();



app.UseExceptionHandler();


app.Run();
