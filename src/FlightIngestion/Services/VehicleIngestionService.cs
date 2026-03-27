using FlightIngestion.Models;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Logging;
using System.Data;
using System.Text.Json;

namespace FlightIngestion.Services;

/// <summary>
/// Persists parsed OpenSky aircraft to the unified vehicles table using
/// SqlBulkCopy. Mirrors the MetroIngestion VehicleIngestionService pattern
/// intentionally — consistency across ingestion services reduces cognitive load
/// for on-call engineers debugging production issues.
/// </summary>
public sealed class VehicleIngestionService
{
    private readonly string  _connectionString;
    private readonly ILogger<VehicleIngestionService> _logger;

    public VehicleIngestionService(string connectionString, ILogger<VehicleIngestionService> logger)
    {
        _connectionString = connectionString;
        _logger           = logger;
    }

    /// <summary>
    /// Bulk-inserts a batch of aircraft into dbo.vehicles.
    /// Filters applied before insert:
    ///   - latitude/longitude must not be null (aircraft not broadcasting position)
    ///   - on_ground filtered by caller if FILTER_ON_GROUND config is true
    /// Returns the number of rows inserted.
    /// </summary>
    public async Task<int> BulkInsertAsync(IReadOnlyList<OpenSkyVehicle> vehicles)
    {
        if (vehicles.Count == 0)
            return 0;

        var table = BuildDataTable(vehicles);

        try
        {
            using var conn = new SqlConnection(_connectionString);
            await conn.OpenAsync();

            using var bulk = new SqlBulkCopy(conn)
            {
                DestinationTableName = "dbo.vehicles",
                BatchSize            = 500,
                BulkCopyTimeout      = 30
            };

            MapColumns(bulk);
            await bulk.WriteToServerAsync(table);

            _logger.LogDebug("BulkCopy wrote {Count} flight rows.", vehicles.Count);
            return vehicles.Count;
        }
        catch (SqlException ex)
        {
            // SRE: Same graceful degradation pattern as metro ingestion.
            // Lose this poll, not the Function host process.
            _logger.LogError(ex,
                "SqlBulkCopy failed for flight ingestion batch of {Count} aircraft. " +
                "This poll's data is lost. Next run will attempt a fresh batch.",
                vehicles.Count);
            return 0;
        }
    }

    private static DataTable BuildDataTable(IReadOnlyList<OpenSkyVehicle> vehicles)
    {
        var table = new DataTable();
        table.Columns.Add("source",      typeof(string));
        table.Columns.Add("vehicle_id",  typeof(string));
        table.Columns.Add("label",       typeof(string));
        table.Columns.Add("latitude",    typeof(double));
        table.Columns.Add("longitude",   typeof(double));
        table.Columns.Add("altitude_m",  typeof(double));
        table.Columns.Add("speed_kmh",   typeof(double));
        table.Columns.Add("heading",     typeof(double));
        table.Columns.Add("on_ground",   typeof(bool));
        table.Columns.Add("raw_json",    typeof(string));
        table.Columns.Add("ingested_at", typeof(DateTime));

        var now = DateTime.UtcNow;

        foreach (var v in vehicles)
        {
            // OpenSky velocity is in m/s; convert to km/h for unified schema
            double? speedKmh = v.Velocity.HasValue ? v.Velocity.Value * 3.6 : null;

            var rawPayload = JsonSerializer.Serialize(new
            {
                icao24          = v.Icao24,
                callsign        = v.Callsign,
                origin_country  = v.OriginCountry,
                latitude        = v.Latitude,
                longitude       = v.Longitude,
                baro_altitude   = v.BaroAltitude,
                velocity        = v.Velocity,
                true_track      = v.TrueTrack,
                on_ground       = v.OnGround
            });

            table.Rows.Add(
                "flight",
                v.Icao24,
                v.Callsign,
                v.Latitude!.Value,
                v.Longitude!.Value,
                v.BaroAltitude.HasValue   ? (object)v.BaroAltitude.Value  : DBNull.Value,
                speedKmh.HasValue         ? (object)speedKmh.Value         : DBNull.Value,
                v.TrueTrack.HasValue      ? (object)v.TrueTrack.Value      : DBNull.Value,
                v.OnGround,
                rawPayload,
                now
            );
        }

        return table;
    }

    private static void MapColumns(SqlBulkCopy bulk)
    {
        bulk.ColumnMappings.Add("source",      "source");
        bulk.ColumnMappings.Add("vehicle_id",  "vehicle_id");
        bulk.ColumnMappings.Add("label",       "label");
        bulk.ColumnMappings.Add("latitude",    "latitude");
        bulk.ColumnMappings.Add("longitude",   "longitude");
        bulk.ColumnMappings.Add("altitude_m",  "altitude_m");
        bulk.ColumnMappings.Add("speed_kmh",   "speed_kmh");
        bulk.ColumnMappings.Add("heading",     "heading");
        bulk.ColumnMappings.Add("on_ground",   "on_ground");
        bulk.ColumnMappings.Add("raw_json",    "raw_json");
        bulk.ColumnMappings.Add("ingested_at", "ingested_at");
    }
}
