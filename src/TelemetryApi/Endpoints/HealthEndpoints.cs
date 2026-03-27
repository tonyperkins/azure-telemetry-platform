using TelemetryApi.Data;
using TelemetryApi.Models;

namespace TelemetryApi.Endpoints;

/// <summary>
/// Health and metrics endpoints — used by monitoring dashboards and alert rules.
///
/// SRE: /api/health is the canonical signal for operational status.
/// Alert rules in Application Insights query this endpoint rather than
/// inferring health from exception rates. This separates "the app is up"
/// from "the app is doing useful work" — a critical SRE distinction.
/// A Function can run successfully (no exceptions) but return 0 vehicles
/// because the upstream feed is down. Only /api/health catches that.
/// </summary>
public static class HealthEndpoints
{
    // Freshness thresholds — keep in sync with alert rule evaluation periods
    private static readonly TimeSpan HealthyThreshold  = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan DegradedThreshold = TimeSpan.FromMinutes(15);

    public static void MapHealthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api")
                       .WithTags("Health")
                       .WithOpenApi();

        group.MapGet("/health",  GetHealth)
             .WithName("GetHealth")
             .WithSummary("Returns per-source and aggregate health status.");

        group.MapGet("/metrics", GetMetrics)
             .WithName("GetMetrics")
             .WithSummary("Returns operational counters for the observability dashboard.");
    }

    /// <summary>
    /// GET /api/health
    ///
    /// Returns structured health status per source. The response shape is
    /// intentionally stable — upstream consumers (Grafana, PagerDuty, etc.)
    /// can parse this without versioning concerns.
    ///
    /// Status levels:
    ///   healthy   — data received in last 5 minutes
    ///   degraded  — data received 5-15 minutes ago
    ///   unhealthy — no data in last 15 minutes, or 0 vehicles reported
    ///
    /// Overall aggregate:
    ///   healthy   — all sources healthy
    ///   degraded  — at least one source degraded or unhealthy
    ///   unhealthy — all sources unhealthy
    /// </summary>
    private static async Task<IResult> GetHealth(VehicleRepository repo)
    {
        var sourceRows = (await repo.GetSourceHealthAsync()).ToList();
        var now        = DateTime.UtcNow;

        var sources = new Dictionary<string, SourceHealth>();

        foreach (var knownSource in new[] { "metro", "flight" })
        {
            var row = sourceRows.FirstOrDefault(r => r.Source == knownSource);

            string status;
            if (row == default || row.LastIngest is null || row.Count == 0)
            {
                // SRE: A source with 0 vehicles is treated as unhealthy,
                // not just one that threw an exception. This is the
                // "alert on business outcomes, not technical failures" principle.
                status = "unhealthy";
            }
            else
            {
                var age = now - row.LastIngest.Value;
                status = age <= HealthyThreshold  ? "healthy"   :
                         age <= DegradedThreshold ? "degraded"  :
                                                    "unhealthy";
            }

            sources[knownSource] = new SourceHealth
            {
                Status       = status,
                LastIngest   = row == default ? null : row.LastIngest,
                VehicleCount = row == default ? 0    : row.Count
            };
        }

        // Aggregate: worst-case wins
        var overallStatus =
            sources.Values.All(s => s.Status == "healthy")   ? "healthy"   :
            sources.Values.All(s => s.Status == "unhealthy") ? "unhealthy" :
                                                                "degraded";

        var response = new HealthStatus
        {
            Status  = overallStatus,
            Sources = sources
        };

        // SRE: Return 200 even for degraded/unhealthy — the payload carries
        // the detailed status. Returning 503 would break load balancer health
        // probes and cause unnecessary traffic rerouting during a partial outage.
        return Results.Ok(response);
    }

    /// <summary>
    /// GET /api/metrics
    ///
    /// Returns operational counters. This endpoint is polled by the StatsBar
    /// component in the dashboard and can be scraped by external monitoring.
    /// </summary>
    private static async Task<IResult> GetMetrics(VehicleRepository repo)
    {
        var (metroCount, metroLast, metroPollsLast1h,
             flightCount, flightLast, flightPollsLast1h,
             recordsLast24h, oldestRecord) = await repo.GetMetricsAsync();

        var response = new MetricsResponse
        {
            Metro = new SourceMetrics
            {
                VehicleCount = metroCount,
                LastIngest   = metroLast,
                PollsLast1h  = metroPollsLast1h
            },
            Flight = new SourceMetrics
            {
                VehicleCount = flightCount,
                LastIngest   = flightLast,
                PollsLast1h  = flightPollsLast1h
            },
            Database = new DatabaseMetrics
            {
                RecordsLast24h = recordsLast24h,
                OldestRecord   = oldestRecord
            }
        };

        return Results.Ok(response);
    }
}
