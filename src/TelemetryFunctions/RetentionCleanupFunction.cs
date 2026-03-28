using Microsoft.ApplicationInsights;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using System.Diagnostics;
using Dapper;
using TelemetryFunctions.Data;

namespace TelemetryFunctions;

/// <summary>
/// Azure Function — C# Timer Trigger, runs daily at 2:00 AM UTC.
/// Deletes vehicle records older than 24 hours from the vehicles table.
///
/// SRE: Retention cleanup is a first-class operational concern, not an
/// afterthought. Without it, two consequences compound over time:
///
///   1. COST: Azure SQL Serverless bills on storage as well as compute.
///      14,400 records/day (metro: ~120 buses × 2/min × 60min) × 365 days
///      = ~5.2M rows/year at ~200 bytes each = ~1 GB/year.
///      The serverless 1-vCore tier includes 5 GB — we'd exceed it in ~5 years,
///      but query performance degrades well before that threshold is hit.
///
///   2. PERFORMANCE: The covering index IX_vehicles_source_ingested scans
///      (source, ingested_at DESC). As the table grows, even indexed reads
///      touch more pages. Keeping the table at ~14,400 rows (24h window)
///      rather than millions ensures consistent sub-10ms query latency.
///
/// Running at 2 AM UTC (8 PM CST) minimises contention with peak-hour
/// metro bus traffic (6-9 AM and 3-7 PM CST).
/// </summary>
public sealed class RetentionCleanupFunction
{
    private readonly TelemetryClient  _telemetry;
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ILogger<RetentionCleanupFunction> _logger;

    public RetentionCleanupFunction(
        TelemetryClient telemetry,
        IDbConnectionFactory connectionFactory,
        ILogger<RetentionCleanupFunction> logger)
    {
        _telemetry = telemetry;
        _connectionFactory = connectionFactory;
        _logger    = logger;
    }

    [Function("RetentionCleanup")]
    public async Task RunAsync([TimerTrigger("0 0 2 * * *")] TimerInfo timer)
    {
        var sw = Stopwatch.StartNew();

        _logger.LogInformation(
            "Retention cleanup started. Deleting records older than 24 hours.");

        const string sql = @"
            DECLARE @DeletedRows INT = 1;
            DECLARE @TotalDeleted INT = 0;

            WHILE @DeletedRows > 0
            BEGIN
                DELETE TOP (5000) 
                FROM dbo.vehicles 
                WHERE ingested_at < DATEADD(hour, -24, GETUTCDATE());

                SET @DeletedRows = @@ROWCOUNT;
                SET @TotalDeleted = @TotalDeleted + @DeletedRows;

                IF @DeletedRows > 0
                BEGIN
                    WAITFOR DELAY '00:00:01';
                END
            END
            
            SELECT @TotalDeleted;
        ";

        try
        {
            await using var conn = await _connectionFactory.CreateConnectionAsync();
            var result = await conn.ExecuteScalarAsync<int>(sql, commandTimeout: 120);
            var deletedCount = result;

            sw.Stop();

            // SRE: Track deleted record count as a custom metric.
            // A sudden spike (e.g., 50,000 records deleted instead of the
            // expected ~14,400) could indicate a feed bug that wrote duplicate
            // records. Monitoring this metric catches data anomalies retroactively.
            _telemetry.TrackMetric("records_deleted", deletedCount,
                new Dictionary<string, string> { ["source"] = "all" });

            _logger.LogInformation(
                "Retention cleanup complete: {Count} records deleted in {Ms}ms.",
                deletedCount, sw.ElapsedMilliseconds);
        }
        catch (SqlException ex)
        {
            // SRE: If the DELETE fails (e.g., SQL server under load, lock timeout),
            // log the error and let the next daily run handle it. The table will
            // accumulate an extra 24h of data but will not grow unboundedly.
            // Do NOT retry here — a failed DELETE at 2 AM that retries immediately
            // could cause extended lock contention during the next morning's peak traffic.
            _logger.LogError(ex,
                "Retention cleanup failed. Table may have accumulated extra rows. " +
                "Next scheduled run will clean up. Do not retry manually unless table is " +
                "approaching storage limits.");

            _telemetry.TrackException(ex, new Dictionary<string, string>
            {
                ["operation"] = "RetentionCleanup"
            });
        }
    }
}
