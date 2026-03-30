# =============================================================================
# module/sql — Azure SQL Server + Serverless Database
#
# SRE: Serverless tier with auto-pause is chosen over provisioned compute
# because this workload has predictable off-peak quiet periods (2-6 AM).
# Auto-pause after 60 minutes of inactivity reduces cost to near-zero during
# those windows. On first query after resume, cold-start latency is ~10-30s —
# acceptable for a non-interactive ingestion workload.
# =============================================================================

resource "azurerm_mssql_server" "main" {
  name                         = "sql-telemetry-${var.environment}-${var.suffix}"
  resource_group_name          = var.resource_group_name
  location                     = var.location
  version                      = "12.0"
  administrator_login          = "sqladmin"
  administrator_login_password = var.sql_admin_password

  identity {
    type = "SystemAssigned"
  }

  # SRE: Managed Identity access (via Key Vault references in App Service)
  # means the admin password is only used for emergency break-glass access.
  # It is stored in Key Vault and rotated quarterly.
  azuread_administrator {
    login_username = "sqladmin-aad"
    object_id      = data.azurerm_client_config.current.object_id
  }

  tags = var.tags
}

data "azurerm_client_config" "current" {}

# =============================================================================
# SRE: Grant the SQL Server's system-assigned Managed Identity the
# "Directory Readers" role in Entra ID.
#
# FROM EXTERNAL PROVIDER requires the SQL server to query Entra ID to resolve
# managed identity display names to SIDs. Without this role assignment, every
# CREATE USER ... FROM EXTERNAL PROVIDER fails with Msg 37353.
#
# This is a one-time tenant-level assignment. Terraform manages it so it
# survives server recreation and is not forgotten between deployments.
# =============================================================================

data "azuread_directory_role" "directory_readers" {
  display_name = "Directory Readers"
}

resource "azuread_directory_role_member" "sql_directory_readers" {
  role_object_id   = data.azuread_directory_role.directory_readers.object_id
  member_object_id = azurerm_mssql_server.main.identity[0].principal_id
}

resource "azurerm_mssql_database" "main" {
  name      = "TelemetryDb"
  server_id = azurerm_mssql_server.main.id

  # Serverless — scales compute between 0.5 and 1 vCore on demand
  sku_name                    = "GP_S_Gen5_1"
  max_size_gb                 = 5
  auto_pause_delay_in_minutes = 60
  min_capacity                = 0.5

  # SRE: Zone redundancy is disabled on serverless tier (not available).
  # For a stateless read workload this is acceptable — a zone failure means
  # ~30s of failover delay, not data loss, since Azure SQL uses synchronous
  # replication between availability replicas.
  zone_redundant = false

  tags = var.tags
}

resource "azurerm_mssql_firewall_rule" "allow_azure_services" {
  name      = "AllowAzureServices"
  server_id = azurerm_mssql_server.main.id

  # Azure Magic IP: allows connections from all Azure services within the tenant
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}
