using MetroIngestion.Services;
using Microsoft.ApplicationInsights;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using System.Diagnostics;

namespace MetroIngestion;

/// <summary>
/// Azure Function — C# Timer Trigger, runs every 30 seconds.
/// Fetches the Capital Metro GTFS-RT protobuf feed and bulk-inserts
/// vehicle positions into the unified dbo.vehicles table.
///
/// SRE: This Function is intentionally isolated from FlightIngestion.
/// A Capital Metro feed outage (their CDN goes down, their API rate-limits us,
/// their data changes format) has zero blast radius on flight data.
/// Independent Functions = independent failure domains = better MTTR.
/// </summary>
public sealed class MetroIngestionFunction
{
    private readonly ProtobufMetroFeedService _feedService;
    private readonly VehicleIngestionService _ingestionService;
    private readonly TelemetryClient        _telemetry;
    private readonly IConfiguration         _config;
    private readonly ILogger<MetroIngestionFunction> _logger;

    public MetroIngestionFunction(
        ProtobufMetroFeedService feedService,
        VehicleIngestionService ingestionService,
        TelemetryClient telemetry,
        IConfiguration config,
        ILogger<MetroIngestionFunction> logger)
    {
        _feedService      = feedService;
        _ingestionService = ingestionService;
        _telemetry        = telemetry;
        _config           = config;
        _logger           = logger;
    }

    [Function("MetroIngestion")]
    public async Task RunAsync([TimerTrigger("*/30 * * * * *")] TimerInfo timer)
    {
        var sw      = Stopwatch.StartNew();
        var feedUrl = _config["METRO_FEED_URL"]
            ?? "https://data.texas.gov/download/r4v4-vz24/application%2Foctet-stream";

        _logger.LogInformation("Metro ingestion started. Feed: {FeedUrl}", feedUrl);

        // Step 1: Fetch + parse GTFS-RT protobuf
        var vehicles = await _feedService.FetchVehiclesAsync(feedUrl);

        // Step 2: Handle zero-vehicle result
        if (vehicles.Count == 0)
        {
            // SRE: We track a custom metric when the feed returns zero vehicles.
            // This is the key observable signal for the "Metro feed stale" alert rule.
            // A Function run that succeeds but returns no vehicles is an incident
            // if it persists across multiple polls during peak operating hours.
            // Alerting on this business outcome (no data) is more reliable than
            // alerting on exceptions (which may not fire if the feed returns 200 + empty).
            _telemetry.TrackMetric("vehicles_ingested_zero", 1,
                new Dictionary<string, string> { ["source"] = "metro" });

            _logger.LogWarning(
                "Metro ingestion returned 0 vehicles. Feed may be unavailable or empty. " +
                "Staleness alert will fire if this persists across 3 consecutive polls.");
            return;
        }

        // Step 3: Bulk insert
        var insertedCount = await _ingestionService.BulkInsertAsync(vehicles);

        sw.Stop();

        // SRE: Track custom metric 'vehicles_ingested' per source.
        // This enables data-staleness alerting in Application Insights —
        // alerting on business outcomes (vehicles flowing in) not just
        // technical health (no exceptions thrown).
        _telemetry.TrackMetric("vehicles_ingested", insertedCount,
            new Dictionary<string, string> { ["source"] = "metro" });

        _logger.LogInformation(
            "Metro ingestion complete: {Count} vehicles in {Ms}ms.",
            insertedCount, sw.ElapsedMilliseconds);
    }
}
