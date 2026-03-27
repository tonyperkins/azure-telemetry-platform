using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using System.Net;
using System.Text.Json;
using Xunit;

namespace TelemetryApi.Tests;

/// <summary>
/// Integration tests for the /api/health and /api/metrics endpoints.
/// Uses WebApplicationFactory to spin up the full Minimal API in-process —
/// no mocking of the HTTP layer, testing the actual routing and serialization.
///
/// SRE: Health endpoint tests are among the most valuable in the test suite
/// because the health endpoint is the primary on-call alert signal.
/// A bug that causes /api/health to return 500 would blind the alerting system
/// even if the underlying data pipeline is functioning correctly.
/// </summary>
public sealed class HealthEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client;

    public HealthEndpointTests(WebApplicationFactory<Program> factory)
    {
        _client = factory.CreateClient();
    }

    // -------------------------------------------------------------------------
    // /api/health
    // -------------------------------------------------------------------------

    [Fact]
    public async Task GetHealth_ReturnsOk()
    {
        var response = await _client.GetAsync("/api/health");

        // SRE: Health endpoint must always return 200, even when sources are
        // unhealthy. A 503 would cause App Service health probes to route
        // traffic away from this instance, compounding a data pipeline issue
        // with an availability incident.
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task GetHealth_ResponseHasRequiredShape()
    {
        var response = await _client.GetAsync("/api/health");
        var body     = await response.Content.ReadAsStringAsync();

        using var doc = JsonDocument.Parse(body);
        var root      = doc.RootElement;

        root.TryGetProperty("status", out _)
            .Should().BeTrue("response must contain 'status' field");

        root.TryGetProperty("sources", out var sources)
            .Should().BeTrue("response must contain 'sources' field");

        // Both sources must be represented in the response
        sources.TryGetProperty("metro", out var metro)
            .Should().BeTrue("sources must contain 'metro'");

        sources.TryGetProperty("flight", out var flight)
            .Should().BeTrue("sources must contain 'flight'");

        metro.TryGetProperty("status", out _)
            .Should().BeTrue("metro source must have 'status'");

        flight.TryGetProperty("status", out _)
            .Should().BeTrue("flight source must have 'status'");
    }

    [Fact]
    public async Task GetHealth_StatusIsOneOfKnownValues()
    {
        var response = await _client.GetAsync("/api/health");
        var body     = await response.Content.ReadAsStringAsync();

        using var doc    = JsonDocument.Parse(body);
        var overallStatus = doc.RootElement.GetProperty("status").GetString();

        overallStatus.Should().BeOneOf("healthy", "degraded", "unhealthy",
            "status must be one of the three defined values");
    }

    // -------------------------------------------------------------------------
    // /api/metrics
    // -------------------------------------------------------------------------

    [Fact]
    public async Task GetMetrics_ReturnsOk()
    {
        var response = await _client.GetAsync("/api/metrics");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task GetMetrics_ResponseHasRequiredShape()
    {
        var response = await _client.GetAsync("/api/metrics");
        var body     = await response.Content.ReadAsStringAsync();

        using var doc = JsonDocument.Parse(body);
        var root      = doc.RootElement;

        root.TryGetProperty("metro", out var metro).Should().BeTrue();
        root.TryGetProperty("flight", out var flight).Should().BeTrue();
        root.TryGetProperty("database", out var database).Should().BeTrue();

        metro.TryGetProperty("vehicleCount", out _).Should().BeTrue();
        metro.TryGetProperty("pollsLast1h", out _).Should().BeTrue();

        flight.TryGetProperty("vehicleCount", out _).Should().BeTrue();
        database.TryGetProperty("recordsLast24h", out _).Should().BeTrue();
    }

    // -------------------------------------------------------------------------
    // /api/vehicles/current
    // -------------------------------------------------------------------------

    [Fact]
    public async Task GetCurrentVehicles_NoParams_ReturnsOk()
    {
        var response = await _client.GetAsync("/api/vehicles/current");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task GetCurrentVehicles_MetroSource_ReturnsOk()
    {
        var response = await _client.GetAsync("/api/vehicles/current?source=metro");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task GetCurrentVehicles_InvalidSource_ReturnsBadRequest()
    {
        var response = await _client.GetAsync("/api/vehicles/current?source=invalid");
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    // -------------------------------------------------------------------------
    // /api/vehicles/history
    // -------------------------------------------------------------------------

    [Fact]
    public async Task GetVehicleHistory_MissingVehicleId_ReturnsBadRequest()
    {
        var response = await _client.GetAsync("/api/vehicles/history?hours=1");
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task GetVehicleHistory_ValidParams_ReturnsOk()
    {
        var response = await _client.GetAsync("/api/vehicles/history?vehicleId=BUS-1842&hours=1");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task GetVehicleHistory_HoursOutOfRange_ReturnsBadRequest()
    {
        var response = await _client.GetAsync("/api/vehicles/history?vehicleId=BUS-1842&hours=99");
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    // -------------------------------------------------------------------------
    // /healthz (built-in ASP.NET health check)
    // -------------------------------------------------------------------------

    [Fact]
    public async Task HealthzEndpoint_ReturnsOk()
    {
        var response = await _client.GetAsync("/healthz");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }
}
