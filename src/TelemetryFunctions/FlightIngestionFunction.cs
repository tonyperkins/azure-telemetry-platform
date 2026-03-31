using TelemetryFunctions.Services;
using Microsoft.ApplicationInsights;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using System;
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

    [Function("FlightIngestionTimer")]
    public async Task RunTimerAsync(
        [TimerTrigger("%FLIGHT_POLLING_CRON%")] TimerInfo timer)
    {
        await ExecuteIngestionAsync();
    }

    [Function("FlightIngestionHttp")]
    public async Task<HttpResponseData> RunHttpAsync(
        [HttpTrigger(AuthorizationLevel.Function, "post", Route = "ingest/flight")] HttpRequestData req)
    {
        await ExecuteIngestionAsync();
        return req.CreateResponse(System.Net.HttpStatusCode.Accepted);
    }

    private async Task ExecuteIngestionAsync()
    {
        // SRE: Feature flag / kill switch
        if (!_config.GetValue<bool>("ENABLE_FLIGHT_INGESTION", defaultValue: true))
        {
            _logger.LogInformation("Flight ingestion is disabled via configuration. Skipping run.");
            return;
        }

        // SRE: On-Demand Ingestion Check
        // We only poll OpenSky if a dashboard has reported a heartbeat in the last 5 minutes.
        // This ensures credits are only used when someone is actually watching.
        var (lastActiveVal, lastActiveTime) = await _ingestionService.GetStatusAsync("dashboard", "last_active");
        
        if (lastActiveTime.HasValue)
        {
            var heartbeatAge = DateTime.UtcNow - lastActiveTime.Value;
            if (heartbeatAge > TimeSpan.FromMinutes(5))
            {
                _logger.LogInformation("On-Demand: Idle ({Age:F1}m since heartbeat). Skipping OpenSky pull to conserve credits.", heartbeatAge.TotalMinutes);
                return;
            }
        }
        else
        {
             // SRE: Bootstrap mode. If the row is missing (first run), we proceed once
             // so the dashboard isn't empty when the first user arrives.
             _logger.LogInformation("On-Demand: No heartbeat row found. Running bootstrap ingestion.");
        }

        var sw   = Stopwatch.StartNew();
        var bbox = _config["OPENSKY_BBOX"] ?? "29.8,-98.2,30.8,-97.2";

        // SRE: Adaptive Polling (Back-off logic)
        // If we previously hit 3+ consecutive zero-aircraft runs, "is_quiet_mode" is set to true.
        // We then back off to a 5-minute polling interval to save credits until traffic returns.
        var (quietVal, quietTime) = await _ingestionService.GetStatusAsync("flight", "is_quiet_mode");
        if (quietVal == "true" && quietTime.HasValue)
        {
            var quietAge = DateTime.UtcNow - quietTime.Value;
            if (quietAge < TimeSpan.FromMinutes(5))
            {
                _logger.LogInformation("Adaptive polling: Quiet mode active ({Age:F1}m). Skipping OpenSky pull to conserve credits.", quietAge.TotalMinutes);
                return;
            }
            _logger.LogInformation("Adaptive polling: Quiet mode expired. Resuming check.");
        }

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
            var (cntStr, _) = await _ingestionService.GetStatusAsync("flight", "quiet_count");
            int count = int.TryParse(cntStr, out var c) ? c : 0;
            count++;
            
            await _ingestionService.UpdateStatusAsync("flight", "quiet_count", count.ToString());
            if (count >= 3)
            {
                await _ingestionService.UpdateStatusAsync("flight", "is_quiet_mode", "true");
                _logger.LogInformation("Adaptive polling: 3+ empty results. Engaging 5-minute quiet mode back-off.");
            }

            if (allVehicles.Count == 0)
            {
                // SRE: In quiet periods (late night), it's possible to have 0 aircraft in a small bbox.
                // This is normal, not a warning.
                _logger.LogInformation("OpenSky returned 0 aircraft in the current bounding box.");
            }
            else
            {
                // SRE: If we got vectors but they were all filtered out, we want to know why.
                _logger.LogWarning(
                    "Flight ingestion filtered all {Total} vectors to zero. Metrics: WithPosition={WithPosition}, FilterOnGround={FilterOnGround}",
                    allVehicles.Count, withPosition.Count, filterOnGround);
            }

            _telemetry.TrackMetric("vehicles_ingested_zero", 1,
                new Dictionary<string, string> { ["source"] = "flight" });

            return;
        }

        // Reset quiet mode on success
        await _ingestionService.UpdateStatusAsync("flight", "quiet_count", "0");
        await _ingestionService.UpdateStatusAsync("flight", "is_quiet_mode", "false");

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
