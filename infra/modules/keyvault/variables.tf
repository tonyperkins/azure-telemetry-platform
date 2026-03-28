variable "resource_group_name" {
  type = string
}

variable "location" {
  type = string
}

variable "environment" {
  type = string
}

variable "tags" {
  type = map(string)
}

variable "suffix" {
  description = "Random hex suffix for globally-unique resource names (Key Vault)."
  type        = string
}

variable "sql_connection_string" {
  description = "SQL connection string to store as a Key Vault secret."
  type        = string
  sensitive   = true
}

variable "appservice_principal_id" {
  description = "Object ID of the App Service system-assigned managed identity."
  type        = string
}

variable "functionapp_principal_id" {
  description = "Object ID of the Function App system-assigned managed identity."
  type        = string
}

variable "opensky_client_id" {
  description = "OpenSky client credentials from GitHub secrets."
  type        = string
  sensitive   = true
}

variable "opensky_client_secret" {
  description = "OpenSky client credentials from GitHub secrets."
  type        = string
  sensitive   = true
}
