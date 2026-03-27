variable "environment" {
  description = "Deployment environment name. Used in resource naming and tags."
  type        = string
  default     = "prod"

  validation {
    condition     = contains(["prod", "staging", "dev"], var.environment)
    error_message = "environment must be prod, staging, or dev."
  }
}

variable "location" {
  description = "Azure region for all resources. centralus supports Static Web Apps and SQL."
  type        = string
  default     = "centralus"
}

variable "alert_email" {
  description = "Email address to receive monitoring alerts (feed staleness, API errors)."
  type        = string
  # No default — must be provided. Alerts going nowhere is an operational anti-pattern.
}

variable "sql_admin_password" {
  description = "Administrator password for the Azure SQL server. Must meet Azure complexity requirements."
  type        = string
  sensitive   = true
  # No default — must be provided via TF_VAR_sql_admin_password secret.
}

variable "metro_feed_url" {
  description = "Capital Metro GTFS-RT feed URL."
  type        = string
  default     = "https://data.texas.gov/download/r4v4-vz24/application%2Foctet-stream"
}

variable "opensky_bbox" {
  description = "OpenSky Network bounding box: lamin,lomin,lamax,lomax covering greater Austin area."
  type        = string
  default     = "29.8,-98.2,30.8,-97.2"
}
