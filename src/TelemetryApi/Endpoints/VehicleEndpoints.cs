using TelemetryApi.Data;
using TelemetryApi.Models;

namespace TelemetryApi.Endpoints;

/// <summary>
/// Vehicle position endpoints — the primary data API consumed by the dashboard.
/// All endpoints return JSON and are read-only (GET only).
/// </summary>
public static class VehicleEndpoints
{
    public static void MapVehicleEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/vehicles")
                       .WithTags("Vehicles")
                       .WithOpenApi();

        group.MapGet("/current", GetCurrentVehicles)
             .WithName("GetCurrentVehicles")
             .WithSummary("Returns the latest position per vehicle within the last 5 minutes.");

        group.MapGet("/history", GetVehicleHistory)
             .WithName("GetVehicleHistory")
             .WithSummary("Returns position history for a single vehicle.");

        group.MapGet("/paths", GetBatchPaths)
             .WithName("GetBatchPaths")
             .WithSummary("Returns recent position trails for all active vehicles of a given source.");
    }

    /// <summary>
    /// GET /api/vehicles/current?source=metro|flight
    ///
    /// Returns the single most recent position per unique vehicle_id within
    /// the last 5 minutes. Optional ?source= filter limits to one feed.
    ///
    /// SRE: The 5-minute freshness window is a conscious product decision.
    /// If we returned all vehicles ever seen, a bus that left service 3 hours
    /// ago would still appear on the map. The window keeps the map current
    /// and matches the expected poll cadence (metro=30s, flight=60s).
    /// </summary>
    private static async Task<IResult> GetCurrentVehicles(
        VehicleRepository repo,
        string? source = null)
    {
        // Validate the source filter early to return a clear error
        if (source is not null &&
            !source.Equals("metro", StringComparison.OrdinalIgnoreCase) &&
            !source.Equals("flight", StringComparison.OrdinalIgnoreCase))
        {
            return Results.BadRequest(new
            {
                error   = "Invalid source parameter.",
                allowed = new[] { "metro", "flight" }
            });
        }

        var vehicles = await repo.GetCurrentVehiclesAsync(source?.ToLowerInvariant());
        return Results.Ok(vehicles);
    }

    /// <summary>
    /// GET /api/vehicles/history?vehicleId=BUS-1842&hours=1
    ///
    /// Returns position history for a single vehicle. Hours is capped at 6
    /// server-side (see VehicleRepository.GetVehicleHistoryAsync).
    ///
    /// SRE: We require vehicleId — this endpoint is not designed for bulk
    /// history export. Bulk export should go through a dedicated ETL path
    /// with throttling; exposing it here would risk DoS via large SQL scans.
    /// </summary>
    private static async Task<IResult> GetVehicleHistory(
        VehicleRepository repo,
        string? vehicleId = null,
        int hours = 1)
    {
        if (string.IsNullOrWhiteSpace(vehicleId))
        {
            return Results.BadRequest(new { error = "vehicleId query parameter is required." });
        }

        if (hours < 1 || hours > 24)
        {
            return Results.BadRequest(new { error = "hours must be between 1 and 24. Values > 6 will be capped at 6." });
        }

        var history = await repo.GetVehicleHistoryAsync(vehicleId, hours);
        return Results.Ok(history);
    }

    /// <summary>
    /// GET /api/vehicles/paths?source=flight&amp;minutes=20
    ///
    /// Returns position trails for every active vehicle of the given source
    /// grouped by vehicleId. The dashboard calls this once on load to seed
    /// trail history without N per-vehicle round trips.
    ///
    /// Response shape: [{ vehicleId, points: [{latitude, longitude, ingestedAt}] }]
    ///
    /// SRE: Single SQL scan for all paths vs. N separate queries per aircraft.
    /// At 20 flights × 40 points = 800 rows, this is negligible SQL load.
    /// </summary>
    private static async Task<IResult> GetBatchPaths(
        VehicleRepository repo,
        string? source = "flight",
        int minutes = 20)
    {
        if (source is not null &&
            !source.Equals("metro", StringComparison.OrdinalIgnoreCase) &&
            !source.Equals("flight", StringComparison.OrdinalIgnoreCase))
        {
            return Results.BadRequest(new { error = "source must be 'metro' or 'flight'." });
        }

        if (minutes < 1 || minutes > 120)
        {
            return Results.BadRequest(new { error = "minutes must be between 1 and 120." });
        }

        var raw = await repo.GetBatchPathsAsync(source!.ToLowerInvariant(), minutes);

        var grouped = raw
            .GroupBy(r => r.VehicleId)
            .Select(g => new
            {
                vehicleId = g.Key,
                points    = g.Select(r => r.Point).ToList(),
            });

        return Results.Ok(grouped);
    }
}
