output "server_name" {
  description = "The fully qualified domain name of the SQL server."
  value       = azurerm_mssql_server.main.fully_qualified_domain_name
}

output "database_name" {
  description = "Name of the telemetry database."
  value       = azurerm_mssql_database.main.name
}

output "connection_string" {
  description = "ADO.NET connection string for the telemetry database. Stored in Key Vault."
  value       = "Server=tcp:${azurerm_mssql_server.main.fully_qualified_domain_name},1433;Initial Catalog=${azurerm_mssql_database.main.name};Persist Security Info=False;User ID=sqladmin;Password=${var.sql_admin_password};MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;"
  sensitive   = true
}
