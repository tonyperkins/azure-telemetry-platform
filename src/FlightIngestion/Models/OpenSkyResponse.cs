using System.Text.Json;
using System.Text.Json.Serialization;

namespace FlightIngestion.Models;

/// <summary>
/// OpenSky Network REST API response.
/// States is an array-of-arrays (not an array-of-objects) — each element
/// is mapped by positional index, not by key name. This is a quirk of the
/// OpenSky API that must be documented explicitly.
/// </summary>
public sealed class OpenSkyResponse
{
    [JsonPropertyName("time")]
    public long Time { get; init; }

    [JsonPropertyName("states")]
    public JsonElement[][]? States { get; init; }
}

/// <summary>
/// Parsed and typed representation of a single OpenSky state vector.
/// Field positions in the raw states array are defined by the OpenSky API spec.
/// </summary>
public sealed class OpenSkyVehicle
{
    public string  Icao24         { get; init; } = string.Empty; // index 0
    public string? Callsign       { get; init; }                 // index 1
    public string? OriginCountry  { get; init; }                 // index 2
    public double? Longitude      { get; init; }                 // index 5
    public double? Latitude       { get; init; }                 // index 6
    public double? BaroAltitude   { get; init; }                 // index 7
    public bool    OnGround       { get; init; }                 // index 8
    public double? Velocity       { get; init; }                 // index 9 — m/s
    public double? TrueTrack      { get; init; }                 // index 10 — heading degrees
}
