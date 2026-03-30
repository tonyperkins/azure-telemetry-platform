using TelemetryFunctions.Models;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Logging;
using System.Data;
using System.Text.Json;

namespace TelemetryFunctions.Services;

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

            // SRE: Force the connection into the intended database context.
            // Managed Identity connections can sometimes default to 'master' if the 
            // identity's default database isn't set. We use the Database property 
            // (set via Initial Catalog in the connection string) to ensure we're 
            // in the correct context before starting bulk operations.
            var databaseName = conn.Database;
            if (!string.IsNullOrEmpty(databaseName))
            {
                using var useDb = new SqlCommand($"USE [{databaseName}];", conn);
                await useDb.ExecuteNonQueryAsync();
            }

            // SRE: SqlBulkCopyOptions.UseInternalTransaction = false (default) means
            // SqlBulkCopy will use the existing connection rather than opening a second
            // internal connection via its own transaction. This prevents the Error 916
            // where the secondary connection lands on master instead of TelemetryDb.
            using var bulk = new SqlBulkCopy(conn, SqlBulkCopyOptions.Default, externalTransaction: null)
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
            // Losing one 30-second poll is acceptable.
            _logger.LogError(ex,
                "SqlBulkCopy failed for metro ingestion batch of {Count} vehicles. Error: {Error}. Message: {Message}",
                vehicles.Count, ex.Number, ex.Message);
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

            // SRE: Force the connection into the intended database context.
            // Using conn.Database (from Initial Catalog) to ensure we're in the 
            // right catalog before starting bulk operations, especially when 
            // using Managed Identity which can default to master.
            var databaseName = conn.Database;
            if (!string.IsNullOrEmpty(databaseName))
            {
                using var useDb = new SqlCommand($"USE [{databaseName}];", conn);
                await useDb.ExecuteNonQueryAsync();
            }

            using var bulk = new SqlBulkCopy(conn, SqlBulkCopyOptions.Default, externalTransaction: null)
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
            _logger.LogError(ex,
                "SqlBulkCopy failed for flight ingestion batch of {Count} aircraft. Error: {Error}. Message: {Message}",
                vehicles.Count, ex.Number, ex.Message);
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
