output "default_hostname" {
  description = "Default hostname of the App Service."
  value       = azurerm_windows_web_app.main.default_hostname
}

output "principal_id" {
  description = "Object ID of the App Service system-assigned managed identity."
  value       = azurerm_windows_web_app.main.identity[0].principal_id
}

output "app_name" {
  description = "Name of the App Service (used for az webapp deploy)."
  value       = azurerm_windows_web_app.main.name
}
