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

    // SRE: Run every 6 hours rather than once daily.
    // The original daily schedule meant the table could accumulate ~24h × 4 feeds × 2/min
    // = 576K rows between runs. At 30s poll frequency across both sources that's enough
    // to fill the 5 GB quota over a long outage or if feeds spike. Running 4× per day
    // keeps the watermark low and ensures any backlog drains quickly.
    [Function("RetentionCleanup")]
    public async Task RunAsync([TimerTrigger("0 0 */6 * * *")] TimerInfo timer)
    {
        var sw = Stopwatch.StartNew();

        _logger.LogInformation(
            "SRE: Retention cleanup started. IsPastDue={IsPastDue}. Deleting records older than 24 hours.",
            timer.IsPastDue);

        // SRE: Batch deletes in chunks of 5000 to avoid long-running transactions
        // and excessive log growth. The 1-second delay between batches lets the
        // SQL Serverless auto-scaler breathe and prevents lock escalation on the
        // full-table IX_vehicles_source_ingested index.
        // commandTimeout is 600s (10 min) to handle large catch-up backlogs.
        const string sql = @"
            DECLARE @DeletedRows INT = 1;
            DECLARE @TotalDeleted INT = 0;
            DECLARE @BatchNum    INT = 0;

            WHILE @DeletedRows > 0
            BEGIN
                DELETE TOP (5000)
                FROM dbo.vehicles
                WHERE ingested_at < DATEADD(hour, -24, GETUTCDATE());

                SET @DeletedRows  = @@ROWCOUNT;
                SET @TotalDeleted = @TotalDeleted + @DeletedRows;
                SET @BatchNum     = @BatchNum + 1;

                IF @DeletedRows > 0
                BEGIN
                    WAITFOR DELAY '00:00:01';
                END
            END

            SELECT @TotalDeleted;
        ";

        try
        {
            using var conn = await _connectionFactory.CreateConnectionAsync();
            var deletedCount = await conn.ExecuteScalarAsync<int>(sql, commandTimeout: 600);

            sw.Stop();

            _telemetry.TrackMetric("retention_deleted_rows", deletedCount,
                new Dictionary<string, string> { ["source"] = "all" });

            _logger.LogInformation(
                "SRE: Retention cleanup complete. Deleted={Count} rows in {Ms}ms.",
                deletedCount, sw.ElapsedMilliseconds);
        }
        catch (SqlException ex)
        {
            sw.Stop();
            _logger.LogError(ex,
                "SRE: Retention cleanup FAILED after {Ms}ms. Error={Number}. " +
                "Table will accumulate until next scheduled run at next 6-hour mark.",
                sw.ElapsedMilliseconds, ex.Number);

            _telemetry.TrackException(ex, new Dictionary<string, string>
            {
                ["operation"] = "RetentionCleanup",
                ["sqlErrorNumber"] = ex.Number.ToString()
            });
        }
    }
}
