# =============================================================================
# module/appservice — App Service Plan + Windows Web App (.NET 8)
# =============================================================================

resource "azurerm_service_plan" "main" {
  name                = "asp-telemetry-${var.environment}"
  resource_group_name = var.resource_group_name
  location            = var.location
  os_type             = "Windows"
  sku_name            = "F1"

  tags = var.tags
}

resource "azurerm_windows_web_app" "main" {
  name                = "app-telemetry-${var.environment}-${var.suffix}"
  resource_group_name = var.resource_group_name
  location            = var.location
  service_plan_id     = azurerm_service_plan.main.id

  # SRE: System-assigned managed identity is the principal that authenticates
  # to Key Vault. No client secrets, no stored credentials.
  identity {
    type = "SystemAssigned"
  }

  site_config {
    application_stack {
      current_stack  = "dotnet"
      dotnet_version = "v8.0"
    }
    # SRE: always_on is disabled for demo-at-rest mode.
    # The B1 plan supports it, but we intentionally leave it off to
    # avoid wasted compute when no demo is running. Cold-start latency
    # on first request is ~5–10s — acceptable for a portfolio demo.
    always_on = false

    # SRE: CORS is enforced at the platform level, not just in application code.
    # Setting it here ensures the restriction holds even if the app is
    # redeployed with a misconfigured CORS policy in Program.cs.
    cors {
      allowed_origins     = [var.allowed_origins]
      support_credentials = false
    }
  }

  app_settings = {
    "KeyVaultName"           = var.key_vault_name
    "ASPNETCORE_ENVIRONMENT" = var.environment == "prod" ? "Production" : "Staging"
    # SRE: Use APPLICATIONINSIGHTS_CONNECTION_STRING (not the legacy
    # APPINSIGHTS_INSTRUMENTATIONKEY). The connection string includes the
    # ingestion endpoint, which supports private link and regional routing.
    "APPLICATIONINSIGHTS_CONNECTION_STRING" = var.appinsights_connection_string
    "AllowedOrigins__0"                     = var.allowed_origins

    # SRE: Key Vault reference syntax. The App Service runtime resolves this
    # at startup via the managed identity — the raw connection string never
    # appears in app settings, environment variables, or deployment artifacts.
    "ConnectionStrings__DefaultConnection" = "@Microsoft.KeyVault(SecretUri=${var.sql_secret_uri})"
    "LogAnalyticsWorkspaceId"              = var.log_analytics_workspace_id
    "AppInsights__AppId"                   = var.app_insights_app_id
    "AppInsights__ApiKey"                  = var.app_insights_api_key

    # Management endpoints for SRE start/stop
    "AZURE_SUBSCRIPTION_ID"   = var.subscription_id
    "AZURE_RESOURCE_GROUP"    = var.resource_group_name
    "AZURE_FUNCTION_APP_NAME" = var.function_app_name
    "MANAGEMENT_ADMIN_TOKEN"  = "@Microsoft.KeyVault(SecretUri=${var.management_admin_token_uri})"
    "OPENSKY_CLIENT_ID"       = "@Microsoft.KeyVault(SecretUri=${var.opensky_client_id_secret_uri})"
    "OPENSKY_CLIENT_SECRET"   = "@Microsoft.KeyVault(SecretUri=${var.opensky_client_secret_secret_uri})"

    # SRE: External trigger connectivity for the Function App.
    # The API uses these to signal the Function App to 'Instant Start' 
    # when a dashboard user is active.
    "FLIGHT_INGESTION_URL" = "https://${var.function_app_hostname}"
    "FLIGHT_INGESTION_KEY" = var.function_app_key
  }

  tags = var.tags
}
