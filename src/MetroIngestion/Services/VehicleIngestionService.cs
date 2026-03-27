using MetroIngestion.Models;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Logging;
using System.Data;
using System.Text.Json;

namespace MetroIngestion.Services;

/// <summary>
/// Persists parsed metro vehicles to the unified vehicles table using
/// SqlBulkCopy for high-throughput batch inserts.
///
/// SRE: SqlBulkCopy is used instead of individual INSERT statements because
/// the metro feed can return 150 buses every 30 seconds. That is 300 INSERT
/// round-trips per minute vs. one BulkCopy operation. At scale, individual
/// inserts would saturate the SQL DTU budget on a serverless database tier.
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
    /// Bulk-inserts a batch of metro vehicles into dbo.vehicles.
    /// Returns the number of rows inserted.
    /// </summary>
    public async Task<int> BulkInsertAsync(IReadOnlyList<MetroVehicle> vehicles)
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

            _logger.LogDebug("BulkCopy wrote {Count} metro rows.", vehicles.Count);
            return vehicles.Count;
        }
        catch (SqlException ex)
        {
            // SRE: SQL failures during ingestion are logged but not re-thrown.
            // Losing one 30-second poll is acceptable; crashing the Function
            // host would cause additional missed polls during cold-start recovery.
            _logger.LogError(ex,
                "SqlBulkCopy failed for metro ingestion batch of {Count} vehicles. " +
                "This poll's data is lost. Next run will attempt a fresh batch.",
                vehicles.Count);
            return 0;
        }
    }

    private static DataTable BuildDataTable(IReadOnlyList<MetroVehicle> vehicles)
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
            // GTFS-RT speed is in meters/second; convert to km/h for the unified schema
            double? speedKmh = v.Speed.HasValue ? v.Speed.Value * 3.6 : null;

            var rawPayload = JsonSerializer.Serialize(new
            {
                vehicle_id = v.VehicleId,
                route_id   = v.RouteId,
                trip_id    = v.TripId,
                bearing    = v.Bearing,
                speed      = v.Speed,
                timestamp  = v.Timestamp
            });

            table.Rows.Add(
                "metro",
                v.VehicleId,
                v.RouteId,          // label = route number for buses
                v.Latitude,
                v.Longitude,
                DBNull.Value,       // altitude_m: not applicable for ground vehicles
                speedKmh.HasValue ? (object)speedKmh.Value : DBNull.Value,
                v.Bearing.HasValue  ? (object)(double)v.Bearing.Value : DBNull.Value,
                DBNull.Value,       // on_ground: not applicable for buses
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
