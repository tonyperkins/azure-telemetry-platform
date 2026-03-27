namespace TelemetryApi.Models;

/// <summary>
/// Lightweight projection used by /api/vehicles/paths.
/// Only the fields needed for polyline rendering are returned — omitting
/// the large raw_json column keeps the payload small when returning
/// 20–40 historical points per aircraft.
/// </summary>
public sealed class PathPoint
{
    public double   Latitude   { get; init; }
    public double   Longitude  { get; init; }
    public DateTime IngestedAt { get; init; }
}
