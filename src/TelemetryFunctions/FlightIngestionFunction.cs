using TelemetryFunctions.Services;
using Microsoft.ApplicationInsights;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using System.Diagnostics;

namespace TelemetryFunctions;

/// <summary>
/// Azure Function — C# Timer Trigger, runs every 60 seconds.
/// Fetches the OpenSky Network REST/JSON feed and bulk-inserts aircraft
/// positions into the unified dbo.vehicles table.
///
/// SRE: 60-second interval (vs. metro's 30s) respects OpenSky's anonymous
/// rate limit of 10 requests/minute. If both Functions shared a single
/// multi-source Function, we'd need to coordinate their poll schedules.
/// Separate Functions eliminate that coupling entirely.
/// </summary>
public sealed class FlightIngestionFunction
{
    private readonly OpenSkyFeedService      _feedService;
    private readonly VehicleIngestionService _ingestionService;
    private readonly TelemetryClient         _telemetry;
    private readonly IConfiguration          _config;
    private readonly ILogger<FlightIngestionFunction> _logger;

    public FlightIngestionFunction(
        OpenSkyFeedService feedService,
        VehicleIngestionService ingestionService,
        TelemetryClient telemetry,
        IConfiguration config,
        ILogger<FlightIngestionFunction> logger)
    {
        _feedService      = feedService;
        _ingestionService = ingestionService;
        _telemetry        = telemetry;
        _config           = config;
        _logger           = logger;
    }

    [Function("FlightIngestion")]
    public async Task RunAsync([TimerTrigger("0 * * * * *")] TimerInfo timer)
    {
        // SRE: Feature flag / kill switch
        if (!_config.GetValue<bool>("ENABLE_FLIGHT_INGESTION", defaultValue: true))
        {
            _logger.LogInformation("Flight ingestion is disabled via configuration. Skipping run.");
            return;
        }

        var sw   = Stopwatch.StartNew();
        var bbox = _config["OPENSKY_BBOX"] ?? "29.8,-98.2,30.8,-97.2";

        _logger.LogInformation("Flight ingestion started. BBox: {BBox}", bbox);

        // Step 1: Fetch + parse OpenSky JSON
        var allVehicles = await _feedService.FetchVehiclesAsync(bbox);

        // Step 2: Filter out aircraft without position data
        // OpenSky includes state vectors even when the aircraft isn't broadcasting
        // its GPS position — those have null lat/lon and are useless for mapping.
        var withPosition = allVehicles
            .Where(v => v.Latitude.HasValue && v.Longitude.HasValue)
            .ToList();

        // Step 3: Optionally filter out aircraft on the ground
        // SRE: This is configurable because some operators want to see ground traffic
        // at Austin-Bergstrom (e.g., pushback, taxiing). Default is to filter.
        var filterOnGround = _config.GetValue<bool>("FILTER_ON_GROUND", defaultValue: true);
        var vehicles = filterOnGround
            ? withPosition.Where(v => !v.OnGround).ToList()
            : withPosition;

        _logger.LogInformation(
            "OpenSky returned {Total} state vectors. After filtering: {Filtered} airborne.",
            allVehicles.Count, vehicles.Count);

        // Step 4: Handle zero-vehicle result
        if (vehicles.Count == 0)
        {
            // SRE: Help diagnose why the count is zero.
            // (1) was the feed empty? (2) were all aircraft position-less? (3) were they all on ground?
            _logger.LogWarning(
                "Flight ingestion returned 0 airborne vehicles. Metrics: Total={Total}, WithPosition={WithPosition}, Filtering={FilterOnGround}",
                allVehicles.Count, withPosition.Count, filterOnGround);

            _telemetry.TrackMetric("vehicles_ingested_zero", 1,
                new Dictionary<string, string> { ["source"] = "flight" });

            return;
        }

        // Step 5: Bulk insert
        var insertedCount = await _ingestionService.BulkInsertAsync(vehicles);

        sw.Stop();

        // SRE: Track custom metric 'vehicles_ingested' per source.
        _telemetry.TrackMetric("vehicles_ingested", insertedCount,
            new Dictionary<string, string> { ["source"] = "flight" });

        _logger.LogInformation(
            "Flight ingestion complete: {Count} aircraft in {Ms}ms.",
            insertedCount, sw.ElapsedMilliseconds);
    }
}
