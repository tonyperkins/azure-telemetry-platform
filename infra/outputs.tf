output "app_service_hostname" {
  description = "Public hostname of the TelemetryApi App Service."
  value       = module.appservice.default_hostname
}

output "static_web_hostname" {
  description = "Public hostname of the dashboard Static Web App."
  value       = module.staticweb.default_host_name
}

output "function_app_name" {
  description = "Name of the Function App (for deployment commands)."
  value       = module.functions.function_app_name
}

output "app_service_name" {
  description = "Name of the App Service (for deployment commands)."
  value       = module.appservice.app_name
}

output "key_vault_name" {
  description = "Name of the Key Vault."
  value       = module.keyvault.key_vault_name
}

output "app_insights_name" {
  description = "Name of the Application Insights resource."
  value       = module.monitoring.app_insights_name
}

output "static_web_api_key" {
  description = "Static Web App deployment token — store as AZURE_STATIC_WEB_APPS_API_TOKEN GitHub secret."
  value       = module.staticweb.api_key
  sensitive   = true
}

output "sql_connection_string" {
  description = "Direct SQL administration connection string for executing GitHub Actions CI database migrations."
  value       = module.sql.connection_string
  sensitive   = true
}
