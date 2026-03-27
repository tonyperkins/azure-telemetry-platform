namespace TelemetryApi.Models;

/// <summary>
/// Per-source and aggregate health status for /api/health.
/// Status thresholds are intentionally conservative: 5 min for healthy,
/// 15 min for degraded, beyond that is unhealthy. This matches the 30s
/// metro poll interval — if we haven't seen data in 5 minutes, something
/// is wrong even if the Function hasn't thrown an exception.
/// </summary>
public sealed class HealthStatus
{
    public string                           Status  { get; init; } = string.Empty; // "healthy" | "degraded" | "unhealthy"
    public Dictionary<string, SourceHealth> Sources { get; init; } = new();
}

public sealed class SourceHealth
{
    public string    Status       { get; init; } = string.Empty;
    public DateTime? LastIngest   { get; init; }
    public int       VehicleCount { get; init; }
}

/// <summary>
/// Response shape for /api/metrics — operational counters for observability dashboard.
/// </summary>
public sealed class MetricsResponse
{
    public SourceMetrics Metro    { get; init; } = new();
    public SourceMetrics Flight   { get; init; } = new();
    public DatabaseMetrics Database { get; init; } = new();
}

public sealed class SourceMetrics
{
    public int       VehicleCount  { get; init; }
    public DateTime? LastIngest    { get; init; }
    public int       PollsLast1h   { get; init; }
}

public sealed class DatabaseMetrics
{
    public long      RecordsLast24h { get; init; }
    public DateTime? OldestRecord   { get; init; }
}
