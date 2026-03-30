-- =============================================================================
-- Migration: Add dbo.system_status table
--
-- SRE: This table synchronizes health events (like rate limits or circuit 
-- breaker states) between the ingestion service and the API. This ensures 
-- that the dashboard provides a "single source of truth" even during
-- upstream provider outages or throttling.
-- =============================================================================

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'system_status')
BEGIN
    CREATE TABLE dbo.system_status (
        source       VARCHAR(50) NOT NULL,
        status_key   VARCHAR(100) NOT NULL,
        status_value VARCHAR(MAX),
        updated_at   DATETIME NOT NULL DEFAULT GETUTCDATE(),
        CONSTRAINT PK_system_status PRIMARY KEY (source, status_key)
    );
END
GO
