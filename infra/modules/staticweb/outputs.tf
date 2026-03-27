output "default_host_name" {
  description = "Default hostname of the Static Web App."
  value       = azurerm_static_web_app.main.default_host_name
}

output "api_key" {
  description = "Deployment token for GitHub Actions workflow."
  value       = azurerm_static_web_app.main.api_key
  sensitive   = true
}
