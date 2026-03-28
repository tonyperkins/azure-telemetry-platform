# =============================================================================
# module/monitoring — Log Analytics + Application Insights + Alert Rules
#
# SRE: Observability is not optional. The monitoring module provisions:
#   1. Log Analytics Workspace — long-term log storage + KQL queries
#   2. Application Insights — distributed tracing, custom metrics, failures blade
#   3. Three alert rules — staleness (per source) + API error rate
#   4. Action group — email on alert fire
#   5. SRE Operations Workbook — single-pane-of-glass dashboard (see workbook.tf)
#
# Alert philosophy: alert on BUSINESS OUTCOMES (no vehicles ingested), not just
# technical failures (exception thrown). A Function that runs successfully but
# returns 0 vehicles is an incident. Only custom metrics catch this.
# =============================================================================

resource "azurerm_log_analytics_workspace" "main" {
  name                = "law-telemetry-${var.environment}"
  resource_group_name = var.resource_group_name
  location            = var.location
  sku                 = "PerGB2018"
  retention_in_days   = 30

  tags = var.tags
}

resource "azurerm_application_insights" "main" {
  name                = "appi-telemetry-${var.environment}"
  resource_group_name = var.resource_group_name
  location            = var.location
  workspace_id        = azurerm_log_analytics_workspace.main.id
  application_type    = "web"

  tags = var.tags
}

# ---------------------------------------------------------------------------
# Action group — email notification target for all alerts
# ---------------------------------------------------------------------------
resource "azurerm_monitor_action_group" "email" {
  name                = "ag-telemetry-oncall-${var.environment}"
  resource_group_name = var.resource_group_name
  short_name          = "oncall"

  email_receiver {
    name          = "on-call-engineer"
    email_address = var.alert_email
  }

  tags = var.tags
}

# ---------------------------------------------------------------------------
# SRE: Data Staleness Alert (KQL-based)
#
# Fires if 'vehicles_ingested_zero' count > 2 for any source (metro or flight)
# in a 5-minute window.
#
# Why KQL? Metric Alerts fail if the metric name hasn't been emitted yet.
# KQL queries are robust against empty datasets, ensuring first-time 
# deployments aren't blocked by "Metric not found" errors.
# ---------------------------------------------------------------------------
resource "azurerm_monitor_scheduled_query_rules_alert_v2" "data_staleness" {
  name                = "alert-data-staleness-${var.environment}"
  resource_group_name = var.resource_group_name
  location            = var.location
  scopes              = [azurerm_application_insights.main.id]
  severity            = 2
  window_duration     = "PT5M"
  evaluation_frequency = "PT1M"
  description         = "A data source (metro or flight) has reported 0 vehicles for 3 consecutive polls."

  criteria {
    query                   = <<-KQL
      customMetrics
      | where name == "vehicles_ingested_zero"
      | summarize Count = count() by Source = tostring(customDimensions["source"])
    KQL
    time_aggregation_method = "Count"
    threshold               = 2
    operator                = "GreaterThan"

    resource_id_column    = "_ResourceId"
    metric_measure_column = "Count"

    dimension {
      name     = "Source"
      operator = "Include"
      values   = ["*"]
    }
  }

  action {
    action_groups = [azurerm_monitor_action_group.email.id]
  }

  tags = var.tags
}

# ---------------------------------------------------------------------------
# Alert 3: API high error rate
# Fires if Http5xx > 5% of total requests over 5 minutes
# ---------------------------------------------------------------------------
resource "azurerm_monitor_metric_alert" "api_high_error_rate" {
  name                = "alert-api-5xx-${var.environment}"
  resource_group_name = var.resource_group_name
  scopes              = [azurerm_application_insights.main.id]
  description         = "TelemetryApi HTTP 5xx error rate exceeds 5% over a 5-minute window."
  severity            = 1
  frequency           = "PT1M"
  window_size         = "PT5M"

  criteria {
    metric_namespace = "microsoft.insights/components"
    metric_name      = "requests/failed"
    aggregation      = "Count"
    operator         = "GreaterThan"
    threshold        = 5
  }

  action {
    action_group_id = azurerm_monitor_action_group.email.id
  }

  tags = var.tags
}

resource "azurerm_application_insights_api_key" "read_telemetry" {
  name                    = "api-read-telemetry-${var.environment}"
  application_insights_id = azurerm_application_insights.main.id
  read_permissions        = ["aggregate", "api", "draft", "extendqueries", "search"]
}
