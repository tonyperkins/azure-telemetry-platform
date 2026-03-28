# Azure Telemetry Platform — SRE Code Review & Future Architecture Audit

As requested, I've conducted a robust review mapping the entire Git application logic, Terraform provisioning layer, and React pipeline logic explicitly searching for structural weaknesses or cross-environment edge cases. The codebase is incredibly robust, but the following areas should be targeted for the next sprint.

## 1. Map Rendering Engine Offload (`Leaflet` vs `WebGL`)
- **Current State:** The dashboard leverages standard HTML5 `react-leaflet`. At scaling payloads (~400+ flights/vehicles rendered concurrently), Leaflet manipulates DOM elements physically slowing down the browser frame-rate noticeably.
- **Improvement Needed:** For true production scalability, rendering telemetry maps should be offloaded directly to the user's GPU using WebGL via `Mapbox GL JS` (or its open-source equivalent `MapLibre GL JS`). This easily supports ~50,000+ vectors dynamically animated at 60 FPS without touching CPU threads.

## 2. Configuration Syncing (`MetroGtfsStaticUrl` variable drift)
- **Current State:** Previously, the `MetroIngestionFunction` was improperly pointing to a deprecated static Zip folder. While we fixed the primary Terraform & Function hooks, the `TelemetryApi/appsettings.Development.json` still weakly mentions `"MetroGtfsStaticUrl": "https://www.capmetro.org/planner/includes/gtfs.zip"`. 
- **Improvement Needed:** The `TelemetryApi` does not actively digest GTFS files anyway, so this variable should be purged from the `.NET` configuration schema directly, minimizing security surface.

## 3. Database Schema Migrations Strategy
- **Current State:** We currently drop `init-schema.sql` physically through a GitHub Action `db-init` command running `sqlcmd` directly against Azure.
- **Improvement Needed:** If we add breaking changes (e.g. altering a Column standard) that simple `.sql` script will fail as it lacks formal up/down idempotency logic. Moving strictly to Entity Framework Core Migrations or a tool like `DbUp` would explicitly manage incremental table lifecycle upgrades safely across Development vs Staging vs Production branches seamlessly.

## 4. Automatic Azure IAM Assignments via Terraform Security Principal
- **Current State:** Standard Terraform deployments leverage the `Contributor` role exclusively. Since GitHub Actions do not carry `Owner/User Access Administrator` rights natively, Terraform cannot grant our new `TelemetryApi` the exact "Website Contributor" rights needed to automate the Azure Function Stop/Start routines.
- **Current Workaround:** We had to add error-handling to prompt manual intervention.
- **Improvement Needed:** An Azure Architect should elevate the specific Service Principal backing this GitHub Repository up to `User Access Administrator`. This permits Terraform to fully orchestrate the entire IAM landscape entirely, removing the absolute need for any portal clickery!

## 5. Security & SRE Route Hardening
- **Current State:** To support stopping cost-inducing pipelines via the UI, a `?token=` parameter payload query enforces authorization.
- **Improvement Needed:** We should shift authorization natively into strict JSON Body Bearer Authorization headers over standard `POST` operations ensuring intermediate reverse-proxies (like Cloudflare) cannot accidentally log the sensitive tokens!
