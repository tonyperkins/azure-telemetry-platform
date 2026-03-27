namespace TelemetryApi.Models;

/// <summary>
/// Unified vehicle position record — shared by metro and flight sources.
/// The source discriminator keeps the schema extensible: adding maritime AIS
/// or cyclist GPS requires only a new ingestion Function, not a schema change.
/// </summary>
public sealed class Vehicle
{
    public long     Id          { get; init; }
    public string   Source      { get; init; } = string.Empty;   // "metro" | "flight"
    public string   VehicleId   { get; init; } = string.Empty;
    public string?  Label       { get; init; }                   // route number or callsign
    public double   Latitude    { get; init; }
    public double   Longitude   { get; init; }
    public double?  AltitudeM   { get; init; }
    public double?  SpeedKmh    { get; init; }
    public double?  Heading     { get; init; }
    public bool?    OnGround    { get; init; }
    public string?  RawJson     { get; init; }
    public DateTime IngestedAt  { get; init; }
}
