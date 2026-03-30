using Azure.Core;
using Azure.Identity;
using Azure.ResourceManager;
using Azure.ResourceManager.AppService;
using Microsoft.AspNetCore.Mvc;

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
    }

    private static async Task<IResult> GetFunctionStatus([FromServices] IConfiguration config)
    {
        var app = await GetFunctionAppResource(config);
        if (app == null) return Results.NotFound("Function App resource could not be located via ARM.");

        return Results.Ok(new { state = app.Data.State });
    }

    private static async Task<IResult> GetOpenSkyStatus(
        [FromServices] IConfiguration config, 
        [FromServices] IHttpClientFactory httpClientFactory,
        [FromServices] VehicleRepository repo)
    {
        // SRE: First, check if the ingestion service has recently reported a 429.
        // If the circuit breaker is active in the database, we report that 
        // immediately rather than making a fresh request that might fail or 
        // make the problem worse.
        var status = (await repo.GetSystemStatusAsync("flight")).ToList();
        var circuitBreaker = status.FirstOrDefault(s => s.Key == "circuit_breaker_active");
        var lastRateLimit = status.FirstOrDefault(s => s.Key == "rate_limit_remaining");

        if (circuitBreaker.Value == "true")
        {
            return Results.Ok(new 
            {
                statusCode = 429,
                isUp = false,
                rateLimitRemaining = "0",
                rateLimitLimit = !string.IsNullOrEmpty(config["OPENSKY_CLIENT_ID"]) ? "4000" : "400",
                error = "OpenSky rate limit exceeded. Circuit breaker active in ingestion service.",
                authenticated = !string.IsNullOrEmpty(config["OPENSKY_CLIENT_ID"])
            });
        }

        var clientId = config["OPENSKY_CLIENT_ID"];
        var clientSecret = config["OPENSKY_CLIENT_SECRET"];
        
        var client = httpClientFactory.CreateClient("OpenSky");
        // SRE: Limit timeout for interactive dashboard queries
        client.Timeout = TimeSpan.FromSeconds(10);
        
        if (!string.IsNullOrEmpty(clientId) && !string.IsNullOrEmpty(clientSecret))
        {
            var authBytes = System.Text.Encoding.ASCII.GetBytes($"{clientId}:{clientSecret}");
            var authHeader = Convert.ToBase64String(authBytes);
            client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Basic", authHeader);
        }

        try
        {
            // Empty bounding box to minimize data transfer while still hitting the active endpoint
            var url = "https://opensky-network.org/api/states/all?lamin=0&lomin=0&lamax=0&lomax=0";
            var response = await client.GetAsync(url);
            
            var remaining = response.Headers.TryGetValues("X-Rate-Limit-Remaining", out var rVals) ? rVals.FirstOrDefault() : null;
            var limit = response.Headers.TryGetValues("X-Rate-Limit-Limit", out var lVals) ? lVals.FirstOrDefault() : null;
            var retryAfter = response.Headers.TryGetValues("X-Rate-Limit-Retry-After-Seconds", out var raVals) ? raVals.FirstOrDefault() : null;

            // SRE: OpenSky often omits the total limit header. Fallback based on auth status.
            if (string.IsNullOrEmpty(limit))
            {
                limit = !string.IsNullOrEmpty(clientId) ? "4000" : "400";
            }

            return Results.Ok(new 
            {
                statusCode = (int)response.StatusCode,
                isUp = response.IsSuccessStatusCode,
                rateLimitRemaining = remaining,
                rateLimitLimit = limit,
                retryAfterSeconds = retryAfter,
                authenticated = !string.IsNullOrEmpty(clientId)
            });
        }
        catch (Exception ex)
        {
            return Results.Ok(new 
            {
                statusCode = 500,
                isUp = false,
                error = ex.Message
            });
        }
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
}
