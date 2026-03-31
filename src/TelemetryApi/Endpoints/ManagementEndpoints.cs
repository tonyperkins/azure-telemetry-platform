using Azure.Core;
using Azure.Identity;
using Azure.ResourceManager;
using Azure.ResourceManager.AppService;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using TelemetryApi.Data;
using TelemetryApi.Models;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;

namespace TelemetryApi.Endpoints;

public static class ManagementEndpoints
{
    public static void MapManagementEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup("/api/manage");

        group.MapGet("/status", GetFunctionStatus)
            .WithName("GetFunctionStatus")
            .WithDescription("Get the current execution state of the Azure Telemetry Function App.");

        group.MapPost("/stop", StopFunctionApp)
            .WithName("StopFunctionApp")
            .WithDescription("Suspends the Azure Telemetry Function App.");

        group.MapPost("/start", StartFunctionApp)
            .WithName("StartFunctionApp")
            .WithDescription("Resumes the Azure Telemetry Function App.");

        group.MapGet("/opensky-status", GetOpenSkyStatus)
            .WithName("GetOpenSkyStatus")
            .WithDescription("Queries OpenSky to retrieve current API rate limits and status.");

        group.MapPost("/heartbeat", PostHeartbeat)
            .WithName("PostHeartbeat")
            .WithDescription("Updates the last-active timestamp for the dashboard to enable on-demand ingestion.");
    }

    private static async Task<IResult> GetFunctionStatus([FromServices] IConfiguration config)
    {
        var app = await GetFunctionAppResource(config);
        if (app == null) return Results.NotFound("Function App resource could not be located via ARM.");

        return Results.Ok(new { state = app.Data.State });
    }

    private static (OpenSkyStatusResponse? data, DateTime? timestamp) _openSkyCache;
    private static readonly TimeSpan CacheDuration = TimeSpan.FromSeconds(30);

    private static async Task<IResult> GetOpenSkyStatus(
        [FromServices] IConfiguration config, 
        [FromServices] IHttpClientFactory httpClientFactory,
        [FromServices] VehicleRepository repo)
    {
        // SRE: Cache check to prevent dashboard polling from draining credits.
        if (_openSkyCache.data != null && _openSkyCache.timestamp.HasValue && 
            (DateTime.UtcNow - _openSkyCache.timestamp.Value) < CacheDuration)
        {
            return Results.Ok(_openSkyCache.data);
        }

        // SRE: First, check if the ingestion service has recently reported a 429.
        var statusList = (await repo.GetSystemStatusAsync("flight")).ToList();
        var circuitBreaker = statusList.FirstOrDefault(s => s.Key == "circuit_breaker_active");
        
        if (circuitBreaker.Value == "true")
        {
            var cbResponse = new OpenSkyStatusResponse
            {
                statusCode = 429,
                isUp = false,
                rateLimitRemaining = "0",
                rateLimitLimit = !string.IsNullOrEmpty(config["OPENSKY_CLIENT_ID"]) ? "4000" : "400",
                error = "OpenSky rate limit exceeded. Circuit breaker active in ingestion service.",
                authenticated = !string.IsNullOrEmpty(config["OPENSKY_CLIENT_ID"])
            };
            return Results.Ok(cbResponse);
        }

        var clientId = config["OPENSKY_CLIENT_ID"];
        var clientSecret = config["OPENSKY_CLIENT_SECRET"];
        
        var client = httpClientFactory.CreateClient("OpenSky");
        client.Timeout = TimeSpan.FromSeconds(10);
        
        if (!string.IsNullOrEmpty(clientId) && !string.IsNullOrEmpty(clientSecret))
        {
            var token = await GetOpenSkyTokenAsync(httpClientFactory, clientId, clientSecret);
            if (!string.IsNullOrEmpty(token))
            {
                client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
            }
        }

        try
        {
            var bboxConfig = config["OPENSKY_BBOX"] ?? "29.8,-98.2,30.8,-97.2";
            var parts = bboxConfig.Split(',');
            var url = "https://opensky-network.org/api/states/all";

            if (parts.Length == 4)
            {
                url += $"?lamin={parts[0].Trim()}&lomin={parts[1].Trim()}&lamax={parts[2].Trim()}&lomax={parts[3].Trim()}";
            }
            else
            {
                // Fallback to Austin if config is malformed
                url += "?lamin=29.8&lomin=-98.2&lamax=30.8&lomax=-97.2";
            }

            var response = await client.GetAsync(url);
            
            var remaining = response.Headers.TryGetValues("X-Rate-Limit-Remaining", out var rVals) ? rVals.FirstOrDefault() : null;
            var limit = response.Headers.TryGetValues("X-Rate-Limit-Limit", out var lVals) ? lVals.FirstOrDefault() : null;
            var retryAfter = response.Headers.TryGetValues("X-Rate-Limit-Retry-After-Seconds", out var raVals) ? raVals.FirstOrDefault() : null;

            if (string.IsNullOrEmpty(limit))
            {
                limit = !string.IsNullOrEmpty(clientId) ? "4000" : "400";
            }

            var result = new OpenSkyStatusResponse
            {
                statusCode = (int)response.StatusCode,
                isUp = response.IsSuccessStatusCode,
                rateLimitRemaining = remaining,
                rateLimitLimit = limit,
                retryAfterSeconds = retryAfter,
                authenticated = !string.IsNullOrEmpty(clientId)
            };

            // Update cache
            _openSkyCache = (result, DateTime.UtcNow);

            return Results.Ok(result);
        }
        catch (Exception ex)
        {
            return Results.Json(new { error = ex.Message, isUp = false }, statusCode: 500);
        }
    }

    private static async Task<IResult> PostHeartbeat(
        HttpContext context,
        [FromServices] IConfiguration config,
        [FromServices] IHttpClientFactory httpClientFactory,
        [FromServices] VehicleRepository repo)
    {
        // SRE: Identify user IP. Static Web Apps/App Service pass this in X-Forwarded-For.
        var ip = context.Request.Headers["X-Forwarded-For"].FirstOrDefault() 
                 ?? context.Connection.RemoteIpAddress?.ToString() 
                 ?? "unknown";

        // Check the old timestamp first to see if we need an 'Instant Start'
        var (_, lastActiveTime) = await repo.GetStatusAsync("dashboard", "last_active");
        var isWakingUp = !lastActiveTime.HasValue || (DateTime.UtcNow - lastActiveTime.Value) > TimeSpan.FromMinutes(5);

        // Update dashboard status to signal ingestion functions.
        var statusValue = $"active|{ip}";
        await repo.UpdateStatusAsync("dashboard", "last_active", statusValue);

        // SRE: Instant Start Logic.
        // If the ingestion was idle, we trigger it immediately via HTTP rather than waiting for the Timer.
        if (isWakingUp)
        {
            var functionBaseUrl = config["FLIGHT_INGESTION_URL"]; // e.g. https://func-telemetry-prod.azurewebsites.net
            var functionKey = config["FLIGHT_INGESTION_KEY"];
            
            if (!string.IsNullOrEmpty(functionBaseUrl))
            {
                var client = httpClientFactory.CreateClient();
                var triggerUrl = $"{functionBaseUrl.TrimEnd('/')}/api/ingest/flight";
                if (!string.IsNullOrEmpty(functionKey))
                {
                    triggerUrl += $"?code={functionKey}";
                }
                
                // Fire and forget (don't block the heartbeat response)
                _ = client.PostAsync(triggerUrl, null);
            }
        }

        return Results.NoContent();
    }

    // SRE: Helper model for caching and consistency
    private class OpenSkyStatusResponse
    {
        public int statusCode { get; set; }
        public bool isUp { get; set; }
        public string? rateLimitRemaining { get; set; }
        public string? rateLimitLimit { get; set; }
        public string? retryAfterSeconds { get; set; }
        public string? error { get; set; }
        public bool authenticated { get; set; }
    }

    private static async Task<IResult> StopFunctionApp(HttpRequest request, [FromServices] IConfiguration config)
    {
        var authHeader = request.Headers["Authorization"].FirstOrDefault();
        var token = authHeader?.StartsWith("Bearer ") == true ? authHeader.Substring(7).Trim() : authHeader;

        if (string.IsNullOrEmpty(token) || !ValidateToken(token, config)) return Results.Unauthorized();

        var app = await GetFunctionAppResource(config);
        if (app == null) return Results.NotFound("Function App resource could not be located via ARM.");

        if (app.Data.State == "Stopped") return Results.Ok(new { state = "Stopped" });

        await app.StopAsync();
        return Results.Ok(new { state = "Stopped" });
    }

    private static async Task<IResult> StartFunctionApp(HttpRequest request, [FromServices] IConfiguration config)
    {
        var authHeader = request.Headers["Authorization"].FirstOrDefault();
        var token = authHeader?.StartsWith("Bearer ") == true ? authHeader.Substring(7).Trim() : authHeader;

        if (string.IsNullOrEmpty(token) || !ValidateToken(token, config)) return Results.Unauthorized();

        var app = await GetFunctionAppResource(config);
        if (app == null) return Results.NotFound("Function App resource could not be located via ARM.");

        if (app.Data.State == "Running") return Results.Ok(new { state = "Running" });

        await app.StartAsync();
        return Results.Ok(new { state = "Running" });
    }

    private static bool ValidateToken(string providedToken, IConfiguration config)
    {
        var masterToken = config["MANAGEMENT_ADMIN_TOKEN"];
        if (string.IsNullOrEmpty(masterToken))
        {
            // Failsafe: if no token is configured in environment, reject all requests.
            return false;
        }
        return providedToken == masterToken;
    }

    private static async Task<WebSiteResource?> GetFunctionAppResource(IConfiguration config)
    {
        var subId = config["AZURE_SUBSCRIPTION_ID"];
        var rgName = config["AZURE_RESOURCE_GROUP"];
        var appName = config["AZURE_FUNCTION_APP_NAME"];

        if (string.IsNullOrEmpty(subId) || string.IsNullOrEmpty(rgName) || string.IsNullOrEmpty(appName))
        {
            throw new InvalidOperationException("Missing AZURE_SUBSCRIPTION_ID, AZURE_RESOURCE_GROUP, or AZURE_FUNCTION_APP_NAME in configuration.");
        }

        var client = new ArmClient(new DefaultAzureCredential());
        var resourceId = WebSiteResource.CreateResourceIdentifier(subId, rgName, appName);
        var response = await client.GetWebSiteResource(resourceId).GetAsync();

        return response.Value;
    }

    private static string? _cachedToken;
    private static DateTime _tokenExpiry = DateTime.MinValue;

    private static async Task<string?> GetOpenSkyTokenAsync(IHttpClientFactory httpClientFactory, string clientId, string clientSecret)
    {
        if (!string.IsNullOrEmpty(_cachedToken) && DateTime.UtcNow < _tokenExpiry)
        {
            return _cachedToken;
        }

        const string authUrl = "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";
        var client = httpClientFactory.CreateClient();
        
        var dict = new Dictionary<string, string>
        {
            { "grant_type", "client_credentials" },
            { "client_id", clientId },
            { "client_secret", clientSecret }
        };

        var response = await client.PostAsync(authUrl, new FormUrlEncodedContent(dict));
        if (response.IsSuccessStatusCode)
        {
            var json = await response.Content.ReadAsStringAsync();
            using var doc = System.Text.Json.JsonDocument.Parse(json);
            if (doc.RootElement.TryGetProperty("access_token", out var tokenProp))
            {
                _cachedToken = tokenProp.GetString();
                int expiresIn = doc.RootElement.TryGetProperty("expires_in", out var expProp) ? expProp.GetInt32() : 1800;
                _tokenExpiry = DateTime.UtcNow.AddSeconds(expiresIn - 60); // 1-minute buffer
                return _cachedToken;
            }
        }

        return null;
    }
}
