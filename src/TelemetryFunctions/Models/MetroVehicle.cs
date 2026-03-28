namespace TelemetryFunctions.Models;

/// <summary>
/// Intermediate model for a Capital Metro vehicle parsed from GTFS-RT feed.
/// Maps the protobuf VehiclePosition fields to a typed object before
/// converting to the unified vehicles table schema.
/// </summary>
public sealed class MetroVehicle
{
    public string  VehicleId { get; init; } = string.Empty;
    public string? TripId    { get; init; }
    public string? RouteId   { get; init; }
    public double  Latitude  { get; init; }
    public double  Longitude { get; init; }
    public float?  Bearing   { get; init; }
    public float?  Speed     { get; init; }    // meters/second from GTFS-RT
    public long    Timestamp { get; init; }    // Unix epoch seconds
}
