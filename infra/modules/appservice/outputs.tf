output "default_hostname" {
  description = "Default hostname of the App Service."
  value       = azurerm_windows_web_app.main.default_hostname
}

output "principal_id" {
  description = "Object ID of the App Service managed identity."
  value       = var.user_assigned_identity_principal_id
}


output "app_name" {
  description = "Name of the App Service (used for az webapp deploy)."
  value       = azurerm_windows_web_app.main.name
}
