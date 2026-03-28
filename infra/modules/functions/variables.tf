variable "resource_group_name" { type = string }
variable "location" { type = string }
variable "environment" { type = string }
variable "tags" { type = map(string) }

variable "suffix" {
  description = "Random hex suffix for globally-unique storage account name."
  type        = string
}

variable "sql_secret_uri" {
  type      = string
  sensitive = true
}

variable "appinsights_connection_string" {
  type      = string
  sensitive = true
}

variable "metro_feed_url" { type = string }
variable "opensky_bbox" { type = string }
variable "opensky_client_id_secret_uri" {
  type      = string
  sensitive = true
}

variable "opensky_client_secret_secret_uri" {
  type      = string
  sensitive = true
}
