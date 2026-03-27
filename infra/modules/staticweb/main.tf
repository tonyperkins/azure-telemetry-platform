# =============================================================================
# module/staticweb — Azure Static Web App (Free tier)
#
# SRE: Static Web Apps serve the React bundle directly from Azure's global CDN
# with zero compute cost on the Free tier. The dashboard has no server-side
# rendering — it is a bundle of static files that calls the TelemetryApi.
# Using a Static Web App instead of blob storage + CDN gives us:
#   - Built-in deployment tokens (no SAS URL rotation)
#   - Automatic HTTPS (no cert provisioning)
#   - Free tier supports custom domains without paying for App Service
# =============================================================================

resource "azurerm_static_web_app" "main" {
  name                = "stapp-telemetry-${var.environment}"
  resource_group_name = var.resource_group_name
  location            = var.location
  sku_tier            = "Free"
  sku_size            = "Free"

  tags = var.tags
}
