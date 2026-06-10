variable "resource_group_name" { type = string }
variable "location" { type = string }
variable "environment" { type = string }
variable "tags" { type = map(string) }

variable "key_vault_name" {
  description = "Key Vault name, used to build Key Vault reference app settings."
  type        = string
}

variable "sql_secret_uri" {
  description = "Versionless URI of the SQL connection string secret in Key Vault."
  type        = string
  sensitive   = true
}

variable "appinsights_connection_string" {
  description = "Application Insights connection string."
  type        = string
  sensitive   = true
}

variable "metro_feed_url" { type = string }
variable "allowed_origins" {
  description = "CORS allowed origins (Static Web App hostname)."
  type        = string
}

variable "suffix" {
  type        = string
  description = "A random suffix to ensure globally unique resource names for the App Service environment."
}

variable "log_analytics_workspace_id" {
  type        = string
  description = "The Log Analytics Workspace ID for the API to query real logs from."
}

variable "app_insights_app_id" {
  type        = string
  description = "The Application Insights App ID specifically for the REST API."
}

variable "app_insights_api_key" {
  type        = string
  sensitive   = true
  description = "The read-only Application Insights API Key."
}

variable "subscription_id" {
  type = string
}

variable "function_app_name" {
  type = string
}

variable "management_admin_token_uri" {
  type      = string
  sensitive = true
}

variable "opensky_client_id_secret_uri" {
  type        = string
  description = "Versionless URI of the OpenSky Client ID in Key Vault."
}

variable "opensky_client_secret_secret_uri" {
  type        = string
  sensitive   = true
  description = "Versionless URI of the OpenSky Client Secret in Key Vault."
}

variable "function_app_hostname" {
  type        = string
  description = "The default hostname of the function app for cross-service triggers."
}

variable "function_host_key_uri" {
  type        = string
  sensitive   = true
  description = "Versionless KV secret URI of the pre-generated Function App host key. Used as a Key Vault reference — the raw key never appears in app settings."
}

variable "user_assigned_identity_id" {
  type        = string
  description = "Resource ID of the User Assigned Identity."
}

variable "user_assigned_identity_client_id" {
  type        = string
  description = "Client ID of the User Assigned Identity."
}

variable "user_assigned_identity_principal_id" {
  type        = string
  description = "Principal ID (Object ID) of the User Assigned Identity."
}

variable "opensky_proxy_url" { type = string }
variable "opensky_api_url" { type = string }
variable "opensky_auth_url" { type = string }

