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

## 4. Deterministic SID Resolution for Managed Identities

### The Issue
Managed Identities (MIs) assigned to App Services and Function Apps required explicit mapping in Azure SQL (`CREATE USER ... FROM EXTERNAL PROVIDER`). However, because the GitHub Service Principal lacked `Directory.Read.All` permissions (common in locked-down production tenants), the SQL engine could not resolve the identity names, leading to `Login failed` errors.

### The Challenge: Non-Deterministic Binary SIDs
Initial attempts to use "Offline SID Mapping" (calculating the hex-SID from the Object ID) failed because Managed Identity SIDs in Azure SQL are **not** a simple Big-Endian or Little-Endian conversion of the Principal ID. They are specific 16-byte (or 30-byte in some contexts) binary strings assigned internally by Entra ID.

### The Resolution: Surgical Extraction
1. **Authoritative Identification**: We identified the binary SID URLs hidden in the Service Principal's `servicePrincipalNames` metadata (e.g., `https://identity.azure.net/siaJsNUUkzptOku9O7PE+oBGeTqpbqUPb31OSPmsb1Y=`).
2. **Surgical Extraction**: We used a whitelisted Entra Admin context (Tony's local browser tool) to query the database and extract the **actual** hex strings directly from `sys.database_principals`.
3. **Hardcoded Stabilization**: We hardcoded these definitive hex strings in `init-schema.sql` for the production identities:
    - **Web API**: `0xa4dc824c7467f742a5a4d66821038485`
    - **Function App**: `0xde446463bcb8224ab130549d64568b7d`

## 5. Transition to Portable Native Identity Mapping

### The "Ghost Identity" Problem
As noted in warning below, hardcoded SIDs are fragile. If the resource is re-provisioned, the SID changes, breaking the database link. We transitioned from manual Hex SIDs to the native `FROM EXTERNAL PROVIDER` syntax.

### The Resolution
We updated `init-schema.sql` to use dynamic macro-passing for the resource names:
```sql
CREATE USER [$(FUNC_NAME)] FROM EXTERNAL PROVIDER;
ALTER ROLE db_datareader ADD MEMBER [$(FUNC_NAME)];
ALTER ROLE db_datawriter ADD MEMBER [$(FUNC_NAME)];
```
This allows the SQL engine to resolve the identity mapping at deploy-time, provided the deployment principal has sufficient directory permissions.

## 6. The "Database \"\"" Mystery & Catalog Context

### The Issue
Despite a successful mapping, the ingestion functions continued failing with `Error: 916`. The tracing showed: `The server principal "..." is not able to access the database "" under the current security context.`

### The Root Cause: Catalog Ambiguity
1. **Tooling Fallback**: The `azure/sql-action` step in GitHub Actions was connecting to the server but not explicitly pinning the session to `TelemetryDb`. This resulted in the script executing against `master`. In Azure SQL, a Managed Identity is a **contained database user** — it exists in the user database but NOT in `master`.
2. **Connection Leak**: Without an explicit `database:` parameter in the action YAML, the identity was "logged in" to the server but "lost" in the transition to the target catalog, leading to the empty database string `""` error.

### The Resolution: Explicit Pining
1. **GitHub Workflow**: We added `database: "TelemetryDb"` to the `sql-action` step. This forces the runner to establish the session context inside the target database before executing any DDL.
2. **.NET Client Library**: We refactored `VehicleIngestionService.cs` to use an **explicitly opened** `SqlConnection` for `SqlBulkCopy`. By calling `await conn.OpenAsync()` before initializing the bulk copy, we ensure the .NET driver has successfully negotiated the Managed Identity token and set the `Initial Catalog` context, preventing the bulk operation from defaulting to an empty or invalid catalog.


## 5. The Technical Debt of Hardcoded SIDs & The Path to Portability

> [!WARNING]
> The current production resolution utilizes **hardcoded Hex SIDs** in `init-schema.sql`. This was a surgical choice to restore service immediately, but it is **not** an architectural best practice for Infrastructure as Code (IaC) portability.

### The "Destroy and Re-deploy" Risk
If the infrastructure is destroyed (`terraform destroy`) and re-created (`terraform apply`), Azure will provision **new** Managed Identities with **new** Principal IDs and **different** internal Binary SIDs. The hardcoded values in the SQL script will fail as they will point to "Ghost Identities" that no longer exist.

### The "Gold Standard" Resolution (IaC Best Practice)
To achieve a "wipe clean and re-deploy" capability where the entire stack is provisioned automatically, the following architectural steps are required:

#### 1. Entra ID Permission Elevation (Prerequisite)
The GitHub Service Principal (the deployment identity) must be granted the **`Directory.Read.All`** application permission (Microsoft Graph) at the Tenant level. 
*   **Why?**: This allows the SQL Server engine to query the Entra ID Graph during the user creation process to resolve the identity name.

#### 2. Native T-SQL Naming Conventions
With those permissions in place, all hardcoded binary SIDs should be removed from `init-schema.sql` and the deployment workflow. The SQL logic should revert to the native Entra ID resolution pattern:
```sql
-- This command works ONLY if the executing principal has Directory permissions
CREATE USER [app-telemetry-prod-unique] FROM EXTERNAL PROVIDER;
CREATE USER [func-telemetry-prod-unique] FROM EXTERNAL PROVIDER;
```

#### 3. Dynamic Name Macro-Passing
To ensure the script works across environments (Dev, QA, Prod), use macros for the **Identity Name** rather than the SID:
```sql
-- init-schema.sql (The Portable Pattern)
CREATE USER [$(IDENTITY_NAME)] FROM EXTERNAL PROVIDER;
```
The deployment workflow can then pass the name directly from Terraform outputs:
```yaml
# deploy.yml
arguments: '-v IDENTITY_NAME="${{ steps.tf-outputs.outputs.app_service_name }}"'
```

### Summary of the "Best Practice" State
By moving to **Native Name Resolution** with **Explicit Catalog Context**, the platform achieves 100% portability. The system automatically handles new identities during `terraform apply` and ensures the deployment pipeline and application code are always pinned to the correct database context.

---

## 7. Stabilizing CI/CD: Resolving Graph API Permission 403s

### The Issue
After transitioning to `FROM EXTERNAL PROVIDER` for SQL user mapping, the CI/CD pipeline began failing during the `terraform apply` phase with an **HTTP 403 Forbidden** / `Authorization_RequestDenied` error.

### The Root Cause
The GitHub Actions Service Principal (SP) used for deployment lacked the elevated **Microsoft Graph API permissions** (`RoleManagement.ReadWrite.Directory`) required to manage Entra ID Directory Roles. Terraform was attempting to automate the assignment of the "Directory Readers" role to the SQL Server, which is a tenant-level operation requiring high-privilege administrative consent.

### The Resolution
1.  **Decoupled Role Management**: We removed the `azuread` provider and all directory role resources from the Terraform configuration. This eliminated the brittle dependency on Graph API permissions during automated runs.
2.  **Manual Stabilization**: The "Directory Readers" role is now a **one-time manual prerequisite**. Once assigned to the SQL Server's Managed Identity by a Tenant Admin, the role remains stable and persists across application deployments.
3.  **Documentation First**: The requirement was moved from the "Automated" bucket to the "Operational Prerequisite" bucket in the `README.md`.

## 8. Cross-Component Status Synchronization: OpenSky Throttling

### The Issue
An SRE investigation identified a "Misleading UP" signal: the dashboard reported "OpenSky API is UP!" while the background ingestion functions were actually throttled (HTTP 429). 

### The Root Cause
The "Check API Status" tool in the `TelemetryApi` was performing a fresh "canary" request to OpenSky. Because it was a single request, it frequently succeeded, even when the steady-state ingestion (polling every 60s) had tripped the upstream rate limit. The API and Functions shared no state regarding their respective circuit breakers or rate-limit quotas.

### The Resolution
1.  **Shared Persistence**: We introduced a `dbo.system_status` table in the database to act as a shared health state between ingestion and diagnostics.
2.  **Synchronized Diagnostics**: The `OpenSkyFeedService` (Functions) now logs its 429 hits and `X-Rate-Limit-Remaining` counts to the database.
3.  **Inertia-Aware API**: Updated the `ManagementEndpoints` (API) and `/api/health` to check the database *before* attempting a canary. If a circuit breaker is active, the tool now correctly reports **"Throttled (Circuit Breaker Active)"** without making additional requests.

## 9. Local Development: Dynamic Database Contexts

### The Issue
Local development environments (e.g., `TelemetryDev`) failed to start ingestion with `Error: 911` (Database not found).

### The Root Cause
The `VehicleIngestionService.cs` contained a hardcoded `USE TelemetryDb;` statement. While correct for production, this prevented the application from functioning in local environments or CI runners where the database name differed.

### The Resolution
We dynamicized the database context switching by using `conn.Database` (resolved from the connection string's `Initial Catalog`) in the `USE` statement:
```csharp
var databaseName = conn.Database;
using var useDb = new SqlCommand($"USE [{databaseName}];", conn);
```
This ensures the ingestion logic is 100% portable across local, test, and production environments.
