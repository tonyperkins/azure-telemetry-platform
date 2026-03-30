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
  default     = "https://data.texas.gov/download/eiei-9rpf/application%2Foctet-stream"
}

variable "opensky_bbox" {
  description = "OpenSky Network bounding box: lamin,lomin,lamax,lomax covering greater Austin area."
  type        = string
  default     = "29.8,-98.2,30.8,-97.2"
}

variable "management_admin_token" {
  type        = string
  sensitive   = true
  description = "SRE Admin password specifically authorizing the React Dashboard payload calls targeting the start/stop Function App remote endpoints natively bypassing general CORS requests."
}

variable "opensky_client_id" {
  description = "OpenSky API credentials dynamically extracted from GitHub secrets."
  type        = string
  sensitive   = true
}

variable "opensky_client_secret" {
  description = "OpenSky API credentials dynamically extracted from GitHub secrets."
  type        = string
  sensitive   = true
}

variable "flight_polling_cron" {
  description = "Cron expression for flight ingestion frequency (e.g., '0 */5 * * * *' for 5 mins)."
  type        = string
  default     = "0 */5 * * * *"
}
