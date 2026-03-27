-- =============================================================================
-- seed-local-db.sql
-- azure-telemetry-platform — Local development database setup
--
-- Run against: SQL Server Express / LocalDB / Azure SQL
-- Usage: sqlcmd -S localhost\SQLEXPRESS -d master -i seed-local-db.sql
--        OR connect via SSMS and execute against your local instance
--
-- SRE: This script is idempotent. Re-running it will not duplicate data.
--      DROP/CREATE pattern ensures a clean dev environment every time.
-- =============================================================================

-- Create database if running against master
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'TelemetryDev')
BEGIN
    CREATE DATABASE TelemetryDev;
END
GO

USE TelemetryDev;
GO

-- =============================================================================
-- TABLE: vehicles
--
-- Unified schema for all telemetry sources. The 'source' discriminator column
-- allows the platform to ingest from any vehicle-type data source without
-- schema changes. Adding a maritime or cyclist source requires only a new
-- Azure Function, not a migration.
--
-- SRE: Raw JSON is stored alongside normalized fields. This enables replay
--      and re-parsing if the mapping logic changes, without re-fetching
--      from upstream feeds.
-- =============================================================================

IF OBJECT_ID('dbo.vehicles', 'U') IS NOT NULL
    DROP TABLE dbo.vehicles;
GO

CREATE TABLE dbo.vehicles (
    id              BIGINT IDENTITY(1,1) PRIMARY KEY,
    source          NVARCHAR(10)    NOT NULL,           -- 'metro' or 'flight'
    vehicle_id      NVARCHAR(50)    NOT NULL,           -- bus id or icao24
    label           NVARCHAR(100)   NULL,               -- route number or callsign
    latitude        FLOAT           NOT NULL,
    longitude       FLOAT           NOT NULL,
    altitude_m      FLOAT           NULL,               -- null for ground vehicles
    speed_kmh       FLOAT           NULL,
    heading         FLOAT           NULL,               -- degrees 0-360
    on_ground       BIT             NULL,               -- flight only; 1=on ground
    raw_json        NVARCHAR(MAX)   NULL,               -- full source payload for replay
    ingested_at     DATETIME2       NOT NULL DEFAULT GETUTCDATE()
);
GO

-- =============================================================================
-- INDEXES
--
-- SRE: Two covering indexes are the minimum required for production performance.
--
-- IX_vehicles_source_ingested: supports the primary read pattern —
--   "give me all vehicles for source X ingested in the last 5 minutes."
--   Composite (source, ingested_at DESC) means the query engine touches
--   only the narrow time window without scanning older rows.
--
-- IX_vehicles_vehicle_id: supports the history endpoint —
--   "give me all positions for vehicle X over the last N hours."
--   Without this, a history query for a busy bus route would full-scan
--   millions of rows.
-- =============================================================================

CREATE INDEX IX_vehicles_source_ingested
    ON dbo.vehicles (source, ingested_at DESC);
GO

CREATE INDEX IX_vehicles_vehicle_id
    ON dbo.vehicles (vehicle_id, ingested_at DESC);
GO

-- =============================================================================
-- SEED DATA — 10 rows (5 metro buses, 5 flight aircraft)
--
-- Timestamps are offset from GETUTCDATE() so the /api/health endpoint
-- reports "healthy" status immediately after seeding.
-- Coordinates are real positions around Austin, TX for visual verification
-- on the dashboard map.
-- =============================================================================

-- Metro buses (Capital Metro routes, realistic Austin coordinates)
INSERT INTO dbo.vehicles (source, vehicle_id, label, latitude, longitude, altitude_m, speed_kmh, heading, on_ground, raw_json, ingested_at)
VALUES
    ('metro', 'BUS-1842', 'Route 1 - Congress Ave',  30.2672, -97.7431, NULL, 32.5,  185.0, NULL,
     '{"vehicle_id":"BUS-1842","route_id":"1","trip_id":"T-00123","bearing":185,"speed":9.0,"timestamp":1711001000}',
     DATEADD(minute, -1, GETUTCDATE())),

    ('metro', 'BUS-2017', 'Route 7 - Duval',         30.3050, -97.7200, NULL, 28.0,  270.0, NULL,
     '{"vehicle_id":"BUS-2017","route_id":"7","trip_id":"T-00456","bearing":270,"speed":7.8,"timestamp":1711001010}',
     DATEADD(minute, -2, GETUTCDATE())),

    ('metro', 'BUS-1103', 'Route 10 - S Lamar',      30.2400, -97.7600, NULL, 40.0,  355.0, NULL,
     '{"vehicle_id":"BUS-1103","route_id":"10","trip_id":"T-00789","bearing":355,"speed":11.1,"timestamp":1711001020}',
     DATEADD(minute, -1, GETUTCDATE())),

    ('metro', 'BUS-3301', 'Route 801 - MetroRapid',  30.2750, -97.7350, NULL, 55.2,   90.0, NULL,
     '{"vehicle_id":"BUS-3301","route_id":"801","trip_id":"T-01011","bearing":90,"speed":15.3,"timestamp":1711001030}',
     DATEADD(minute, -3, GETUTCDATE())),

    ('metro', 'BUS-0912', 'Route 20 - Manor Rd',     30.2900, -97.6900, NULL, 18.0,  210.0, NULL,
     '{"vehicle_id":"BUS-0912","route_id":"20","trip_id":"T-01213","bearing":210,"speed":5.0,"timestamp":1711001040}',
     DATEADD(minute, -2, GETUTCDATE()));

-- Aircraft (OpenSky/ICAO24 identifiers, realistic approach paths into AUS)
INSERT INTO dbo.vehicles (source, vehicle_id, label, latitude, longitude, altitude_m, speed_kmh, heading, on_ground, raw_json, ingested_at)
VALUES
    ('flight', 'a12bc3', 'SWA2241',  30.1950, -97.6670, 1524.0, 450.0, 315.0, 0,
     '{"icao24":"a12bc3","callsign":"SWA2241","origin_country":"United States","latitude":30.1950,"longitude":-97.6670,"baro_altitude":1524,"velocity":125,"true_track":315,"on_ground":false}',
     DATEADD(minute, -1, GETUTCDATE())),

    ('flight', 'd45ef6', 'AAL1847',  30.3100, -97.8100, 3048.0, 680.0, 135.0, 0,
     '{"icao24":"d45ef6","callsign":"AAL1847","origin_country":"United States","latitude":30.3100,"longitude":-97.8100,"baro_altitude":3048,"velocity":188.9,"true_track":135,"on_ground":false}',
     DATEADD(minute, -2, GETUTCDATE())),

    ('flight', 'c78gh9', 'UAL502',   30.4200, -97.9500, 6096.0, 820.0,  45.0, 0,
     '{"icao24":"c78gh9","callsign":"UAL502","origin_country":"United States","latitude":30.4200,"longitude":-97.9500,"baro_altitude":6096,"velocity":227.8,"true_track":45,"on_ground":false}',
     DATEADD(minute, -1, GETUTCDATE())),

    ('flight', 'b11jk2', 'DAL3390',  30.0800, -97.5900, 914.0,  370.0, 280.0, 0,
     '{"icao24":"b11jk2","callsign":"DAL3390","origin_country":"United States","latitude":30.0800,"longitude":-97.5900,"baro_altitude":914,"velocity":102.8,"true_track":280,"on_ground":false}',
     DATEADD(minute, -3, GETUTCDATE())),

    ('flight', 'e99lm0', 'N5127T',   30.2100, -97.8500, 457.0,  220.0, 170.0, 0,
     '{"icao24":"e99lm0","callsign":"N5127T","origin_country":"United States","latitude":30.2100,"longitude":-97.8500,"baro_altitude":457,"velocity":61.1,"true_track":170,"on_ground":false}',
     DATEADD(minute, -2, GETUTCDATE()));
GO

-- =============================================================================
-- Verification query — run to confirm seed data loaded correctly
-- =============================================================================
SELECT
    source,
    COUNT(*)            AS vehicle_count,
    MAX(ingested_at)    AS last_ingested,
    MIN(ingested_at)    AS oldest_ingested
FROM dbo.vehicles
GROUP BY source;
GO
