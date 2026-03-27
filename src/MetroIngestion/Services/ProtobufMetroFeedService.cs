using MetroIngestion.Models;
using Microsoft.Extensions.Logging;
using Polly;
using Polly.Retry;
using ProtoBuf;
using System.Runtime.Serialization;

namespace MetroIngestion.Services;

/// <summary>
/// Fetches and parses Capital Metro GTFS-RT feed using protobuf-net directly.
/// This avoids the .NET Framework-only GtfsRealtimeBindings package.
/// 
/// SRE: Capital Metro publishes vehicle positions via GTFS-RT every ~30 seconds.
/// The feed URL is configurable via METRO_GTFS_RT_URL to handle feed migrations
/// without code changes.
/// </summary>
public sealed class ProtobufMetroFeedService
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<ProtobufMetroFeedService> _logger;
    private readonly AsyncRetryPolicy<HttpResponseMessage> _retryPolicy;

    public ProtobufMetroFeedService(HttpClient httpClient, ILogger<ProtobufMetroFeedService> logger)
    {
        _httpClient = httpClient;
        _logger = logger;

        // SRE: Retry with exponential backoff for transient failures
        _retryPolicy = Policy
            .HandleResult<HttpResponseMessage>(r => !r.IsSuccessStatusCode)
            .Or<HttpRequestException>()
            .WaitAndRetryAsync(
                retryCount: 3,
                sleepDurationProvider: attempt => TimeSpan.FromSeconds(Math.Pow(2, attempt)),
                onRetry: (outcome, timespan, retryCount, context) =>
                {
                    _logger.LogWarning(
                        "Metro feed request failed (attempt {RetryCount}). Retrying in {Delay}s...",
                        retryCount, timespan.TotalSeconds);
                });
    }

    public async Task<List<MetroVehicle>> FetchVehiclesAsync(string feedUrl)
    {
        HttpResponseMessage response;
        try
        {
            response = await _retryPolicy.ExecuteAsync(() => _httpClient.GetAsync(feedUrl));
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Metro GTFS-RT feed unreachable after retries. URL: {Url}", feedUrl);
            return new List<MetroVehicle>();
        }

        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning(
                "Metro GTFS-RT returned {StatusCode}. Skipping ingestion run.",
                response.StatusCode);
            return new List<MetroVehicle>();
        }

        try
        {
            var bytes = await response.Content.ReadAsByteArrayAsync();
            _logger.LogInformation("Received {ByteCount} bytes from GTFS-RT feed. Content-Type: {ContentType}", 
                bytes.Length, response.Content.Headers.ContentType?.ToString() ?? "unknown");
            
            // Log first 20 bytes to help diagnose if we're getting HTML instead of protobuf
            if (bytes.Length > 0)
            {
                var preview = string.Join(" ", bytes.Take(20).Select(b => b.ToString("X2")));
                _logger.LogDebug("Feed preview (first 20 bytes): {Preview}", preview);
                
                // Check if response looks like HTML (common error case)
                if (bytes.Length > 10 && bytes[0] == '<')
                {
                    var htmlPreview = System.Text.Encoding.UTF8.GetString(bytes.Take(100).ToArray());
                    _logger.LogWarning("Feed returned HTML instead of protobuf. Preview: {HtmlPreview}", htmlPreview);
                    return new List<MetroVehicle>();
                }
            }
            
            return ParseGtfsRt(bytes);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to parse Metro GTFS-RT protobuf response.");
            return new List<MetroVehicle>();
        }
    }

    private List<MetroVehicle> ParseGtfsRt(byte[] protobufBytes)
    {
        var vehicles = new List<MetroVehicle>();

        using var stream = new MemoryStream(protobufBytes);
        var feed = Serializer.Deserialize<FeedMessage>(stream);

        if (feed == null)
        {
            _logger.LogWarning("GTFS-RT feed deserialization returned null.");
            return vehicles;
        }

        _logger.LogInformation("Feed header: version={Version}, timestamp={Timestamp}, entities={EntityCount}", 
            feed.header?.gtfs_realtime_version ?? "unknown",
            feed.header?.timestamp ?? 0,
            feed.entity?.Count ?? 0);

        if (feed.entity == null || feed.entity.Count == 0)
        {
            _logger.LogWarning("GTFS-RT feed contained no entities.");
            return vehicles;
        }

        int skippedNoVehicle = 0;
        int skippedNoPosition = 0;
        int skippedInvalidCoords = 0;

        foreach (var entity in feed.entity)
        {
            if (entity.vehicle == null)
            {
                skippedNoVehicle++;
                continue;
            }

            var vp = entity.vehicle;
            
            if (vp.position == null)
            {
                skippedNoPosition++;
                continue;
            }

            var pos = vp.position;

            // Skip vehicles without valid lat/lon
            if (pos.latitude == 0 && pos.longitude == 0)
            {
                skippedInvalidCoords++;
                continue;
            }

            var vehicle = new MetroVehicle
            {
                VehicleId = vp.vehicle?.id ?? entity.id,
                TripId    = vp.trip?.trip_id,
                RouteId   = vp.trip?.route_id,
                Latitude  = pos.latitude,
                Longitude = pos.longitude,
                Bearing   = pos.bearing,
                Speed     = pos.speed,
                Timestamp = vp.timestamp > 0 ? (long)vp.timestamp : DateTimeOffset.UtcNow.ToUnixTimeSeconds()
            };

            vehicles.Add(vehicle);
        }

        _logger.LogInformation(
            "Parsed {Count} vehicles from GTFS-RT feed. Skipped: {NoVehicle} no vehicle, {NoPosition} no position, {InvalidCoords} invalid coords",
            vehicles.Count, skippedNoVehicle, skippedNoPosition, skippedInvalidCoords);
        
        return vehicles;
    }

    // -------------------------------------------------------------------------
    // GTFS-RT Protobuf Schema (simplified for vehicle positions only)
    // Based on https://github.com/google/transit/blob/master/gtfs-realtime/proto/gtfs-realtime.proto
    // -------------------------------------------------------------------------

    [ProtoContract]
    public class FeedMessage
    {
        [ProtoMember(1)]
        public FeedHeader? header { get; set; }

        [ProtoMember(2)]
        public List<FeedEntity>? entity { get; set; }
    }

    [ProtoContract]
    public class FeedHeader
    {
        [ProtoMember(1)]
        public string? gtfs_realtime_version { get; set; }

        [ProtoMember(2)]
        public int incrementality { get; set; }

        [ProtoMember(3)]
        public ulong timestamp { get; set; }
    }

    [ProtoContract]
    public class FeedEntity
    {
        [ProtoMember(1)]
        public string? id { get; set; }

        [ProtoMember(2)]
        public bool? is_deleted { get; set; }

        [ProtoMember(4)]
        public VehiclePosition? vehicle { get; set; }
        
        // Per official GTFS-RT spec:
        // trip_update = 3, vehicle = 4, alert = 5
    }

    [ProtoContract]
    public class VehiclePosition
    {
        [ProtoMember(1)]
        public TripDescriptor? trip { get; set; }

        [ProtoMember(2)]
        public Position? position { get; set; }

        [ProtoMember(3)]
        public ulong timestamp { get; set; }

        [ProtoMember(8)]
        public VehicleDescriptor? vehicle { get; set; }
    }

    [ProtoContract]
    public class TripDescriptor
    {
        [ProtoMember(1)]
        public string? trip_id { get; set; }

        [ProtoMember(5)]
        public string? route_id { get; set; }
    }

    [ProtoContract]
    public class Position
    {
        [ProtoMember(1)]
        public float latitude { get; set; }

        [ProtoMember(2)]
        public float longitude { get; set; }

        [ProtoMember(3)]
        public float bearing { get; set; }

        [ProtoMember(4)]
        public float speed { get; set; }
    }

    [ProtoContract]
    public class VehicleDescriptor
    {
        [ProtoMember(1)]
        public string? id { get; set; }

        [ProtoMember(2)]
        public string? label { get; set; }
    }
}
