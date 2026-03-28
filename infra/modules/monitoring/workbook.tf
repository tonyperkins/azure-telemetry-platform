# =============================================================================
# Azure Workbook — SRE Operations Dashboard
#
# SRE: A single-pane-of-glass dashboard deployed via Terraform alongside the
# infrastructure it monitors. This ensures the dashboard always exists in every
# environment, uses the correct App Insights resource, and is version-controlled
# like any other infrastructure artifact.
#
# Access: Azure Portal → Application Insights → Workbooks → "SRE Dashboard"
# Cost: $0 — Azure Workbooks are a free feature of Azure Monitor.
#
# Panels:
#   1. SLO Summary         — availability, latency P95, error rate (tiles)
#   2. Ingestion Pipeline   — vehicles_ingested rate by source (timechart)
#   3. Data Freshness       — zero-vehicle events / staleness (timechart)
#   4. API Latency          — P50/P95/P99 percentiles (timechart)
#   5. API Error Rate       — success vs failure percentage (timechart)
#   6. Request Volume       — requests/min by endpoint (timechart)
#   7. Function Executions  — ingestion function duration + status (table)
#   8. SLO Burn Rate        — % of windows meeting all targets (timechart)
# =============================================================================

resource "random_uuid" "workbook_id" {}

resource "azurerm_application_insights_workbook" "sre_dashboard" {
  name                = random_uuid.workbook_id.result
  resource_group_name = var.resource_group_name
  location            = var.location
  display_name        = "SRE Operations Dashboard — ${var.environment}"
  source_id           = lower(azurerm_application_insights.main.id)
  category            = "workbook"

  data_json = jsonencode({
    version = "Notebook/1.0"
    items = [

      # =====================================================================
      # Header
      # =====================================================================
      {
        type = 1
        content = {
          json = <<-MD
            # SRE Operations Dashboard
            Real-time operational health for the Azure Telemetry Platform.
            Covers data pipeline ingestion, API performance, and SLO tracking.

            ---
          MD
        }
        name = "header"
      },

      # =====================================================================
      # Time Range Parameter
      # =====================================================================
      {
        type = 9
        content = {
          version = "KqlParameterItem/1.0"
          parameters = [
            {
              id         = "TimeRange"
              version    = "KqlParameterItem/1.0"
              name       = "TimeRange"
              type       = 4
              isRequired = true
              value      = { durationMs = 3600000 }
              typeSettings = {
                selectableValues = [
                  { durationMs = 1800000, displayText = "Last 30 minutes" },
                  { durationMs = 3600000, displayText = "Last 1 hour" },
                  { durationMs = 14400000, displayText = "Last 4 hours" },
                  { durationMs = 43200000, displayText = "Last 12 hours" },
                  { durationMs = 86400000, displayText = "Last 24 hours" },
                  { durationMs = 259200000, displayText = "Last 3 days" },
                ]
              }
              label = "Time Range"
            }
          ]
          style = "pills"
        }
        name = "time-range-param"
      },

      # =====================================================================
      # SLO Summary Tiles
      # =====================================================================
      {
        type = 3
        content = {
          version                 = "KqlItem/1.0"
          query                   = <<-KQL
            requests
            | where timestamp {TimeRange}
            | where name has "/api/"
            | summarize Total = count(), Succeeded = countif(success == true)
            | extend Availability = round(100.0 * Succeeded / Total, 2)
            | project Availability
          KQL
          size                    = 4
          title                   = "API Availability"
          queryType               = 0
          resourceType            = "microsoft.insights/components"
          crossComponentResources = [lower(azurerm_application_insights.main.id)]
          visualization           = "tiles"
          tileSettings = {
            leftContent = {
              columnMatch = "Availability"
              formatter   = 1
              numberFormat = {
                unit    = 1
                options = { style = "decimal", maximumFractionDigits = 2 }
              }
            }
          }
        }
        customWidth = "33"
        name        = "tile-availability"
      },
      {
        type = 3
        content = {
          version                 = "KqlItem/1.0"
          query                   = <<-KQL
            requests
            | where timestamp {TimeRange}
            | where name has "/api/"
            | summarize P95 = round(percentile(duration, 95), 0)
            | project P95
          KQL
          size                    = 4
          title                   = "API Latency (P95)"
          queryType               = 0
          resourceType            = "microsoft.insights/components"
          crossComponentResources = [lower(azurerm_application_insights.main.id)]
          visualization           = "tiles"
          tileSettings = {
            leftContent = {
              columnMatch = "P95"
              formatter   = 1
              numberFormat = {
                unit    = 23
                options = { style = "decimal", maximumFractionDigits = 0 }
              }
            }
          }
        }
        customWidth = "33"
        name        = "tile-latency"
      },
      {
        type = 3
        content = {
          version                 = "KqlItem/1.0"
          query                   = <<-KQL
            requests
            | where timestamp {TimeRange}
            | where name has "/api/"
            | summarize Total = count(), Failed = countif(success == false)
            | extend ErrorRate = iff(Total == 0, 0.0, round(100.0 * Failed / Total, 3))
            | project ErrorRate
          KQL
          size                    = 4
          title                   = "API Error Rate"
          queryType               = 0
          resourceType            = "microsoft.insights/components"
          crossComponentResources = [lower(azurerm_application_insights.main.id)]
          visualization           = "tiles"
          tileSettings = {
            leftContent = {
              columnMatch = "ErrorRate"
              formatter   = 1
              numberFormat = {
                unit    = 1
                options = { style = "decimal", maximumFractionDigits = 3 }
              }
            }
          }
        }
        customWidth = "33"
        name        = "tile-error-rate"
      },

      # =====================================================================
      # Data Pipeline Health
      # =====================================================================
      {
        type    = 1
        content = { json = "## Data Pipeline Health" }
        name    = "section-pipeline"
      },
      {
        type = 3
        content = {
          version                 = "KqlItem/1.0"
          query                   = <<-KQL
            customMetrics
            | where timestamp {TimeRange}
            | where name == "vehicles_ingested"
            | extend Source = tostring(customDimensions["source"])
            | summarize VehiclesIngested = sum(value) by bin(timestamp, 5m), Source
            | order by timestamp asc
          KQL
          size                    = 0
          title                   = "Vehicles Ingested per 5-Minute Window"
          queryType               = 0
          resourceType            = "microsoft.insights/components"
          crossComponentResources = [lower(azurerm_application_insights.main.id)]
          visualization           = "timechart"
          chartSettings = {
            seriesLabelSettings = [
              { series = "metro", label = "Metro Buses", color = "green" },
              { series = "flight", label = "Flights", color = "blue" }
            ]
          }
        }
        customWidth = "50"
        name        = "chart-ingestion-rate"
      },
      {
        type = 3
        content = {
          version                 = "KqlItem/1.0"
          query                   = <<-KQL
            customMetrics
            | where timestamp {TimeRange}
            | where name == "vehicles_ingested_zero"
            | extend Source = tostring(customDimensions["source"])
            | summarize ZeroEvents = count() by bin(timestamp, 5m), Source
            | order by timestamp asc
          KQL
          size                    = 0
          title                   = "Zero-Vehicle Events (Staleness Indicator)"
          queryType               = 0
          resourceType            = "microsoft.insights/components"
          crossComponentResources = [lower(azurerm_application_insights.main.id)]
          visualization           = "timechart"
          chartSettings = {
            seriesLabelSettings = [
              { series = "metro", label = "Metro Stale", color = "redBright" },
              { series = "flight", label = "Flight Stale", color = "orange" }
            ]
          }
        }
        customWidth = "50"
        name        = "chart-staleness"
      },

      # =====================================================================
      # API Performance
      # =====================================================================
      {
        type    = 1
        content = { json = "## API Performance" }
        name    = "section-api"
      },
      {
        type = 3
        content = {
          version                 = "KqlItem/1.0"
          query                   = <<-KQL
            requests
            | where timestamp {TimeRange}
            | where name has "/api/"
            | summarize
                P50 = round(percentile(duration, 50), 1),
                P95 = round(percentile(duration, 95), 1),
                P99 = round(percentile(duration, 99), 1)
              by bin(timestamp, 5m)
            | order by timestamp asc
          KQL
          size                    = 0
          title                   = "API Latency Percentiles (ms)"
          queryType               = 0
          resourceType            = "microsoft.insights/components"
          crossComponentResources = [lower(azurerm_application_insights.main.id)]
          visualization           = "timechart"
          chartSettings = {
            seriesLabelSettings = [
              { series = "P50", label = "P50 (Median)", color = "green" },
              { series = "P95", label = "P95 (SLO)", color = "orange" },
              { series = "P99", label = "P99 (Tail)", color = "redBright" }
            ]
            ySettings = { min = 0 }
          }
        }
        customWidth = "50"
        name        = "chart-latency-percentiles"
      },
      {
        type = 3
        content = {
          version                 = "KqlItem/1.0"
          query                   = <<-KQL
            requests
            | where timestamp {TimeRange}
            | where name has "/api/"
            | summarize
                Total  = count(),
                Failed = countif(success == false)
              by bin(timestamp, 5m)
            | extend
                ErrorPct   = iff(Total == 0, 0.0, round(100.0 * Failed / Total, 2)),
                SuccessPct = iff(Total == 0, 100.0, round(100.0 * (Total - Failed) / Total, 2))
            | project timestamp, SuccessPct, ErrorPct
            | order by timestamp asc
          KQL
          size                    = 0
          title                   = "API Success vs Error Rate (%)"
          queryType               = 0
          resourceType            = "microsoft.insights/components"
          crossComponentResources = [lower(azurerm_application_insights.main.id)]
          visualization           = "timechart"
          chartSettings = {
            seriesLabelSettings = [
              { series = "SuccessPct", label = "Success %", color = "green" },
              { series = "ErrorPct", label = "Error %", color = "redBright" }
            ]
            ySettings = { min = 0, max = 100 }
          }
        }
        customWidth = "50"
        name        = "chart-error-rate"
      },

      # =====================================================================
      # Request Volume & Endpoint Breakdown
      # =====================================================================
      {
        type    = 1
        content = { json = "## Request Volume & Endpoint Breakdown" }
        name    = "section-requests"
      },
      {
        type = 3
        content = {
          version                 = "KqlItem/1.0"
          query                   = <<-KQL
            requests
            | where timestamp {TimeRange}
            | where name has "/api/"
            | summarize Requests = count() by bin(timestamp, 5m), name
            | order by timestamp asc
          KQL
          size                    = 0
          title                   = "Requests by Endpoint (5-min buckets)"
          queryType               = 0
          resourceType            = "microsoft.insights/components"
          crossComponentResources = [lower(azurerm_application_insights.main.id)]
          visualization           = "timechart"
        }
        customWidth = "50"
        name        = "chart-request-volume"
      },
      {
        type = 3
        content = {
          version                 = "KqlItem/1.0"
          query                   = <<-KQL
            requests
            | where timestamp {TimeRange}
            | where name has "/api/"
            | summarize
                Requests = count(),
                AvgMs    = round(avg(duration), 1),
                P95Ms    = round(percentile(duration, 95), 1),
                FailRate = round(100.0 * countif(success == false) / count(), 2)
              by name
            | order by Requests desc
          KQL
          size                    = 1
          title                   = "Endpoint Summary"
          queryType               = 0
          resourceType            = "microsoft.insights/components"
          crossComponentResources = [lower(azurerm_application_insights.main.id)]
          visualization           = "table"
          gridSettings = {
            formatters = [
              {
                columnMatch = "FailRate"
                formatter   = 18
                formatOptions = {
                  thresholdsOptions = "colors"
                  thresholdsGrid = [
                    { operator = ">=", thresholdValue = "5", representation = "redBright" },
                    { operator = ">=", thresholdValue = "1", representation = "orange" },
                    { operator = "Default", representation = "green" }
                  ]
                }
              }
            ]
          }
        }
        customWidth = "50"
        name        = "table-endpoint-summary"
      },

      # =====================================================================
      # Function Execution Health
      # =====================================================================
      {
        type    = 1
        content = { json = "## Function Execution Health" }
        name    = "section-functions"
      },
      {
        type = 3
        content = {
          version                 = "KqlItem/1.0"
          query                   = <<-KQL
            requests
            | where timestamp {TimeRange}
            | where cloud_RoleName startswith "func-telemetry"
            | where name in ("MetroIngestion", "FlightIngestion", "RetentionCleanup")
            | summarize
                Executions = count(),
                AvgMs      = round(avg(duration), 0),
                MaxMs      = round(max(duration), 0),
                Failures   = countif(success == false)
              by bin(timestamp, 15m), name
            | order by timestamp desc
          KQL
          size                    = 1
          title                   = "Function Execution Log (15-min buckets)"
          queryType               = 0
          resourceType            = "microsoft.insights/components"
          crossComponentResources = [lower(azurerm_application_insights.main.id)]
          visualization           = "table"
          gridSettings = {
            formatters = [
              {
                columnMatch = "Failures"
                formatter   = 18
                formatOptions = {
                  thresholdsOptions = "colors"
                  thresholdsGrid = [
                    { operator = ">=", thresholdValue = "1", representation = "redBright" },
                    { operator = "Default", representation = "green" }
                  ]
                }
              }
            ]
          }
        }
        customWidth = "50"
        name        = "table-function-executions"
      },
      {
        type = 3
        content = {
          version                 = "KqlItem/1.0"
          query                   = <<-KQL
            customMetrics
            | where timestamp {TimeRange}
            | where name == "records_deleted"
            | summarize RecordsDeleted = sum(value) by bin(timestamp, 1h)
            | order by timestamp asc
          KQL
          size                    = 0
          title                   = "Retention Cleanup — Records Purged per Hour"
          queryType               = 0
          resourceType            = "microsoft.insights/components"
          crossComponentResources = [lower(azurerm_application_insights.main.id)]
          visualization           = "barchart"
          chartSettings = {
            seriesLabelSettings = [
              { series = "RecordsDeleted", label = "Records Deleted", color = "purple" }
            ]
          }
        }
        customWidth = "50"
        name        = "chart-retention-cleanup"
      },

      # =====================================================================
      # SLO Burn Rate
      # =====================================================================
      {
        type = 1
        content = {
          json = <<-MD
            ## SLO Burn Rate

            Tracks the percentage of 5-minute windows meeting all SLO thresholds.
            Target: **≥ 99.9% availability**, **P95 < 500ms**, **error rate < 0.1%**.
          MD
        }
        name = "section-slo"
      },
      {
        type = 3
        content = {
          version                 = "KqlItem/1.0"
          query                   = <<-KQL
            requests
            | where timestamp {TimeRange}
            | where name has "/api/"
            | summarize
                Total  = count(),
                Failed = countif(success == false),
                P95    = percentile(duration, 95)
              by bin(timestamp, 5m)
            | extend AllMet = iff(
                Total == 0, true,
                (100.0 * (Total - Failed) / Total) >= 99.9
                and P95 < 500
                and (100.0 * Failed / Total) < 0.1
              )
            | summarize
                WindowsTotal = count(),
                WindowsMet   = countif(AllMet)
              by bin(timestamp, 1h)
            | extend BurnRate = round(100.0 * WindowsMet / WindowsTotal, 1)
            | project timestamp, BurnRate
            | order by timestamp asc
          KQL
          size                    = 0
          title                   = "SLO Compliance — % of 5-min Windows Meeting All Targets (hourly)"
          queryType               = 0
          resourceType            = "microsoft.insights/components"
          crossComponentResources = [lower(azurerm_application_insights.main.id)]
          visualization           = "timechart"
          chartSettings = {
            seriesLabelSettings = [
              { series = "BurnRate", label = "SLO Compliance %", color = "green" }
            ]
            ySettings = { min = 90, max = 100 }
          }
        }
        name = "chart-slo-burn-rate"
      },

      # =====================================================================
      # Recent Exceptions
      # =====================================================================
      {
        type    = 1
        content = { json = "## Recent Exceptions" }
        name    = "section-exceptions"
      },
      {
        type = 3
        content = {
          version                 = "KqlItem/1.0"
          query                   = <<-KQL
            exceptions
            | where timestamp {TimeRange}
            | project
                timestamp,
                Component = cloud_RoleName,
                Type      = type,
                Message   = outerMessage
            | order by timestamp desc
            | take 20
          KQL
          size                    = 1
          title                   = "Last 20 Exceptions"
          queryType               = 0
          resourceType            = "microsoft.insights/components"
          crossComponentResources = [lower(azurerm_application_insights.main.id)]
          visualization           = "table"
        }
        name = "table-recent-exceptions"
      }
    ]

    styleSettings      = {}
    defaultResourceIds = [lower(azurerm_application_insights.main.id)]
  })

  tags = var.tags
}
