output "key_vault_id" {
  description = "Resource ID of the Key Vault."
  value       = azurerm_key_vault.main.id
}

output "key_vault_name" {
  description = "Name of the Key Vault (used to build vault URI in app config)."
  value       = azurerm_key_vault.main.name
}

output "sql_secret_app_uri" {
  description = "URI of the SQL connection string secret for App Service."
  value       = azurerm_key_vault_secret.sql_connection_string_app.versionless_id
  sensitive   = true
}

output "sql_secret_func_uri" {
  description = "URI of the SQL connection string secret for Function App."
  value       = azurerm_key_vault_secret.sql_connection_string_func.versionless_id
  sensitive   = true
}

output "opensky_client_id_secret_uri" {
  value     = azurerm_key_vault_secret.opensky_client_id.versionless_id
  sensitive = true
}

output "opensky_client_secret_secret_uri" {
  value     = azurerm_key_vault_secret.opensky_client_secret.versionless_id
  sensitive = true
}

output "function_host_key_uri" {
  description = "Versionless URI of the pre-generated Function App host key secret."
  value       = azurerm_key_vault_secret.function_host_key.versionless_id
  sensitive   = true
}

output "function_host_key" {
  description = "The pre-generated Function App host key value (used to register the key on the Function App)."
  value       = random_password.function_host_key.result
  sensitive   = true
}
