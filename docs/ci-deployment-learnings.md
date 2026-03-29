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
By moving to **Native Name Resolution** with **Elevated Graph Permissions**, the platform achieves 100% portability. Any `terraform apply` will generate a functional state instantly, as Azure SQL will handle the SID mapping dynamically for every new resource.
