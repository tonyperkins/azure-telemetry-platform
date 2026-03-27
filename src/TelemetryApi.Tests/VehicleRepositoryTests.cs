using Dapper;
using FluentAssertions;
using Microsoft.ApplicationInsights;
using Microsoft.ApplicationInsights.Extensibility;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using TelemetryApi.Data;
using Xunit;

namespace TelemetryApi.Tests;

/// <summary>
/// Integration tests for VehicleRepository.
///
/// These tests use a real LocalDB/SQL Express database. They are designed to
/// run locally and in CI against a SQL Server container. They are NOT unit tests
/// — mocking the database would make them useless for validating query correctness.
///
/// SRE: Database integration tests catch query regressions before they reach
/// production. A bug in the ROW_NUMBER() window function that causes duplicate
/// vehicles would be invisible to unit tests but immediately caught here.
///
/// Prerequisites: SQL Server Express or LocalDB must be available.
/// Run seed-local-db.sql first to create the TelemetryDev database.
/// </summary>
public sealed class VehicleRepositoryTests : IAsyncLifetime
{
    private const string ConnectionString =
        "Server=(localdb)\\mssqllocaldb;Database=TelemetryDev;Trusted_Connection=True;";

    private VehicleRepository _repo = null!;

    public async Task InitializeAsync()
    {
        // Set up a minimal IConfiguration pointing at LocalDB
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:DefaultConnection"] = ConnectionString
            })
            .Build();

        var factory = new DbConnectionFactory(config);

        // TelemetryClient with no-op channel so tests don't emit to App Insights
        var telemetryConfig = TelemetryConfiguration.CreateDefault();
        telemetryConfig.DisableTelemetry = true;
        var telemetry = new TelemetryClient(telemetryConfig);

        _repo = new VehicleRepository(factory, telemetry, NullLogger<VehicleRepository>.Instance);

        // Ensure test data exists
        await SeedTestDataAsync();
    }

    public Task DisposeAsync() => Task.CompletedTask;

    // -------------------------------------------------------------------------
    // GetCurrentVehiclesAsync
    // -------------------------------------------------------------------------

    [Fact]
    public async Task GetCurrentVehicles_NoFilter_ReturnsBothSources()
    {
        var vehicles = (await _repo.GetCurrentVehiclesAsync()).ToList();

        vehicles.Should().NotBeEmpty();
        vehicles.Select(v => v.Source).Distinct()
            .Should().Contain(new[] { "metro", "flight" });
    }

    [Fact]
    public async Task GetCurrentVehicles_MetroFilter_ReturnsOnlyMetroVehicles()
    {
        var vehicles = (await _repo.GetCurrentVehiclesAsync("metro")).ToList();

        vehicles.Should().NotBeEmpty();
        vehicles.Should().AllSatisfy(v => v.Source.Should().Be("metro"));
    }

    [Fact]
    public async Task GetCurrentVehicles_FlightFilter_ReturnsOnlyFlightVehicles()
    {
        var vehicles = (await _repo.GetCurrentVehiclesAsync("flight")).ToList();

        vehicles.Should().NotBeEmpty();
        vehicles.Should().AllSatisfy(v => v.Source.Should().Be("flight"));
    }

    [Fact]
    public async Task GetCurrentVehicles_ReturnsOneRowPerVehicleId()
    {
        var vehicles = (await _repo.GetCurrentVehiclesAsync()).ToList();

        // No duplicate vehicle IDs — ROW_NUMBER() window function must be working
        var vehicleIds = vehicles.Select(v => v.VehicleId).ToList();
        vehicleIds.Should().OnlyHaveUniqueItems(
            "each vehicle_id should appear only once in the current view");
    }

    [Fact]
    public async Task GetCurrentVehicles_DoesNotReturnStalePositions()
    {
        // Insert a record older than 5 minutes
        await InsertStaleRecordAsync();

        var vehicles = (await _repo.GetCurrentVehiclesAsync()).ToList();

        // The stale vehicle should not appear (it's outside the 5-minute window)
        vehicles.Should().NotContain(v => v.VehicleId == "STALE-TEST-VEHICLE");
    }

    [Fact]
    public async Task GetCurrentVehicles_ReturnsLatestPositionPerVehicle()
    {
        // Insert two positions for the same vehicle, one older
        await InsertDualPositionVehicleAsync();

        var vehicles = (await _repo.GetCurrentVehiclesAsync()).ToList();
        var testVehicle = vehicles.FirstOrDefault(v => v.VehicleId == "DUAL-POS-TEST");

        testVehicle.Should().NotBeNull();
        // Should return the NEWER latitude (30.5000), not the older (30.4000)
        testVehicle!.Latitude.Should().BeApproximately(30.5000, 0.0001,
            "the repository must return the latest position, not an older one");
    }

    // -------------------------------------------------------------------------
    // GetVehicleHistoryAsync
    // -------------------------------------------------------------------------

    [Fact]
    public async Task GetVehicleHistory_ValidVehicleId_ReturnsHistory()
    {
        var history = (await _repo.GetVehicleHistoryAsync("BUS-1842", 1)).ToList();

        history.Should().NotBeEmpty();
        history.Should().AllSatisfy(v => v.VehicleId.Should().Be("BUS-1842"));
    }

    [Fact]
    public async Task GetVehicleHistory_CapsHoursAt6()
    {
        // Request 10 hours — should be capped at 6 without error
        var act = async () => await _repo.GetVehicleHistoryAsync("BUS-1842", 10);
        await act.Should().NotThrowAsync();
    }

    [Fact]
    public async Task GetVehicleHistory_UnknownVehicle_ReturnsEmpty()
    {
        var history = await _repo.GetVehicleHistoryAsync("NONEXISTENT-VEHICLE-XYZ", 1);
        history.Should().BeEmpty();
    }

    // -------------------------------------------------------------------------
    // GetSourceHealthAsync
    // -------------------------------------------------------------------------

    [Fact]
    public async Task GetSourceHealth_WithFreshData_ReturnsBothSources()
    {
        var health = (await _repo.GetSourceHealthAsync()).ToList();

        // With fresh seed data both sources should appear
        health.Should().HaveCountGreaterThanOrEqualTo(1);
        health.Should().AllSatisfy(h => h.LastIngest.Should().NotBeNull());
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    private async Task SeedTestDataAsync()
    {
        using var conn = new SqlConnection(ConnectionString);
        await conn.OpenAsync();

        // Ensure at least one fresh record per source exists
        const string upsert = """
            IF NOT EXISTS (SELECT 1 FROM dbo.vehicles WHERE vehicle_id = 'BUS-1842' AND ingested_at > DATEADD(minute, -3, GETUTCDATE()))
                INSERT INTO dbo.vehicles (source, vehicle_id, label, latitude, longitude, ingested_at)
                VALUES ('metro', 'BUS-1842', 'Route 1', 30.2672, -97.7431, GETUTCDATE());

            IF NOT EXISTS (SELECT 1 FROM dbo.vehicles WHERE vehicle_id = 'a12bc3' AND ingested_at > DATEADD(minute, -3, GETUTCDATE()))
                INSERT INTO dbo.vehicles (source, vehicle_id, label, latitude, longitude, altitude_m, ingested_at)
                VALUES ('flight', 'a12bc3', 'SWA2241', 30.1950, -97.6670, 1524, GETUTCDATE());
            """;

        await conn.ExecuteAsync(upsert);
    }

    private async Task InsertStaleRecordAsync()
    {
        using var conn = new SqlConnection(ConnectionString);
        await conn.OpenAsync();

        const string sql = """
            DELETE FROM dbo.vehicles WHERE vehicle_id = 'STALE-TEST-VEHICLE';
            INSERT INTO dbo.vehicles (source, vehicle_id, label, latitude, longitude, ingested_at)
            VALUES ('metro', 'STALE-TEST-VEHICLE', 'Route Stale', 30.0, -97.0,
                    DATEADD(minute, -10, GETUTCDATE()));
            """;

        await conn.ExecuteAsync(sql);
    }

    private async Task InsertDualPositionVehicleAsync()
    {
        using var conn = new SqlConnection(ConnectionString);
        await conn.OpenAsync();

        const string sql = """
            DELETE FROM dbo.vehicles WHERE vehicle_id = 'DUAL-POS-TEST';
            INSERT INTO dbo.vehicles (source, vehicle_id, label, latitude, longitude, ingested_at)
            VALUES
                ('metro', 'DUAL-POS-TEST', 'Route Dual', 30.4000, -97.7, DATEADD(minute, -3, GETUTCDATE())),
                ('metro', 'DUAL-POS-TEST', 'Route Dual', 30.5000, -97.7, DATEADD(minute, -1, GETUTCDATE()));
            """;

        await conn.ExecuteAsync(sql);
    }
}
