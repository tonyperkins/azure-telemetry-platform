variable "resource_group_name" {
  description = "Name of the Azure Resource Group."
  type        = string
}

variable "location" {
  description = "Azure region."
  type        = string
}

variable "environment" {
  description = "Deployment environment (prod/staging/dev)."
  type        = string
}

variable "sql_admin_password" {
  description = "SQL server administrator password."
  type        = string
  sensitive   = true
}

variable "tags" {
  description = "Tags to apply to all resources."
  type        = map(string)
}
