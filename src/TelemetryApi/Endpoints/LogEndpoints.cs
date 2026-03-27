using Microsoft.AspNetCore.Mvc;

namespace TelemetryApi.Endpoints;

/// <summary>
/// Endpoints for viewing application logs for debugging and monitoring.
/// SRE: Provides real-time log access without SSH/terminal access.
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

    private static IResult GetMetroLogs([FromQuery] int lines = 100)
    {
        return GetLogFile("metro.log", lines);
    }

    private static IResult GetFlightLogs([FromQuery] int lines = 100)
    {
        return GetLogFile("flight.log", lines);
    }

    private static IResult GetApiLogs([FromQuery] int lines = 100)
    {
        return GetLogFile("api.log", lines);
    }

    private static IResult GetDashboardLogs([FromQuery] int lines = 100)
    {
        return GetLogFile("dashboard.log", lines);
    }

    private static IResult GetLogFile(string filename, int lines)
    {
        try
        {
            // Navigate up from TelemetryApi to project root
            var projectRoot = Path.GetFullPath(Path.Combine(
                Directory.GetCurrentDirectory(), "..", ".."));
            var logPath = Path.Combine(projectRoot, ".logs", filename);

            if (!File.Exists(logPath))
            {
                return Results.Ok(new
                {
                    filename,
                    lines = new[] { $"Log file not found: {logPath}" },
                    count = 0
                });
            }

            var allLines = File.ReadAllLines(logPath);
            var recentLines = allLines.TakeLast(lines).ToArray();

            return Results.Ok(new
            {
                filename,
                lines = recentLines,
                count = recentLines.Length,
                totalLines = allLines.Length
            });
        }
        catch (Exception ex)
        {
            return Results.Problem(
                detail: ex.Message,
                title: "Failed to read log file");
        }
    }
}
