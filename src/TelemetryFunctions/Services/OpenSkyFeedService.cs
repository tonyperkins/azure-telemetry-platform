using TelemetryFunctions.Models;
using Microsoft.Extensions.Logging;
using Polly;
using Polly.Retry;
using System.Text.Json;

namespace TelemetryFunctions.Services;

/// <summary>
/// Fetches and parses the OpenSky Network REST/JSON aircraft feed.
/// Bounding box is configurable via OPENSKY_BBOX config value.
///
/// SRE: OpenSky anonymous access is rate-limited to 10 requests/minute.
/// Our 60-second poll interval gives 1 request/minute — well within limits.
/// If we ever need to increase poll frequency, we must add OpenSky credentials
/// (which raises the limit to 100/minute) or cache responses locally.
/// </summary>
public sealed class OpenSkyFeedService
{
    private const string BaseUrl = "https://opensky-network.org/api/states/all";

    private readonly HttpClient              _httpClient;
    private readonly ILogger<OpenSkyFeedService> _logger;
    private readonly AsyncRetryPolicy<HttpResponseMessage> _retryPolicy;
    private readonly string? _clientId;
    private readonly string? _clientSecret;
    
    // Circuit breaker: track when we last hit rate limit
    private static DateTime? _lastRateLimitTime;
    private static readonly TimeSpan RateLimitCooldown = TimeSpan.FromMinutes(1);

    public OpenSkyFeedService(
        HttpClient httpClient,
        ILogger<OpenSkyFeedService> logger,
        Microsoft.Extensions.Configuration.IConfiguration config)
    {
        _httpClient    = httpClient;
        _logger        = logger;
        _clientId      = config["OPENSKY_CLIENT_ID"];
        _clientSecret  = config["OPENSKY_CLIENT_SECRET"];

        // SRE: If credentials are configured, set Basic Auth header for all requests.
        // This raises the rate limit from 400/day (anonymous) to 4000/day (registered).
        if (!string.IsNullOrEmpty(_clientId) && !string.IsNullOrEmpty(_clientSecret))
        {
            var authBytes = System.Text.Encoding.ASCII.GetBytes($"{_clientId}:{_clientSecret}");
            var authHeader = Convert.ToBase64String(authBytes);
            _httpClient.DefaultRequestHeaders.Authorization =
                new System.Net.Http.Headers.AuthenticationHeaderValue("Basic", authHeader);
            _logger.LogInformation("OpenSky authenticated mode enabled (4000 credits/day).");
        }
        else
        {
            _logger.LogWarning(
                "OpenSky running in anonymous mode (400 credits/day). " +
                "Set OPENSKY_CLIENT_ID and OPENSKY_CLIENT_SECRET for higher limits.");
        }

        // SRE: Exponential backoff for transient errors, but NO retry on 429 (rate limit).
        // Retrying on 429 makes the problem worse - we need to back off completely.
        _retryPolicy = Policy
            .HandleResult<HttpResponseMessage>(r => 
                !r.IsSuccessStatusCode && 
                r.StatusCode != System.Net.HttpStatusCode.TooManyRequests) // Don't retry 429
            .Or<HttpRequestException>()
            .WaitAndRetryAsync(
                retryCount: 2,
                sleepDurationProvider: attempt => TimeSpan.FromSeconds(Math.Pow(2, attempt)), // 2s, 4s
                onRetry: (outcome, delay, attempt, _) =>
                {
                    _logger.LogWarning(
                        "OpenSky fetch attempt {Attempt} failed ({Status}). Retrying in {Delay}s.",
                        attempt, outcome.Result?.StatusCode, delay.TotalSeconds);
                });
    }

    /// <summary>
    /// Fetches aircraft state vectors within the configured bounding box.
    /// Returns an empty list on any failure; the caller handles zero-vehicle logic.
    /// </summary>
    public async Task<IReadOnlyList<OpenSkyVehicle>> FetchVehiclesAsync(string bboxConfig)
    {
        // Circuit breaker: if we recently hit rate limit, skip this call
        if (_lastRateLimitTime.HasValue)
        {
            var timeSinceRateLimit = DateTime.UtcNow - _lastRateLimitTime.Value;
            if (timeSinceRateLimit < RateLimitCooldown)
            {
                var remainingCooldown = RateLimitCooldown - timeSinceRateLimit;
                _logger.LogInformation(
                    "OpenSky circuit breaker active. Skipping call. Cooldown ends in {Minutes:F1} minutes.",
                    remainingCooldown.TotalMinutes);
                return Array.Empty<OpenSkyVehicle>();
            }
            else
            {
                // Cooldown expired, reset circuit breaker
                _logger.LogInformation("OpenSky circuit breaker reset. Resuming API calls.");
                _lastRateLimitTime = null;
            }
        }
        
        var url = BuildUrl(bboxConfig);

        HttpResponseMessage response;
        try
        {
            response = await _retryPolicy.ExecuteAsync(() => _httpClient.GetAsync(url));
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "OpenSky feed unreachable after retries. URL: {Url}", url);
            return Array.Empty<OpenSkyVehicle>();
        }

        if (!response.IsSuccessStatusCode)
        {
            // Special handling for rate limit errors
            if (response.StatusCode == System.Net.HttpStatusCode.TooManyRequests)
            {
                _lastRateLimitTime = DateTime.UtcNow;
                _logger.LogWarning(
                    "OpenSky rate limit exceeded (429). Activating circuit breaker for {Minutes} minutes. " +
                    "This prevents hammering the API and making the problem worse.",
                    RateLimitCooldown.TotalMinutes);
            }
            else
            {
                _logger.LogWarning(
                    "OpenSky returned {StatusCode}. Skipping ingestion run.",
                    response.StatusCode);
            }
            return Array.Empty<OpenSkyVehicle>();
        }

        try
        {
            var json = await response.Content.ReadAsStringAsync();
            return ParseResponse(json);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to parse OpenSky JSON response.");
            return Array.Empty<OpenSkyVehicle>();
        }
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /// <summary>
    /// Parses the OpenSky states array-of-arrays response into typed objects.
    /// Each state vector is an array — fields are mapped by index per the API spec.
    ///
    /// SRE: We map by index (not by key) because OpenSky's states array has no
    /// field names — it's always positional. Documenting the index mapping here
    /// prevents silent errors if the API changes the order in a future version.
    /// </summary>
    private IReadOnlyList<OpenSkyVehicle> ParseResponse(string json)
    {
        using var doc    = JsonDocument.Parse(json);
        var root         = doc.RootElement;
        var vehicles     = new List<OpenSkyVehicle>();

        if (!root.TryGetProperty("states", out var statesElement) ||
            statesElement.ValueKind != JsonValueKind.Array)
        {
            return vehicles;
        }

        foreach (var state in statesElement.EnumerateArray())
        {
            if (state.ValueKind != JsonValueKind.Array)
                continue;

            try
            {
                var arr = state.EnumerateArray().ToArray();
                if (arr.Length < 11) continue;

                var vehicle = new OpenSkyVehicle
                {
                    Icao24        = GetString(arr, 0)  ?? string.Empty,
                    Callsign      = GetString(arr, 1)?.Trim(),
                    OriginCountry = GetString(arr, 2),
                    Longitude     = GetDouble(arr, 5),
                    Latitude      = GetDouble(arr, 6),
                    BaroAltitude  = GetDouble(arr, 7),
                    OnGround      = GetBool(arr, 8),
                    Velocity      = GetDouble(arr, 9),
                    TrueTrack     = GetDouble(arr, 10)
                };

                vehicles.Add(vehicle);
            }
            catch (Exception ex)
            {
                // SRE: Per-record exception handling — a single bad state vector
                // (e.g. unexpected null in a numeric field) should not abort the
                // entire batch. Other aircraft continue to be processed.
                _logger.LogWarning(ex, "Skipping malformed OpenSky state vector.");
            }
        }

        return vehicles;
    }

    private static string BuildUrl(string bboxConfig)
    {
        // OPENSKY_BBOX format: "lamin,lomin,lamax,lomax"  e.g. "29.8,-98.2,30.8,-97.2"
        var parts = bboxConfig.Split(',');
        if (parts.Length != 4)
        {
            throw new ArgumentException(
                $"OPENSKY_BBOX must be 'lamin,lomin,lamax,lomax'. Got: '{bboxConfig}'");
        }

        return $"{BaseUrl}?lamin={parts[0]}&lomin={parts[1]}&lamax={parts[2]}&lomax={parts[3]}";
    }

    private static string?  GetString(JsonElement[] arr, int idx)
        => arr[idx].ValueKind == JsonValueKind.Null ? null : arr[idx].GetString();

    private static double?  GetDouble(JsonElement[] arr, int idx)
        => arr[idx].ValueKind == JsonValueKind.Null ? null : arr[idx].GetDouble();

    private static bool GetBool(JsonElement[] arr, int idx)
        => arr[idx].ValueKind != JsonValueKind.Null && arr[idx].GetBoolean();
}
