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
