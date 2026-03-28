using Azure.Identity;
using Azure.Monitor.Query;
using Microsoft.AspNetCore.Mvc;

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

    private static async Task<IResult> GetMetroLogs([FromQuery] int lines, [FromServices] IConfiguration config)
    {
        return await GetLogFile("metro.log", lines, config);
    }

    private static async Task<IResult> GetFlightLogs([FromQuery] int lines, [FromServices] IConfiguration config)
    {
        return await GetLogFile("flight.log", lines, config);
    }

    private static async Task<IResult> GetApiLogs([FromQuery] int lines, [FromServices] IConfiguration config)
    {
        return await GetLogFile("api.log", lines, config);
    }

    private static async Task<IResult> GetDashboardLogs([FromQuery] int lines, [FromServices] IConfiguration config)
    {
        return await GetLogFile("dashboard.log", lines, config);
    }

    private static async Task<IResult> GetLogFile(string filename, int lines, IConfiguration config)
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

            // Cloud Production: Azure Monitor Query
            var client = new LogsQueryClient(new DefaultAzureCredential());
            var query = filename switch
            {
                "metro.log" => "AppTraces | where AppRoleName startswith 'func-telemetry' | where Message has 'MetroIngestion' or Message has 'Bus' | order by TimeGenerated desc",
                "flight.log" => "AppTraces | where AppRoleName startswith 'func-telemetry' | where Message has 'FlightIngestion' or Message has 'Flight' | order by TimeGenerated desc",
                "api.log" => "AppTraces | where AppRoleName startswith 'app-telemetry' | order by TimeGenerated desc",
                _ => "AppTraces | order by TimeGenerated desc"
            };

            var options = new LogsQueryOptions { AllowPartialErrors = true };
            var response = await client.QueryWorkspaceAsync(workspaceId, query, new QueryTimeRange(TimeSpan.FromHours(24)), options);

            var resultLines = new List<string>();
            foreach (var row in response.Value.Table.Rows.Take(lines))
            {
                var timestamp = row.GetDateTimeOffset("TimeGenerated")?.ToString("yyyy-MM-dd HH:mm:ss.fffZ") ?? "UnknownTime";
                var message = row.GetString("Message");
                resultLines.Add($"[{timestamp}] {message}");
            }

            if (!resultLines.Any())
            {
                resultLines.Add("No logs found in Azure Monitor recently for this component.");
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
