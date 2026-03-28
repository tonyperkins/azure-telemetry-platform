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

output "log_analytics_workspace_id" {
  description = "The Workspace (or Customer) ID for the Log Analytics Workspace."
  value       = azurerm_log_analytics_workspace.main.workspace_id
}

output "log_analytics_workspace_id_arm" {
  description = "The ARM Resource ID of the Log Analytics Workspace (for role assignments)."
  value       = azurerm_log_analytics_workspace.main.id
}
