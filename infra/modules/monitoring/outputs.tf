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

output "app_insights_app_id" {
  description = "The App ID property of Application Insights for API querying."
  value       = azurerm_application_insights.main.app_id
}

output "app_insights_api_key" {
  description = "The dynamically generated Application Insights API Key."
  value       = azurerm_application_insights_api_key.read_telemetry.api_key
  sensitive   = true
}

output "sre_workbook_id" {
  description = "Resource ID of the SRE Operations Dashboard workbook."
  value       = azurerm_application_insights_workbook.sre_dashboard.id
}
