using Azure.Identity;
using TelemetryApi.Data;
using TelemetryApi.Endpoints;
using TelemetryApi.Services;

// =============================================================================
// azure-telemetry-platform — TelemetryApi
// .NET 8 Minimal API hosted on Azure App Service
//
// SRE: Minimal API was chosen over full MVC for this project because:
//   1. The surface area is small (4 endpoints) — MVC scaffolding adds ceremony
//      without value at this scale.
//   2. Minimal API routes are explicit and co-located — easier to audit.
//   3. Startup time is faster, which matters for cold starts on B1 tier.
// =============================================================================

var builder = WebApplication.CreateBuilder(args);

// ---------------------------------------------------------------------------
// Key Vault configuration (Azure only — skipped locally via environment check)
//
// SRE: We use DefaultAzureCredential which chains through multiple auth methods:
//   Azure = System-assigned Managed Identity (zero credential management)
//   Local = Azure CLI login or VS/Rider interactive auth
// The Key Vault name is the only non-secret config value needed at startup.
// All secrets (connection string, feed URLs, App Insights key) are pulled
// from Key Vault, never from environment variables or config files.
// ---------------------------------------------------------------------------
var keyVaultName = builder.Configuration["KeyVaultName"];
if (!string.IsNullOrEmpty(keyVaultName))
{
    builder.Configuration.AddAzureKeyVault(
        new Uri($"https://{keyVaultName}.vault.azure.net/"),
        new DefaultAzureCredential()
    );
}

// ---------------------------------------------------------------------------
// Application Insights
//
// SRE: We use the connection string (not the legacy instrumentation key)
// because it includes the ingestion endpoint, enabling private link scenarios
// and supporting future sovereign cloud deployments without code changes.
// ---------------------------------------------------------------------------
builder.Services.AddApplicationInsightsTelemetry(options =>
{
    options.ConnectionString = builder.Configuration["APPINSIGHTS_CONNECTION_STRING"];
});

// ---------------------------------------------------------------------------
// Data layer
// ---------------------------------------------------------------------------
builder.Services.AddSingleton<DbConnectionFactory>();
builder.Services.AddScoped<VehicleRepository>();

// ---------------------------------------------------------------------------
// GTFS static route shapes
//
// SRE: GtfsStaticService is a singleton because it caches the parsed route
// data in IMemoryCache with a 24h TTL. The HttpClient used for downloading
// the GTFS ZIP is registered via IHttpClientFactory (proper lifetime/pooling).
// ---------------------------------------------------------------------------
builder.Services.AddMemoryCache();
builder.Services.AddHttpClient("GtfsStatic", client =>
{
    client.Timeout = TimeSpan.FromSeconds(120);
    client.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");
    client.DefaultRequestHeaders.Add("Accept", "application/zip,application/octet-stream,*/*");
});
builder.Services.AddSingleton<GtfsStaticService>();

// ---------------------------------------------------------------------------
// CORS
//
// SRE: CORS is configured per-environment. In production the allowed origin
// is the Static Web App hostname set in config. In development, localhost:5173
// (Vite dev server default) is used. We do NOT use AllowAnyOrigin() in
// production — that would allow any site to call this API with user credentials.
// ---------------------------------------------------------------------------
var allowedOrigins = builder.Configuration.GetSection("AllowedOrigins").Get<string[]>()
    ?? new[] { "http://localhost:5173" };

builder.Services.AddCors(options =>
{
    options.AddPolicy("Dashboard", policy =>
        policy.WithOrigins(allowedOrigins)
              .AllowAnyMethod()
              .AllowAnyHeader());
});

// ---------------------------------------------------------------------------
// Health checks (.NET built-in)
//
// SRE: We register both the ASP.NET health check (for App Service probes)
// and our custom /api/health endpoint (for SRE observability).
// The built-in /healthz is used by App Service load balancer to determine
// if the instance should receive traffic. Our /api/health adds business-level
// context (per-source status) that the load balancer doesn't need but the
// on-call engineer does.
// ---------------------------------------------------------------------------
builder.Services.AddHealthChecks();

// ---------------------------------------------------------------------------
// OpenAPI / Swagger (development only)
// ---------------------------------------------------------------------------
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("Dashboard");
// app.UseHttpsRedirection(); // Disabled for local development

// Built-in health probe for App Service load balancer
app.MapHealthChecks("/healthz");

// Application endpoints
app.MapVehicleEndpoints();
app.MapHealthEndpoints();
app.MapRouteEndpoints();
app.MapLogEndpoints();
app.MapManagementEndpoints();

app.Run();

// Partial class declaration enables xUnit integration testing with WebApplicationFactory
public partial class Program { }
