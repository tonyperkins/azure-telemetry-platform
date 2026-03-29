# =============================================================================
# module/functions — Storage Account + Windows Function App (consumption plan)
#
# All three Functions (MetroIngestion, FlightIngestion, RetentionCleanup)
# are deployed to the same Function App. They run in the same process but
# each has its own independent timer trigger — a failure in one Function
# does not affect the others (they catch their own exceptions).
# =============================================================================

resource "azurerm_storage_account" "main" {
  # SRE: Storage account names are globally unique, max 24 chars, alphanumeric only.
  # The suffix (from main.tf random_id) prevents name collisions across deployments.
  name                     = "stfunc${var.environment}${var.suffix}"
  resource_group_name      = var.resource_group_name
  location                 = var.location
  account_tier             = "Standard"
  account_replication_type = "LRS"

  # SRE: LRS (locally redundant) is sufficient for function state storage.
  # This is ephemeral trigger state, not business data. If the storage
  # account is lost, the Functions simply miss their next scheduled run —
  # a far less critical failure than losing the SQL database.

  tags = var.tags
}

resource "azurerm_windows_function_app" "main" {
  name                = "func-tlm-${var.environment}-${var.suffix}"
  resource_group_name = var.resource_group_name
  location            = var.location

  storage_account_name       = azurerm_storage_account.main.name
  storage_account_access_key = azurerm_storage_account.main.primary_access_key
  service_plan_id            = azurerm_service_plan.consumption.id

  identity {
    type = "SystemAssigned"
  }

  site_config {
    application_stack {
      dotnet_version              = "v8.0"
      use_dotnet_isolated_runtime = true
    }
  }

  app_settings = {
    "FUNCTIONS_WORKER_RUNTIME" = "dotnet-isolated"
    # SRE: Azure Functions runtime requires APPLICATIONINSIGHTS_CONNECTION_STRING
    # (not APPINSIGHTS_CONNECTION_STRING) for automatic distributed tracing
    # correlation. Using the wrong key results in Functions emitting telemetry
    # without parent operation IDs, breaking the end-to-end trace view.
    "APPLICATIONINSIGHTS_CONNECTION_STRING" = var.appinsights_connection_string
    "ENABLE_METRO_INGESTION"                = "true"
    "ENABLE_FLIGHT_INGESTION"               = "true"
    "METRO_FEED_URL"                        = var.metro_feed_url
    "OPENSKY_BBOX"                          = var.opensky_bbox
    "FILTER_ON_GROUND"                      = "true"
    # SRE: WEBSITE_RUN_FROM_PACKAGE=1 is required for zip-deploy (GitHub Actions
    # azure/functions-action). Without it, the deployment may succeed but the
    # Functions runtime will not pick up the new binaries.
    "WEBSITE_RUN_FROM_PACKAGE" = "1"
    # SRE: AzureWebJobsStorage is set implicitly via storage_account_name +
    # storage_account_access_key on the resource. We do not set it manually
    # here to avoid duplication and drift.

    # SRE: Key Vault reference for the SQL connection string.
    # The consumption plan Function App uses managed identity to resolve this.
    "SQL_CONNECTION_STRING" = "@Microsoft.KeyVault(SecretUri=${var.sql_secret_uri})"
    "OPENSKY_CLIENT_ID"     = "@Microsoft.KeyVault(SecretUri=${var.opensky_client_id_secret_uri})"
    "OPENSKY_CLIENT_SECRET" = "@Microsoft.KeyVault(SecretUri=${var.opensky_client_secret_secret_uri})"
  }

  tags = var.tags
}

resource "azurerm_service_plan" "consumption" {
  name                = "asp-func-${var.environment}"
  resource_group_name = var.resource_group_name
  location            = var.location
  os_type             = "Windows"
  sku_name            = "Y1" # Consumption plan

  tags = var.tags
}
