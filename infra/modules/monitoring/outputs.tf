output "instrumentation_key" {
  description = "Application Insights instrumentation key (legacy — prefer connection_string)."
  value       = azurerm_application_insights.main.instrumentation_key
  sensitive   = true
}

output "connection_string" {
  description = "Application Insights connection string (includes ingestion endpoint)."
  value       = azurerm_application_insights.main.connection_string
  sensitive   = true
}

output "app_insights_name" {
  description = "Name of the Application Insights resource."
  value       = azurerm_application_insights.main.name
}
