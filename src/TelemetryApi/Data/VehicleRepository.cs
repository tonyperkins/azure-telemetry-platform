using Dapper;
using Microsoft.ApplicationInsights;
using Microsoft.ApplicationInsights.DataContracts;
using Microsoft.Data.SqlClient;
using Polly;
using TelemetryApi.Models;

namespace TelemetryApi.Data;

/// <summary>
/// Dapper-based repository for vehicle position queries.
///
/// SRE: We chose Dapper over Entity Framework Core deliberately.
/// EF's query translation adds an abstraction layer that can produce
/// suboptimal SQL — particularly for the window-function pattern needed
/// by /api/vehicles/current (latest-per-vehicle-id). With Dapper, the
/// SQL is explicit, reviewable, and tunable. Performance is predictable.
/// </summary>
public sealed class VehicleRepository
{
    private readonly DbConnectionFactory _connectionFactory;
    private readonly TelemetryClient     _telemetry;
    private readonly ILogger<VehicleRepository> _logger;

    public VehicleRepository(
        DbConnectionFactory connectionFactory,
        TelemetryClient telemetry,
        ILogger<VehicleRepository> logger)
    {
        _connectionFactory = connectionFactory;
        _telemetry         = telemetry;
        _logger            = logger;
    }

    /// <summary>
    /// Returns the most recent position per unique vehicle_id, within the
    /// last 5 minutes. If a source has not reported in 5 minutes, it returns
    /// an empty set — stale positions are never surfaced to the dashboard.
    ///
    /// SRE: The ROW_NUMBER() window function gives us "latest per group"
    /// without a correlated subquery. On a large table this is significantly
    /// faster. The index IX_vehicles_source_ingested covers the WHERE clause
    /// and sort, so no table scan occurs.
    /// </summary>
    public async Task<IEnumerable<Vehicle>> GetCurrentVehiclesAsync(string? source = null)
    {
        const string sql = """
            WITH ranked AS (
                SELECT *,
                       ROW_NUMBER() OVER (
                           PARTITION BY vehicle_id
                           ORDER BY ingested_at DESC
                       ) AS rn
                FROM dbo.vehicles
                WHERE ingested_at >= DATEADD(minute, -5, GETUTCDATE())
                  AND (@Source IS NULL OR source = @Source)
            )
            SELECT id         AS Id,
                   source     AS Source,
                   vehicle_id AS VehicleId,
                   label      AS Label,
                   latitude   AS Latitude,
                   longitude  AS Longitude,
                   altitude_m AS AltitudeM,
                   speed_kmh  AS SpeedKmh,
                   heading    AS Heading,
                   on_ground  AS OnGround,
                   raw_json   AS RawJson,
                   ingested_at AS IngestedAt
            FROM ranked
            WHERE rn = 1
            ORDER BY source, vehicle_id;
            """;

        return await ExecuteQueryAsync<Vehicle>(
            sql,
            new { Source = source },
            nameof(GetCurrentVehiclesAsync));
    }

    /// <summary>
    /// Returns the position history for a single vehicle over the requested
    /// time window. Hours is capped server-side at 6 to prevent runaway
    /// queries on vehicles with dense history.
    ///
    /// SRE: The cap is enforced in the repository, not in the endpoint handler.
    /// Business rules belong close to the data layer so they apply regardless
    /// of how many endpoints evolve to call this method.
    /// </summary>
    public async Task<IEnumerable<Vehicle>> GetVehicleHistoryAsync(string vehicleId, int hours)
    {
        // SRE: Cap at 6 hours. A 24h window on a busy bus route could return
        // 2880 rows (every 30s). This protects SQL CPU and response payload size.
        var clampedHours = Math.Clamp(hours, 1, 6);

        const string sql = """
            SELECT id         AS Id,
                   source     AS Source,
                   vehicle_id AS VehicleId,
                   label      AS Label,
                   latitude   AS Latitude,
                   longitude  AS Longitude,
                   altitude_m AS AltitudeM,
                   speed_kmh  AS SpeedKmh,
                   heading    AS Heading,
                   on_ground  AS OnGround,
                   raw_json   AS RawJson,
                   ingested_at AS IngestedAt
            FROM dbo.vehicles
            WHERE vehicle_id  = @VehicleId
              AND ingested_at >= DATEADD(hour, -@Hours, GETUTCDATE())
            ORDER BY ingested_at DESC;
            """;

        return await ExecuteQueryAsync<Vehicle>(
            sql,
            new { VehicleId = vehicleId, Hours = clampedHours },
            nameof(GetVehicleHistoryAsync));
    }

    /// <summary>
    /// Returns per-source health data for /api/health — last ingest time
    /// and current vehicle count within the last 5 minutes.
    /// </summary>
    public async Task<IEnumerable<(string Source, DateTime? LastIngest, int Count)>> GetSourceHealthAsync()
    {
        const string sql = """
            SELECT source         AS Source,
                   MAX(ingested_at) AS LastIngest,
                   COUNT(DISTINCT vehicle_id) AS VehicleCount
            FROM dbo.vehicles
            WHERE ingested_at >= DATEADD(minute, -15, GETUTCDATE())
            GROUP BY source;
            """;

        try
        {
            using var conn = _connectionFactory.CreateConnection();
            var rows = await conn.QueryAsync<(string Source, DateTime? LastIngest, int VehicleCount)>(sql);
            return rows.Select(r => (r.Source, r.LastIngest, r.VehicleCount));
        }
        catch (SqlException ex)
        {
            // SRE: SQL failures on the health endpoint must not return 500.
            // If the DB itself is down, we return "unhealthy" for all sources
            // rather than an unhandled exception. The health endpoint is the
            // primary signal for on-call alerts — it must always respond.
            _logger.LogError(ex, "SQL error in GetSourceHealthAsync");
            _telemetry.TrackException(ex, new Dictionary<string, string>
            {
                ["operation"] = nameof(GetSourceHealthAsync)
            });
            return Enumerable.Empty<(string, DateTime?, int)>();
        }
    }

    /// <summary>
    /// Returns metrics data: vehicle counts, last ingest times, poll counts,
    /// and database record statistics for /api/metrics.
    /// </summary>
    public async Task<(int MetroCount, DateTime? MetroLastIngest, int MetroPollsLast1h,
                       int FlightCount, DateTime? FlightLastIngest, int FlightPollsLast1h,
                       long RecordsLast24h, DateTime? OldestRecord)> GetMetricsAsync()
    {
        // SRE: Two queries consolidated into one round-trip to reduce latency.
        // GROUPING SETS is used to compute per-source and aggregate stats
        // in a single pass over the table.
        const string sql = """
            SELECT
                source,
                COUNT(DISTINCT vehicle_id)                             AS vehicle_count,
                MAX(ingested_at)                                       AS last_ingest,
                COUNT(DISTINCT CAST(ingested_at AS SMALLDATETIME))     AS polls_last_1h
            FROM dbo.vehicles
            WHERE ingested_at >= DATEADD(hour, -1, GETUTCDATE())
            GROUP BY source

            SELECT COUNT(*)        AS records_last_24h,
                   MIN(ingested_at) AS oldest_record
            FROM dbo.vehicles
            WHERE ingested_at >= DATEADD(hour, -24, GETUTCDATE());
            """;

        try
        {
            using var conn = _connectionFactory.CreateConnection();
            using var multi = await conn.QueryMultipleAsync(sql);

            var sourceCounts = (await multi.ReadAsync<dynamic>()).ToList();
            var dbStats      = await multi.ReadFirstOrDefaultAsync<dynamic>();

            int    metroCount        = 0;
            DateTime? metroLast     = null;
            int    metroPollsLast1h  = 0;
            int    flightCount       = 0;
            DateTime? flightLast    = null;
            int    flightPollsLast1h = 0;

            foreach (var row in sourceCounts)
            {
                if (row.source == "metro")
                {
                    metroCount        = (int)row.vehicle_count;
                    metroLast         = (DateTime?)row.last_ingest;
                    metroPollsLast1h  = (int)row.polls_last_1h;
                }
                else if (row.source == "flight")
                {
                    flightCount       = (int)row.vehicle_count;
                    flightLast        = (DateTime?)row.last_ingest;
                    flightPollsLast1h = (int)row.polls_last_1h;
                }
            }

            long     records24h   = dbStats != null ? (long)dbStats.records_last_24h  : 0L;
            DateTime? oldestRecord = dbStats != null ? (DateTime?)dbStats.oldest_record : null;

            return (metroCount, metroLast, metroPollsLast1h,
                    flightCount, flightLast, flightPollsLast1h,
                    records24h, oldestRecord);
        }
        catch (SqlException ex)
        {
            _logger.LogError(ex, "SQL error in GetMetricsAsync");
            _telemetry.TrackException(ex, new Dictionary<string, string>
            {
                ["operation"] = nameof(GetMetricsAsync)
            });
            return (0, null, 0, 0, null, 0, 0L, null);
        }
    }

    /// <summary>
    /// Returns the recent position trail for a single vehicle as lightweight
    /// PathPoint records (lat/lon/timestamp only — no raw_json).
    ///
    /// Used by the dashboard to draw:
    ///   - Flight trail polylines (last 20 min, ≤40 points at 30s poll)
    ///   - Metro route progress overlays (last 90 min covers a full route run)
    ///
    /// SRE: TOP 120 cap prevents runaway scans. At 30s poll rate, 120 rows
    /// covers 60 minutes of dense history — more than enough for visual trails.
    /// </summary>
    public async Task<IEnumerable<PathPoint>> GetVehiclePathAsync(string vehicleId, int minutes)
    {
        var clampedMinutes = Math.Clamp(minutes, 1, 120);

        const string sql = """
            SELECT TOP 120
                   latitude    AS Latitude,
                   longitude   AS Longitude,
                   ingested_at AS IngestedAt
            FROM dbo.vehicles
            WHERE vehicle_id  = @VehicleId
              AND ingested_at >= DATEADD(minute, -@Minutes, GETUTCDATE())
            ORDER BY ingested_at ASC;
            """;

        return await ExecuteQueryAsync<PathPoint>(
            sql,
            new { VehicleId = vehicleId, Minutes = clampedMinutes },
            nameof(GetVehiclePathAsync));
    }

    /// <summary>
    /// Returns recent paths for ALL active vehicles of a given source in one
    /// query — used by the dashboard on initial load to avoid N separate
    /// per-vehicle requests.
    ///
    /// SRE: A single query with ROW_NUMBER() is far cheaper than N separate
    /// queries fired in parallel. At 20 active flights × 40 rows each = 800
    /// rows per call; well within SQL Serverless DTU budget.
    /// </summary>
    public async Task<IEnumerable<(string VehicleId, PathPoint Point)>> GetBatchPathsAsync(
        string source, int minutes)
    {
        var clampedMinutes = Math.Clamp(minutes, 1, 120);

        const string sql = """
            SELECT vehicle_id  AS VehicleId,
                   latitude    AS Latitude,
                   longitude   AS Longitude,
                   ingested_at AS IngestedAt
            FROM dbo.vehicles
            WHERE source      = @Source
              AND ingested_at >= DATEADD(minute, -@Minutes, GETUTCDATE())
            ORDER BY vehicle_id, ingested_at ASC;
            """;

        try
        {
            using var conn = _connectionFactory.CreateConnection();
            var rows = await conn.QueryAsync<(string VehicleId, double Latitude, double Longitude, DateTime IngestedAt)>(
                sql, new { Source = source, Minutes = clampedMinutes });

            return rows.Select(r => (r.VehicleId, new PathPoint
            {
                Latitude   = r.Latitude,
                Longitude  = r.Longitude,
                IngestedAt = r.IngestedAt,
            }));
        }
        catch (SqlException ex)
        {
            _logger.LogError(ex, "SQL error in {Operation}. Returning empty result set.", nameof(GetBatchPathsAsync));
            _telemetry.TrackException(ex, new Dictionary<string, string> { ["operation"] = nameof(GetBatchPathsAsync) });
            return Enumerable.Empty<(string, PathPoint)>();
        }
    }

    /// <summary>
    /// SRE: Retrieves a system status value by key.
    /// </summary>
    public async Task<(string? value, DateTime? updatedAt)> GetStatusAsync(string source, string key)
    {
        const string sql = "SELECT status_value AS value, updated_at AS updatedAt FROM dbo.system_status WHERE source = @Source AND status_key = @Key";
        
        try
        {
            using var conn = _connectionFactory.CreateConnection();
            var row = await conn.QueryFirstOrDefaultAsync<(string? value, DateTime? updatedAt)>(sql, new { Source = source, Key = key });
            return (row.value, row.updatedAt);
        }
        catch (SqlException ex)
        {
            _logger.LogError(ex, "SQL error in GetStatusAsync for {Source}:{Key}", source, key);
            return (null, null);
        }
    }

    /// <summary>
    /// SRE: Updates or inserts a system status value.
    /// </summary>
    public async Task UpdateStatusAsync(string source, string key, string value)
    {
        const string sql = @"
            IF EXISTS (SELECT 1 FROM dbo.system_status WHERE source = @source AND status_key = @key)
                UPDATE dbo.system_status SET status_value = @value, updated_at = GETUTCDATE()
                WHERE source = @source AND status_key = @key
            ELSE
                INSERT INTO dbo.system_status (source, status_key, status_value, updated_at)
                VALUES (@source, @key, @value, GETUTCDATE())";

        try
        {
            using var conn = _connectionFactory.CreateConnection();
            await conn.ExecuteAsync(sql, new { source, key, value });
        }
        catch (SqlException ex)
        {
            _logger.LogError(ex, "SQL error in UpdateStatusAsync for {Source}:{Key}", source, key);
        }
    }

    /// <summary>
    /// SRE: Retrieves system status values (like rate limits or circuit breaker states).
    /// Used by the management and health endpoints to provide accurate diagnostic info
    /// that matches the ingestion service's actual experience.
    /// </summary>
    public async Task<IEnumerable<(string Source, string Key, string Value, DateTime UpdatedAt)>> GetSystemStatusAsync(string? source = null)
    {
        const string sql = @"
            SELECT source       AS Source,
                   status_key   AS [Key],
                   status_value AS Value,
                   updated_at   AS UpdatedAt
            FROM dbo.system_status
            WHERE @Source IS NULL OR source = @Source;";

        try
        {
            using var conn = _connectionFactory.CreateConnection();
            var rows = await conn.QueryAsync<(string Source, string Key, string Value, DateTime UpdatedAt)>(sql, new { Source = source });
            return rows;
        }
        catch (SqlException ex)
        {
            _logger.LogError(ex, "SQL error in GetSystemStatusAsync");
            return Enumerable.Empty<(string, string, string, DateTime)>();
        }
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    private async Task<IEnumerable<T>> ExecuteQueryAsync<T>(
        string sql, object parameters, string operationName)
    {
        var retryPolicy = Policy
            .Handle<SqlException>(ex => 
                // Handle Azure SQL Serverless Auto-Pause wake-up timeouts (-2) or connection drops
                ex.Number == -2 || ex.Number == 40613 || ex.Number == 40197) 
            .WaitAndRetryAsync(3, retryAttempt => 
                TimeSpan.FromSeconds(retryAttempt == 1 ? 2 : (retryAttempt == 2 ? 10 : 20)),
                (exception, timeSpan, context) =>
                {
                    _logger.LogWarning(exception, $"SQL Serverless connection failed in {operationName}. Retrying in {timeSpan.TotalSeconds} seconds.");
                }
            );

        try
        {
            return await retryPolicy.ExecuteAsync(async () =>
            {
                using var conn = _connectionFactory.CreateConnection();
                return await conn.QueryAsync<T>(sql, parameters);
            });
        }
        catch (SqlException ex)
        {
            // SRE: SQL exceptions are caught per-query, not per-request.
            // The endpoint returns an empty result set rather than a 500.
            // This means a transient SQL blip degrades gracefully to "0 vehicles"
            // on the dashboard rather than breaking the entire page load.
            // The exception is tracked in Application Insights so the on-call
            // engineer can see it in the failures blade without needing log digging.
            _logger.LogError(ex,
                "SQL error in {Operation}. Returning empty result set after retries.",
                operationName);

            _telemetry.TrackException(ex, new Dictionary<string, string>
            {
                ["operation"] = operationName,
                ["sql"]       = sql[..Math.Min(sql.Length, 200)]
            });

            return Enumerable.Empty<T>();
        }
    }
}
