# Post-Deployment Learnings: Zero-Trust & CI/CD Stabilization

This document summarizes the critical learnings, architectural gotchas, and resolutions encountered during the final stabilization phase of the Azure Telemetry Platform's CI/CD pipeline and Data Plane security.

## 1. Zero-Trust SQL Identities & GitHub Actions Data Plane Mapping

### The Issue
We successfully transitioned the Azure SQL Server's authentication to **Active Directory Managed Identity** in Terraform, establishing a Zero-Trust architecture by removing the hardcoded SQL Admin password from the application backend. However, the deployed App Service and Function App were subsequently hit with continuous `HTTP 500 Internal Server Errors` because they lacked actual Data Plane permissions to query tables.

We added standard SQL scripts to map the identities, but the pipeline silently failed during execution.

### The Root Cause
The `azure/sql-action@v2` step within `deploy.yml` was originally configured to authenticate against the database using the legacy fallback `sqladmin` credentials. 
Crucially: **A traditional SQL login is strictly prohibited from creating Microsoft Entra ID (Azure AD) users** (e.g., `CREATE USER [...] FROM EXTERNAL PROVIDER;`). 
Furthermore, Microsoft's `sqlcmd` utility (which underpins the action) defaults to swallowing script execution errors resulting in a false-positive "Success" in the GitHub workflow while leaving the database unsecured.

### The Resolution
1. **Entra ID Deployment Pipeline**: We updated Terraform (`infra/modules/sql/outputs.tf`) to output an `Authentication=Active Directory Default` connection string for the GitHub Actions pipeline. This seamlessly authenticates the `azure/sql-action` step using the federated GitHub Service Principal context, automatically elevating its privileges to **Azure AD Administrator** and permitting Entra ID Data Plane mapping.
2. **Fail-Fast Defense**: We prepended `SET XACT_ABORT ON` to `init-schema.sql`. This instructs the SQL processing engine to instantly abort the entire connection transaction and surface a fatal exit code to the runner if *any* statement fails, preventing future silent pipeline regressions.

## 2. Dockerizing CI Integration Tests

### The Issue
The local testing suite relied exclusively on `LocalDB` — a Windows-only SQL Express feature. When ported to the GitHub `ubuntu-latest` CI runners, the `dotnet test` step quietly bypassed test execution entirely because the driver wasn't present, only surfacing later when configured to enforce test results.

### The Resolution
1. **Standard `ubuntu-latest` Integrity**: We discarded `LocalDB` and integrated a native Microsoft SQL Server Docker container directly into the `services:` block of the CI workflow.
2. We utilized the exact same `azure/sql-action@v2` step from deployment to deterministically seed the test database using standard generic credentials, fully simulating the production environment.

## 3. ASP.NET In-Memory Test Environments

### The Issue
Even after successfully provisioning the CI SQL container, the `TelemetryApi.Tests.HealthEndpointTests` (which spin up the full ASP.NET Minimal API in memory via `WebApplicationFactory`) continued to return HTTP 500 errors inside the pipeline.

### The Root Cause
ASP.NET Core applications inherently assume they are executing in `Production` architecture unless explicitly overridden by `ASPNETCORE_ENVIRONMENT`.
Because the testing code was executed on a fresh GitHub Ubuntu runner, the framework loaded the `appsettings.json` profile. Without the `appsettings.Development.json` values present, the API defaulted to hunting for an empty Azure Key Vault, bypassing the local SQL fallback connection entirely and throwing fatal configuration exceptions. 

*(This masked itself during local development because local machine IDEs and terminals frequently inject `ASPNETCORE_ENVIRONMENT=Development` via `.env` or bash profiles).*

### The Resolution
We explicitly mapped the missing environmental contexts via the CI YAML runner context:
```yaml
      - name: dotnet test
        env:
          ASPNETCORE_ENVIRONMENT: Development
          ConnectionStrings__DefaultConnection: "Server=localhost,1433;Database=TelemetryDev;..."
        run: dotnet test ...
```
This forces `WebApplicationFactory` to extract the correct configuration hierarchy from `appsettings.Development.json` and deterministically bind the API controllers to our freshly scaffolded local SQL Docker Container in CI.
