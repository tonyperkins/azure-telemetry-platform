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
    }

    private static async Task<IResult> GetFunctionStatus([FromServices] IConfiguration config)
    {
        var app = await GetFunctionAppResource(config);
        if (app == null) return Results.NotFound("Function App resource could not be located via ARM.");

        return Results.Ok(new { state = app.Data.State });
    }

    private static async Task<IResult> StopFunctionApp([FromQuery] string token, [FromServices] IConfiguration config)
    {
        if (!ValidateToken(token, config)) return Results.Unauthorized();

        var app = await GetFunctionAppResource(config);
        if (app == null) return Results.NotFound("Function App resource could not be located via ARM.");

        if (app.Data.State == "Stopped") return Results.Ok(new { state = "Stopped" });

        await app.StopAsync();
        return Results.Ok(new { state = "Stopped" });
    }

    private static async Task<IResult> StartFunctionApp([FromQuery] string token, [FromServices] IConfiguration config)
    {
        if (!ValidateToken(token, config)) return Results.Unauthorized();

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
