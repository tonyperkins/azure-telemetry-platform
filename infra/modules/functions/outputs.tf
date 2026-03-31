output "function_app_name" {
  description = "Name of the Function App (used for deployment commands)."
  value       = azurerm_windows_function_app.main.name
}

output "function_app_hostname" {
  description = "The default hostname of the function app."
  value       = azurerm_windows_function_app.main.default_hostname
}

output "function_app_id" {
  description = "The ID of the function app."
  value       = azurerm_windows_function_app.main.id
}

output "principal_id" {
  description = "Object ID of the Function App system-assigned managed identity."
  value       = azurerm_windows_function_app.main.identity[0].principal_id
}
