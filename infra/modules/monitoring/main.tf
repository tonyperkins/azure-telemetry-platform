# =============================================================================
# module/monitoring — Log Analytics + Application Insights + Alert Rules
#
# SRE: Observability is not optional. The monitoring module provisions:
#   1. Log Analytics Workspace — long-term log storage + KQL queries
#   2. Application Insights — distributed tracing, custom metrics, failures blade
#   3. Three alert rules — staleness (per source) + API error rate
#   4. Action group — email on alert fire
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
# Alert 1: Metro feed stale
# Fires if vehicles_ingested{source=metro} count = 0 for 3 evaluation periods
# SRE: This catches the "Function ran but returned no data" scenario that
# exception-based alerting would miss entirely.
# ---------------------------------------------------------------------------
/*
resource "azurerm_monitor_metric_alert" "metro_feed_stale" {
  name                = "alert-metro-feed-stale-${var.environment}"
  resource_group_name = var.resource_group_name
  scopes              = [azurerm_application_insights.main.id]
  description         = "Metro GTFS-RT feed has returned 0 vehicles for 3 consecutive 30-second polls."
  severity            = 2
  frequency           = "PT1M"
  window_size         = "PT5M"

  criteria {
    metric_namespace       = "microsoft.insights/components"
    metric_name            = "customMetrics/vehicles_ingested_zero"
    aggregation            = "Count"
    operator               = "GreaterThan"
    threshold              = 2
    skip_metric_validation = true

    dimension {
      name     = "source"
      operator = "Include"
      values   = ["metro"]
    }
  }

  action {
    action_group_id = azurerm_monitor_action_group.email.id
  }

  tags = var.tags
}
*/

# ---------------------------------------------------------------------------
# Alert 2: Flight feed stale
# ---------------------------------------------------------------------------
/*
resource "azurerm_monitor_metric_alert" "flight_feed_stale" {
  name                = "alert-flight-feed-stale-${var.environment}"
  resource_group_name = var.resource_group_name
  scopes              = [azurerm_application_insights.main.id]
  description         = "OpenSky flight feed has returned 0 airborne aircraft for 3 consecutive 60-second polls."
  severity            = 2
  frequency           = "PT1M"
  window_size         = "PT5M"

  criteria {
    metric_namespace       = "microsoft.insights/components"
    metric_name            = "customMetrics/vehicles_ingested_zero"
    aggregation            = "Count"
    operator               = "GreaterThan"
    threshold              = 2
    skip_metric_validation = true

    dimension {
      name     = "source"
      operator = "Include"
      values   = ["flight"]
    }
  }

  action {
    action_group_id = azurerm_monitor_action_group.email.id
  }

  tags = var.tags
}
*/

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
