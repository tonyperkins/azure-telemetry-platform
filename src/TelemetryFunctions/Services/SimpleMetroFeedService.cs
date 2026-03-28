using TelemetryFunctions.Models;
using Microsoft.Extensions.Logging;
using System.Text.Json;
using Polly;
using Polly.Retry;

namespace TelemetryFunctions.Services;

/// <summary>
/// Simplified Metro feed service that generates mock Austin bus data.
/// In production, this would parse the actual GTFS-RT protobuf feed.
/// </summary>
public sealed class SimpleMetroFeedService
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<SimpleMetroFeedService> _logger;
    private readonly AsyncRetryPolicy<HttpResponseMessage> _retryPolicy;

    public SimpleMetroFeedService(HttpClient httpClient, ILogger<SimpleMetroFeedService> logger)
    {
        _httpClient = httpClient;
        _logger = logger;

        _retryPolicy = Policy
            .HandleResult<HttpResponseMessage>(r => !r.IsSuccessStatusCode)
            .Or<HttpRequestException>()
            .WaitAndRetryAsync(
                retryCount: 2,
                sleepDurationProvider: _ => TimeSpan.FromSeconds(2),
                onRetry: (outcome, delay, attempt, _) =>
                {
                    _logger.LogWarning(
                        "Metro fetch attempt {Attempt} failed ({Status}). Retrying in {Delay}s.",
                        attempt,
                        outcome.Result?.StatusCode,
                        delay.TotalSeconds);
                });
    }

    public async Task<List<MetroVehicle>> FetchVehiclesAsync(string feedUrl)
    {
        try
        {
            _logger.LogInformation("Generating mock Austin Metro data");

            // For demo purposes, generate mock Austin metro data
            var vehicles = GenerateMockAustinBuses();
            
            _logger.LogInformation("Generated {Count} mock bus positions", vehicles.Count);
            return vehicles;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error generating Metro data");
            return new List<MetroVehicle>();
        }
    }

    private List<MetroVehicle> GenerateMockAustinBuses()
    {
        var random = new Random();
        var vehicles = new List<MetroVehicle>();
        
        // Austin area coordinates for realistic bus positions
        var austinCoords = new[]
        {
            (30.2672, -97.7431), // Downtown Congress Ave
            (30.3050, -97.7200), // Duval area
            (30.2400, -97.7600), // South Lamar
            (30.2750, -97.7350), // MetroRapid route
            (30.2900, -97.6900), // Manor Road
        };

        var routes = new[] { "1", "7", "10", "801", "20" };
        var busIds = new[] { "1842", "2017", "1103", "3301", "0912" };

        for (int i = 0; i < 5; i++)
        {
            var (lat, lon) = austinCoords[i];
            var route = routes[i];
            var busId = busIds[i];
            
            // Add small random variations to simulate movement
            lat += (random.NextDouble() - 0.5) * 0.01;
            lon += (random.NextDouble() - 0.5) * 0.01;
            
            vehicles.Add(new MetroVehicle
            {
                VehicleId = busId,
                TripId = $"T-{random.Next(1000, 9999)}",
                RouteId = route,
                Latitude = lat,
                Longitude = lon,
                Bearing = (float)random.Next(0, 360),
                Speed = (float)(random.Next(15, 55) * 0.27778), // Convert km/h to m/s
                Timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds()
            });
        }

        return vehicles;
    }
}
