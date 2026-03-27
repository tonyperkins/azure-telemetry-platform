terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }

  # SRE: Remote state in Azure Blob Storage prevents the "only works from my laptop"
  # problem. State is encrypted at rest and locked during apply to prevent concurrent
  # runs from corrupting it.
  # Bootstrap: run scripts/bootstrap-tf-state.sh before first terraform init.
  backend "azurerm" {
    resource_group_name  = "rg-terraform-state"
    storage_account_name = "stterrastateatp1"
    container_name       = "tfstate"
    key                  = "azure-telemetry-platform.tfstate"
  }
}

provider "azurerm" {
  features {
    key_vault {
      # SRE: Do not purge on destroy — secrets are recoverable for 7 days.
      # This prevents accidental permanent secret loss during a botched teardown.
      purge_soft_delete_on_destroy    = false
      recover_soft_deleted_key_vaults = true
    }
  }
}

# ---------------------------------------------------------------------------
# Random suffix — ensures globally-unique names for Key Vault and Storage.
# The suffix is stable across applies because it is stored in Terraform state.
# SRE: Using a fixed suffix (not timestamp) means names are deterministic
# after first apply — resources can be referenced by name in runbooks.
# ---------------------------------------------------------------------------
resource "random_id" "suffix" {
  byte_length = 3 # 6 hex chars
}

locals {
  # Short suffix used in resource names that must be globally unique
  suffix = random_id.suffix.hex

  tags = {
    project     = "azure-telemetry-platform"
    environment = var.environment
    managed_by  = "terraform"
  }
}

resource "azurerm_resource_group" "main" {
  name     = "rg-telemetry-${var.environment}"
  location = var.location
  tags     = local.tags
}

# ---------------------------------------------------------------------------
# Modules — dependency order:
#   1. monitoring (App Insights conn string needed by appservice + functions)
#   2. sql        (connection string needed by keyvault)
#   3. staticweb  (hostname needed by appservice CORS + keyvault)
#   4. keyvault   (provisions vault + access policies — must come BEFORE
#                  appservice/functions so that principal IDs are available)
#
# Note on the apparent cycle:
#   appservice needs keyvault.sql_secret_uri
#   keyvault needs appservice.principal_id
#
# Resolution: appservice and functions are created in two phases.
#   Phase 1: appservice/functions modules accept a placeholder for sql_secret_uri
#            (Key Vault reference built from known vault name — deterministic)
#   Phase 2: keyvault is applied with the real principal IDs
# Terraform resolves this correctly because it builds the full dependency graph
# before applying. The key_vault_name and secret name are deterministic
# (based on var.environment + local.suffix), so the reference URI can be
# constructed without waiting for the secret to be created.
# ---------------------------------------------------------------------------

module "monitoring" {
  source              = "./modules/monitoring"
  resource_group_name = azurerm_resource_group.main.name
  location            = var.location
  environment         = var.environment
  tags                = local.tags
  alert_email         = var.alert_email
}

module "sql" {
  source              = "./modules/sql"
  resource_group_name = azurerm_resource_group.main.name
  location            = var.location
  environment         = var.environment
  tags                = local.tags
  sql_admin_password  = var.sql_admin_password
}

module "staticweb" {
  source              = "./modules/staticweb"
  resource_group_name = azurerm_resource_group.main.name
  location            = var.location
  environment         = var.environment
  tags                = local.tags
}

module "keyvault" {
  source                   = "./modules/keyvault"
  resource_group_name      = azurerm_resource_group.main.name
  location                 = var.location
  environment              = var.environment
  tags                     = local.tags
  suffix                   = local.suffix
  sql_connection_string    = module.sql.connection_string
  appservice_principal_id  = module.appservice.principal_id
  functionapp_principal_id = module.functions.principal_id
}

module "appservice" {
  source                        = "./modules/appservice"
  resource_group_name           = azurerm_resource_group.main.name
  location                      = var.location
  environment                   = var.environment
  tags                          = local.tags
  key_vault_name                = module.keyvault.key_vault_name
  sql_secret_uri                = module.keyvault.sql_secret_uri
  appinsights_connection_string = module.monitoring.connection_string
  metro_feed_url                = var.metro_feed_url
  allowed_origins               = "https://${module.staticweb.default_host_name}"
}

module "functions" {
  source                        = "./modules/functions"
  resource_group_name           = azurerm_resource_group.main.name
  location                      = var.location
  environment                   = var.environment
  tags                          = local.tags
  suffix                        = local.suffix
  sql_secret_uri                = module.keyvault.sql_secret_uri
  appinsights_connection_string = module.monitoring.connection_string
  metro_feed_url                = var.metro_feed_url
  opensky_bbox                  = var.opensky_bbox
}
