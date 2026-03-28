# Service Level Objectives (SLOs)

**Owner:** Platform SRE
**Last reviewed:** 2025-01
**Review cadence:** Quarterly

---

## Overview

This document defines the Service Level Indicators (SLIs) and Service Level Objectives (SLOs) for the Azure Telemetry Platform. SLOs are internal reliability targets — not contractual SLAs. They exist to drive engineering prioritization: when an SLO is at risk, reliability work takes precedence over feature work.

Each SLO is measured over a **30-day rolling window**. The SRE Operations Dashboard (Azure Portal → App Insights → Workbooks) tracks burn rate in real time.

---

## SLI 1: API Availability

**What it measures:** The percentage of API requests that complete successfully (HTTP 2xx/3xx).

**Why it matters:** If the API is unavailable, the dashboard shows no vehicles. Users see a blank map.

| Field | Value |
|---|---|
| **SLI** | `count(successful requests) / count(total requests) × 100` |
| **SLO** | ≥ 99.9% over 30 days |
| **Error budget** | 43.2 minutes of downtime per 30 days |
| **Data source** | Application Insights `requests` table |
| **Excludes** | Health check probes (`/healthz`), expected 4xx (bad request, not found) |

**KQL:**
```kql
requests
| where timestamp > ago(30d)
| where name has "/api/"
| summarize Total = count(), Succeeded = countif(success == true)
| extend Availability = round(100.0 * Succeeded / Total, 3)
```

**Alert threshold:** Fires when availability drops below 99.9% in a 5-minute window (see `alert-api-5xx` in Terraform).

---

## SLI 2: API Latency

**What it measures:** The 95th percentile response time for API requests.

**Why it matters:** High latency degrades the dashboard experience — the map freezes during its 30-second poll cycle, and stale position data accumulates. Latency spikes also indicate SQL auto-resume delays or query plan regressions.

| Field | Value |
|---|---|
| **SLI** | `percentile(request.duration, 95)` |
| **SLO** | P95 < 500ms |
| **Data source** | Application Insights `requests` table |
| **Excludes** | Health check probes (`/healthz`) |

**KQL:**
```kql
requests
| where timestamp > ago(30d)
| where name has "/api/"
| summarize P95 = round(percentile(duration, 95), 1)
```

**Known exceptions:** The first request after SQL Serverless auto-resume incurs a 10–30 second cold start. This is expected behavior — the API returns an empty result set (not an error), and the next poll succeeds normally. These cold-start requests impact P99 but should not breach the P95 SLO under normal traffic patterns.

---

## SLI 3: Data Freshness

**What it measures:** The percentage of time that each data source (metro, flight) has ingested at least one vehicle in the last 5 minutes.

**Why it matters:** The platform can be "available" (API returns 200) but "stale" (API returns zero vehicles because the ingestion pipeline is broken). Freshness is the business-level signal that availability alone cannot capture.

| Field | Value |
|---|---|
| **SLI** | `count(5-min windows with ≥ 1 vehicle) / count(total 5-min windows) × 100` |
| **SLO** | ≥ 95% per source during operating hours (6 AM – 11 PM CST) |
| **Data source** | Application Insights `customMetrics` (`vehicles_ingested`, `vehicles_ingested_zero`) |
| **Excludes** | Overnight hours (11 PM – 6 AM CST) when metro buses are not running and flight traffic is near zero |

**KQL:**
```kql
customMetrics
| where timestamp > ago(30d)
| where name == "vehicles_ingested"
| extend Source = tostring(customDimensions["source"])
| summarize HasData = countif(value > 0), Total = count() by bin(timestamp, 5m), Source
| summarize FreshnessPercent = round(100.0 * countif(HasData > 0) / count(), 1) by Source
```

**Alert threshold:** Fires when `vehicles_ingested_zero` occurs 3+ times in 5 minutes (see `alert-metro-feed-stale` and `alert-flight-feed-stale` in Terraform).

**Why 95% and not 99.9%:** Data freshness depends on upstream feeds (Capital Metro, OpenSky) that are outside our control. Feed outages, rate limiting, and maintenance windows are expected. 95% over operating hours is an achievable target that still catches sustained pipeline failures.

---

## Error Budget Policy

When the remaining error budget for any SLO drops below **25%** of the monthly allocation:

1. **Feature freeze** — New feature development pauses. All engineering effort shifts to reliability.
2. **Root cause investigation** — Every incident consuming error budget gets a postmortem (see `docs/postmortem-template.md`).
3. **Proactive hardening** — The team reviews the production hardening roadmap and prioritizes the highest-impact item.

When the error budget is **fully exhausted** (SLO breached):

1. All of the above, plus:
2. **Incident review** — Conduct a formal review of the breach with timeline, contributing factors, and action items.
3. **SLO recalibration** — Evaluate whether the SLO target is still appropriate given the architecture and cost constraints.

---

## Production Hardening Roadmap

These are improvements that would increase reliability beyond the current SLO targets. They are listed in priority order by impact-to-cost ratio and would be pursued if the error budget were consistently tight.

| Priority | Improvement | Impact | Estimated Cost |
|---|---|---|---|
| 1 | **Deployment slots** for zero-downtime deploys | Eliminates deploy-window availability dips | S1 tier (~$70/mo vs. $13/mo B1) |
| 2 | **Polly retry policy** on API database queries | Absorbs SQL auto-resume cold starts transparently | $0 (code change only) |
| 3 | **Response caching** on `/api/vehicles/current` | Reduces SQL load, improves P95 latency | $0 (code change only) |
| 4 | **Rate limiting** on API endpoints | Prevents DoS from runaway dashboard tabs | $0 (middleware) |
| 5 | **Batched DELETE** in retention cleanup | Prevents table locks during large purges | $0 (code change only) |
| 6 | **Private endpoints** for SQL and Key Vault | Network-level isolation, eliminates public exposure | P1v2 tier (~$150/mo) |
| 7 | **Multi-region failover** with Azure Front Door | Survives full region outage | ~$200/mo + geo-replicated SQL |
| 8 | **WAF on Static Web App** | Protects dashboard from common web attacks | Standard tier ($9/mo) |

---

## Measurement & Reporting

SLO compliance is tracked in three places:

1. **SRE Operations Dashboard** (Azure Workbook) — real-time burn rate, updated automatically.
2. **Monthly SRE report** — manually compiled from KQL queries above. Includes burn rate trend, incidents that consumed budget, and action items.
3. **Postmortem action items** — every incident that consumes error budget generates tracked action items (see `docs/postmortem-template.md`).
