output "key_vault_id" {
  description = "Resource ID of the Key Vault."
  value       = azurerm_key_vault.main.id
}

output "key_vault_name" {
  description = "Name of the Key Vault (used to build vault URI in app config)."
  value       = azurerm_key_vault.main.name
}

output "sql_secret_uri" {
  description = "URI of the SQL connection string secret (for Key Vault reference syntax)."
  value       = azurerm_key_vault_secret.sql_connection_string.versionless_id
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
