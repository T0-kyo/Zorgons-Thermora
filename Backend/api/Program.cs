using api.Repositories;
using api.Middleware;
using api.Services;
using api.Config;
using Serilog;


var builder = WebApplication.CreateBuilder(args);



builder.Services.Configure<DataSettings>(
    builder.Configuration.GetSection(DataSettings.SectionName));

builder.Services.AddSingleton<IDuckDbService, DuckDbService>();
builder.Services.AddScoped<IDataRepository, DuckDbRepository>();

Log.Logger = new LoggerConfiguration()
    .ReadFrom.Configuration(builder.Configuration)
    .Enrich.FromLogContext()
    .CreateLogger();
    
builder.Host.UseSerilog();

builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddProblemDetails();

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddCors(o => o.AddDefaultPolicy(p => p
    .AllowAnyOrigin()
    .AllowAnyHeader()
    .AllowAnyMethod()));

builder.Services.AddControllers();


var app = builder.Build();



app.MapControllers();

app.UseExceptionHandler();
app.UseSerilogRequestLogging();

app.UseSwagger();
app.UseSwaggerUI();

app.UseCors();

app.MapGet("/health", () => Results.Ok(new { status = "Healthy" }));



app.Run();