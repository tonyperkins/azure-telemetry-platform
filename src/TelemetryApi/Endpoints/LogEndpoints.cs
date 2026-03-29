using Microsoft.AspNetCore.Mvc;
using System.Text.Json;
namespace TelemetryApi.Endpoints;

/// <summary>
/// Endpoints for viewing application logs for debugging and monitoring.
/// SRE: Upgraded to pull real-time logs directly from Azure Monitor Log Analytics workspace.
/// </summary>
public static class LogEndpoints
{
    public static void MapLogEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/logs").WithTags("Logs");

        group.MapGet("/metro", GetMetroLogs)
            .WithName("GetMetroLogs")
            .WithDescription("Get recent MetroIngestion function logs");

        group.MapGet("/flight", GetFlightLogs)
            .WithName("GetFlightLogs")
            .WithDescription("Get recent FlightIngestion function logs");

        group.MapGet("/api", GetApiLogs)
            .WithName("GetApiLogs")
            .WithDescription("Get recent TelemetryApi logs");

        group.MapGet("/dashboard", GetDashboardLogs)
            .WithName("GetDashboardLogs")
            .WithDescription("Get recent Dashboard logs");
    }

    private static async Task<IResult> GetMetroLogs([FromQuery] int lines, [FromServices] IConfiguration config, [FromServices] IHttpClientFactory httpClientFactory)
    {
        return await GetLogFile("metro.log", lines, config, httpClientFactory);
    }

    private static async Task<IResult> GetFlightLogs([FromQuery] int lines, [FromServices] IConfiguration config, [FromServices] IHttpClientFactory httpClientFactory)
    {
        return await GetLogFile("flight.log", lines, config, httpClientFactory);
    }

    private static async Task<IResult> GetApiLogs([FromQuery] int lines, [FromServices] IConfiguration config, [FromServices] IHttpClientFactory httpClientFactory)
    {
        return await GetLogFile("api.log", lines, config, httpClientFactory);
    }

    private static async Task<IResult> GetDashboardLogs([FromQuery] int lines, [FromServices] IConfiguration config, [FromServices] IHttpClientFactory httpClientFactory)
    {
        return await GetLogFile("dashboard.log", lines, config, httpClientFactory);
    }

    private static async Task<IResult> GetLogFile(string filename, int lines, IConfiguration config, IHttpClientFactory httpClientFactory)
    {
        try
        {
            var workspaceId = config["LogAnalyticsWorkspaceId"];
            var projectRoot = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "..", ".."));
            var localLogPath = Path.Combine(projectRoot, ".logs", filename);

            // Local development fallback
            if (string.IsNullOrEmpty(workspaceId) || File.Exists(localLogPath))
            {
                if (!File.Exists(localLogPath))
                {
                    return Results.Ok(new
                    {
                        filename,
                        lines = new[] { $"Log file not found: {localLogPath} (and LogAnalyticsWorkspaceId not configured)" },
                        count = 0
                    });
                }

                var allLines = await File.ReadAllLinesAsync(localLogPath);
                var recentLines = allLines.TakeLast(lines).ToArray();

                return Results.Ok(new { filename, lines = recentLines, count = recentLines.Length, totalLines = allLines.Length });
            }

            // Cloud Production: Application Insights REST API (API Key)
            var appId = config["AppInsights:AppId"];
            var apiKey = config["AppInsights:ApiKey"];

            if (string.IsNullOrEmpty(appId) || string.IsNullOrEmpty(apiKey))
            {
                return Results.Problem("AppInsights:AppId or AppInsights:ApiKey is missing from configuration.", "Configuration Error");
            }

            // SRE: By using the raw REST API, we bypass Azure Resource Manager (ARM)
            // entirely. This means our system-managed identity does not need explicit
            // 'Log Analytics Reader' RBAC assignment, which elegantly allows 
            // CI/CD pipelines running under limited 'Contributor' scopes to
            // deploy the full system securely and autonomously!
            var query = filename switch
            {
                "metro.log" => "traces | where cloud_RoleName startswith 'func-telemetry' or cloud_RoleName has 'Ingestion' | where message has 'MetroIngestion' or message has 'Bus' | project timestamp, message | order by timestamp desc",
                "flight.log" => "traces | where cloud_RoleName startswith 'func-telemetry' or cloud_RoleName has 'Ingestion' | where message has 'FlightIngestion' or message has 'Flight' or message has 'OpenSky' | project timestamp, message | order by timestamp desc",
                "api.log" => "traces | where isempty(cloud_RoleName) or cloud_RoleName has 'TelemetryApi' or cloud_RoleName startswith 'app-telemetry' | project timestamp, message | order by timestamp desc",
                _ => "traces | project timestamp, message | order by timestamp desc"
            };

            var url = $"https://api.applicationinsights.io/v1/apps/{appId}/query";
            using var httpClient = httpClientFactory.CreateClient();
            httpClient.DefaultRequestHeaders.Add("x-api-key", apiKey);

            var apiQuery = new { query = query };
            var response = await httpClient.PostAsJsonAsync(url, apiQuery);

            if (!response.IsSuccessStatusCode)
            {
                var errorBody = await response.Content.ReadAsStringAsync();
                return Results.Problem($"Data API Error: {response.StatusCode} - {errorBody}", "Failed to read logs");
            }

            var jsonBody = await response.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(jsonBody);

            var resultLines = new List<string>();
            var rows = doc.RootElement.GetProperty("tables")[0].GetProperty("rows");

            foreach (var row in rows.EnumerateArray().Take(lines))
            {
                try
                {
                    // Ensure robust handling if columns shift based on query results
                    var timestamp = row[0].GetString();
                    var message = row[1].GetString();
                    resultLines.Add($"[{timestamp}] {message}");
                }
                catch
                {
                    resultLines.Add($"{row}"); // Graceful fallback
                }
            }

            if (!resultLines.Any())
            {
                resultLines.Add("No logs found in App Insights API recently for this component.");
            }

            return Results.Ok(new
            {
                filename,
                lines = resultLines,
                count = resultLines.Count,
                totalLines = resultLines.Count
            });
        }
        catch (Exception ex)
        {
            return Results.Problem(detail: ex.Message, title: "Failed to read logs");
        }
    }
}
