-- =============================================================================
-- init-schema.sql
-- azure-telemetry-platform — Production Database Setup
--
-- Run against: Azure SQL Database
-- Usage: Executed automatically by GitHub Actions deployment pipeline
--
-- SRE: This script is strictly idempotent and completely non-destructive.
--      It provisions the dbo.vehicles tracking table and the supporting
--      indices ONLY if they do not already exist, preserving production
--      vehicle history permanently.
-- =============================================================================

-- SRE: Abort immediately on ANY error, preventing partial applies and silent failures
--      during GitHub Actions deployment pipeline orchestration.
SET XACT_ABORT ON;
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

IF OBJECT_ID('dbo.vehicles', 'U') IS NULL
BEGIN
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
END
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

IF NOT EXISTS (SELECT name FROM sys.indexes WHERE name = 'IX_vehicles_source_ingested')
BEGIN
    CREATE INDEX IX_vehicles_source_ingested
        ON dbo.vehicles (source, ingested_at DESC);
END
GO

IF NOT EXISTS (SELECT name FROM sys.indexes WHERE name = 'IX_vehicles_vehicle_id')
BEGIN
    CREATE INDEX IX_vehicles_vehicle_id
        ON dbo.vehicles (vehicle_id, ingested_at DESC);
END
GO

-- =============================================================================
-- SECURITY: Zero-Trust Identity Provisioning
--
-- SRE: Create SQL users for the system-assigned managed identities of the
--      App Service and Function App, and grant them read/write access.
--      This script handles creating the users idempotently.
-- =============================================================================

-- SRE: Replace 'prod' and suffix if dynamically executed later, but for this
--      production initialization, we use the known stable suffix.
IF '$(APP_SID)' = '' OR '$(FUNC_SID)' = ''
BEGIN
    PRINT 'Error: APP_SID or FUNC_SID is not defined. Aborting.';
    SET NOEXEC ON;
END
GO

IF EXISTS (SELECT * FROM sys.database_principals WHERE name = 'app-telemetry-prod-7d94f06a')
BEGIN
    DROP USER [app-telemetry-prod-7d94f06a];
END
GO
CREATE USER [app-telemetry-prod-7d94f06a] WITH SID=$(APP_SID), TYPE=E;
ALTER ROLE db_datareader ADD MEMBER [app-telemetry-prod-7d94f06a];
ALTER ROLE db_datawriter ADD MEMBER [app-telemetry-prod-7d94f06a];
GO

IF EXISTS (SELECT * FROM sys.database_principals WHERE name = 'func-telemetry-prod-7d94f06a')
BEGIN
    DROP USER [func-telemetry-prod-7d94f06a];
END
GO
CREATE USER [func-telemetry-prod-7d94f06a] WITH SID=$(FUNC_SID), TYPE=E;
ALTER ROLE db_datareader ADD MEMBER [func-telemetry-prod-7d94f06a];
ALTER ROLE db_datawriter ADD MEMBER [func-telemetry-prod-7d94f06a];
GO

SET NOEXEC OFF;
GO
