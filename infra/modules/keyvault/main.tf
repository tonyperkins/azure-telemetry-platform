# =============================================================================
# SRE: The function_host_key is pre-generated here (not read from the live
# Function App) to eliminate the timing dependency on azurerm_function_app_host_keys.
# The key is injected into the Function App at deploy time and referenced by
# the App Service via Key Vault — no data source read required.
# =============================================================================
# module/keyvault — Azure Key Vault + access policies + secrets
#
# SRE: Key Vault is the single source of truth for all secrets.
# App Service and Function App use system-assigned Managed Identities to
# authenticate — no client secrets, no service principal passwords,
# no secrets in environment variables or config files.
# =============================================================================

data "azurerm_client_config" "current" {}

resource "azurerm_key_vault" "main" {
  # SRE: Key Vault names are globally unique across all Azure tenants (max 24 chars).
  # The random suffix from main.tf prevents collisions when multiple students or
  # teams deploy this reference platform into different subscriptions.
  name                = "kv-tlm-${var.environment}-${var.suffix}"
  resource_group_name = var.resource_group_name
  location            = var.location
  tenant_id           = data.azurerm_client_config.current.tenant_id
  sku_name            = "standard"

  # SRE: Soft delete + purge protection prevent accidental or malicious deletion
  # of secrets. Without purge protection, a single az keyvault delete command
  # could make the SQL connection string unrecoverable during an incident.
  soft_delete_retention_days = 7
  purge_protection_enabled   = true

  tags = var.tags
}

# SRE: Terraform deployer access policies are HARDCODED, not dynamic.
# Using data.azurerm_client_config.current.object_id is fragile — it resolves
# to different OIDs locally vs CI, causing state conflicts. Static OIDs are
# explicit, auditable, and idempotent regardless of who runs Terraform.

# Local developer (tonyperkins personal az CLI identity)
resource "azurerm_key_vault_access_policy" "local_deployer" {
  key_vault_id = azurerm_key_vault.main.id
  tenant_id    = data.azurerm_client_config.current.tenant_id
  object_id    = "290e17ad-994a-4746-89ea-1c5ad4d58396"

  secret_permissions = ["Get", "List", "Set", "Delete", "Purge", "Recover"]
}

# GitHub Actions service principal (sp-telemetry-github-actions)
resource "azurerm_key_vault_access_policy" "ci_deployer" {
  key_vault_id = azurerm_key_vault.main.id
  tenant_id    = data.azurerm_client_config.current.tenant_id
  object_id    = "ca14dff5-3a2c-420b-8fb8-e4a911086ada"

  secret_permissions = ["Get", "List", "Set", "Delete", "Purge", "Recover"]
}


# App Service managed identity — read-only access
resource "azurerm_key_vault_access_policy" "appservice" {
  key_vault_id = azurerm_key_vault.main.id
  tenant_id    = data.azurerm_client_config.current.tenant_id
  object_id    = var.appservice_principal_id

  secret_permissions = ["Get", "List"]
}

# Function App managed identity — read-only access
resource "azurerm_key_vault_access_policy" "functionapp" {
  key_vault_id = azurerm_key_vault.main.id
  tenant_id    = data.azurerm_client_config.current.tenant_id
  object_id    = var.functionapp_principal_id

  secret_permissions = ["Get", "List"]
}

# ---------------------------------------------------------------------------
# Pre-generate Function App host key
# ---------------------------------------------------------------------------
resource "random_password" "function_host_key" {
  length  = 40
  special = false
  # Produces a URL-safe alphanumeric string suitable for use as a function key
}

# Secrets
resource "azurerm_key_vault_secret" "sql_connection_string" {
  name         = "SQL-CONNECTION-STRING"
  value        = var.sql_connection_string
  key_vault_id = azurerm_key_vault.main.id

  # Ensure the SP running the deployment has rights first
  depends_on = [
    azurerm_key_vault_access_policy.local_deployer
  ]

}

resource "azurerm_key_vault_secret" "opensky_client_id" {
  name         = "OPEN-SKY-CLIENT-ID"
  value        = var.opensky_client_id
  key_vault_id = azurerm_key_vault.main.id

  depends_on = [
    azurerm_key_vault_access_policy.local_deployer
  ]

}

resource "azurerm_key_vault_secret" "opensky_client_secret" {
  name         = "OPEN-SKY-CLIENT-SECRET"
  value        = var.opensky_client_secret
  key_vault_id = azurerm_key_vault.main.id

  depends_on = [
    azurerm_key_vault_access_policy.local_deployer
  ]

}

resource "azurerm_key_vault_secret" "management_admin_token" {
  name         = "MANAGEMENT-ADMIN-TOKEN"
  value        = var.management_admin_token
  key_vault_id = azurerm_key_vault.main.id

  depends_on = [
    azurerm_key_vault_access_policy.local_deployer
  ]

}

resource "azurerm_key_vault_secret" "function_host_key" {
  name         = "FUNCTION-HOST-KEY"
  value        = random_password.function_host_key.result
  key_vault_id = azurerm_key_vault.main.id

  depends_on = [
    azurerm_key_vault_access_policy.local_deployer
  ]

}
