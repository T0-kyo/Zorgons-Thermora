using api.Repositories;
using api.Middleware;
using api.Services;
using api.Config;
using Serilog;


var builder = WebApplication.CreateBuilder(args);



builder.Services.Configure<DataSettings>(
    builder.Configuration.GetSection(DataSettings.SectionName));

// one shared DuckDB database + a country list read from the dataset itself
builder.Services.AddSingleton<IDuckDbService, DuckDbService>();
builder.Services.AddSingleton<ICountryCatalog, CountryCatalog>();
builder.Services.AddSingleton<QueryCache>();
builder.Services.AddSingleton<CountryStatsStore>();
builder.Services.AddScoped<IDataRepository, DuckDbRepository>();
builder.Services.AddHostedService<WarmupService>();
builder.Services.AddHttpClient("dataset", c =>
{
    c.Timeout = TimeSpan.FromSeconds(30);
    c.DefaultRequestHeaders.UserAgent.ParseAdd("thermora-api/1.0");
    var token = builder.Configuration[$"{DataSettings.SectionName}:HfToken"];
    if (!string.IsNullOrWhiteSpace(token))
        c.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
});

// size-limited: every cached response counts as 1 entry
var cacheEntries = builder.Configuration.GetValue<int?>($"{DataSettings.SectionName}:CacheEntries") ?? 2000;
builder.Services.AddMemoryCache(o => o.SizeLimit = cacheEntries);

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



app.UseExceptionHandler();
app.UseSerilogRequestLogging();

app.UseSwagger();
app.UseSwaggerUI();
app.UseCors();

app.MapGet("/health", () => Results.Ok(new { status = "Healthy" }));
app.MapControllers();



app.Run();