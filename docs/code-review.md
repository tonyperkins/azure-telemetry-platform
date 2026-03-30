# Code Review — Azure Telemetry Platform

**Date:** 2026-03-30
**Scope:** Full repository — backend (.NET 8), frontend (React/TypeScript), infrastructure (Terraform), CI/CD (GitHub Actions), database schema (T-SQL)
**Severity legend:** HIGH = security risk or data-loss potential / MEDIUM = correctness, reliability, or best-practice violation / LOW = maintainability, style, or minor robustness issue

---

## Table of Contents

1. [Backend — TelemetryApi](#1-backend--telemetryapi)
2. [Backend — TelemetryFunctions](#2-backend--telemetryfunctions)
3. [Frontend — Dashboard](#3-frontend--dashboard)
4. [Infrastructure — Terraform](#4-infrastructure--terraform)
5. [CI/CD — GitHub Actions](#5-cicd--github-actions)
6. [Database — SQL Schema](#6-database--sql-schema)
7. [Cross-Cutting Concerns](#7-cross-cutting-concerns)
8. [Summary Table](#8-summary-table)

---

## 1. Backend — TelemetryApi

### `src/TelemetryApi/Program.cs`

| ID | Severity | Line(s) | Finding |
|----|----------|---------|---------|
| P1 | MEDIUM | 125 | `app.UseHttpsRedirection()` is commented out unconditionally, not just for local development. If Azure Front Door / App Service HTTPS termination is bypassed (direct IP, misconfigured proxy), plaintext traffic is accepted with no redirect. Re-enable and guard with `if (!app.Environment.IsDevelopment())`. |
| P2 | MEDIUM | 94–95 | `AllowAnyMethod().AllowAnyHeader()` in the CORS policy is too permissive for a read-mostly API. Restrict to `AllowGetMethod()` and the specific headers the frontend sends. |
| P3 | LOW | 87–88 | If `AllowedOrigins` is absent in production config, the code silently falls back to `http://localhost:5173`, which will block the production frontend. Emit a startup warning log in non-development environments when this fallback is used. |
| P4 | LOW | 49, 150 | Fully-qualified `Microsoft.ApplicationInsights.Extensibility.ITelemetryInitializer` used inline; add a `using` directive for readability. |

---

### `src/TelemetryApi/Endpoints/VehicleEndpoints.cs`

| ID | Severity | Line(s) | Finding |
|----|----------|---------|---------|
| V1 | MEDIUM | 42, 72, 103 | All three handlers are missing a `CancellationToken` parameter. ASP.NET Core Minimal APIs inject it automatically. Without it, cancelled client connections continue executing SQL queries, wasting DTU budget. |
| V2 | MEDIUM | 108–120 | `GetBatchPaths` null-checks `source` but then uses `source!.ToLowerInvariant()` (line 120) with a null-forgiving operator. If `source` binds to `null` despite the default, this throws `NullReferenceException` at runtime. Remove the `!` and add an explicit null guard. |
| V3 | LOW | 82–85 | Validation rejects `hours` values 7–24 with a 400, yet the error message reads "Values > 6 will be capped at 6." This is contradictory: either remove the 400 and let the repository cap silently, or fix the message to state the allowed maximum is 6. |

---

### `src/TelemetryApi/Endpoints/ManagementEndpoints.cs`

| ID | Severity | Line(s) | Finding |
|----|----------|---------|---------|
| M1 | HIGH | 133 | `ValidateToken` compares tokens with `string ==`, which is vulnerable to timing attacks. Replace with `CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(provided), Encoding.UTF8.GetBytes(master))`. |
| M2 | HIGH | 147 | `new ArmClient(new DefaultAzureCredential())` is constructed inside `GetFunctionAppResource`, which is called on every request. `ArmClient` builds an internal HttpClient pipeline; creating it per-request causes socket exhaustion under load. Register as a singleton and inject. |
| M3 | MEDIUM | 15–29 | `/api/manage/status` and `/api/manage/opensky-status` are unauthenticated. They expose operational intelligence (Function App running state, OpenSky rate-limit balance) to any caller. Apply the same token gate used for `/start` and `/stop`. |
| M4 | MEDIUM | 51 | `Encoding.ASCII.GetBytes($"{clientId}:{clientSecret}")` silently drops non-ASCII characters in credentials. Use `Encoding.UTF8`. |
| M5 | MEDIUM | 98, 114 | Failed authentication attempts are not logged. Add a warning log with the source IP on every `ValidateToken` failure to produce an audit trail. |
| M6 | MEDIUM | 100, 116, 144 | `GetFunctionAppResource` throws `InvalidOperationException` on missing config keys. Neither `StopFunctionApp` nor `StartFunctionApp` catches this, producing an unhandled 500 with no `TrackException` call. |
| M7 | LOW | 84–90 | `ex.Message` returned directly in the response body can leak SDK version strings or internal implementation details. Return a generic message and log the original exception server-side. |
| M8 | LOW | 47 | `client.Timeout = TimeSpan.FromSeconds(10)` is redundant; the named `"OpenSky"` `HttpClient` already has this timeout set in `Program.cs`. Remove the duplicate assignment. |

---

### `src/TelemetryApi/Endpoints/HealthEndpoints.cs`

| ID | Severity | Line(s) | Finding |
|----|----------|---------|---------|
| H1 | MEDIUM | 55, 128 | `GetHealth` and `GetMetrics` are missing `CancellationToken` parameters (same as V1). |
| H2 | MEDIUM | 105–108 | Aggregate health logic contradicts the XML doc comment. A mix of `healthy` + `unhealthy` sources returns `degraded`, where operators would expect `unhealthy`. Align the code to the specification or update the documentation. |
| H3 | LOW | 128–155 | `GetMetrics` has no top-level error handler. `GetMetricsAsync` catches `SqlException` internally, but any other exception (e.g., `ObjectDisposedException`) propagates as an unhandled 500 with no `TrackException` call. |

---

### `src/TelemetryApi/Data/VehicleRepository.cs`

| ID | Severity | Line(s) | Finding |
|----|----------|---------|---------|
| R1 | HIGH | 318–328 | The Polly retry policy is **instantiated on every call** to `ExecuteQueryAsync`. This allocates new delegates and Polly state for every query. Define it as a `private static readonly` field initialized once. |
| R2 | MEDIUM | 189, 201–212 | `dynamic` used for SQL result rows in `GetMetricsAsync`. A typo in a column name produces a `RuntimeBinderException` at runtime instead of a compile error. Use a typed private DTO. |
| R3 | MEDIUM | 21, 26 | `VehicleRepository` depends on the concrete `DbConnectionFactory` class rather than an interface. The Functions project correctly uses `IDbConnectionFactory`. This prevents unit-testing the API repository without a real database connection. Extract and inject `IDbConnectionFactory`. |
| R4 | MEDIUM | 326 | String interpolation inside the Polly `onRetry` callback defeats Application Insights structured logging. Use message templates with named parameters instead of `$"..."`. |
| R5 | LOW | 215 | `(long)dbStats.records_last_24h` — T-SQL `COUNT(*)` returns `INT` (32-bit). The cast works via boxing, but prefer typed DTOs (see R2) to eliminate this ambiguity. |
| R6 | LOW | 139 | Dapper tuple mapping `(string Source, DateTime? LastIngest, int VehicleCount)` depends on **column position** order. A reordered SQL column silently maps values to the wrong tuple members. Use a named POCO. |

---

### `src/TelemetryApi/Services/GtfsStaticService.cs`

| ID | Severity | Line(s) | Finding |
|----|----------|---------|---------|
| G1 | MEDIUM | 47–64, 75–119 | Cache population uses a manual `TryGetValue` → fetch → `Set` pattern, which is not thread-safe. Multiple concurrent cold-start requests can each trigger a full GTFS ZIP download (2–5 MB). Use `IMemoryCache.GetOrCreateAsync`, which internally prevents this stampede. |
| G2 | MEDIUM | 46, 71 | No `CancellationToken` on `GetRoutesAsync` or `GetStopsAsync`. A 5 MB HTTP download over a 120 s timeout cannot be aborted on client disconnect. |
| G3 | MEDIUM | 255, 296, 351 | CSV column indices (`idIdx`, `latIdx`, `lonIdx`, etc.) are never validated to be `>= 0` after `IndexOf`. If a required column is absent from the header, array access on index `-1` throws `IndexOutOfRangeException`. Explicitly guard: `if (idIdx < 0 || latIdx < 0 || lonIdx < 0) return new();`. |
| G4 | LOW | 137–141, 90–95 | Hardcoded fallback URL array is duplicated between `FetchAndParseAsync` and `GetStopsAsync`. Extract to a private `string[] GetFeedUrls()` method. |
| G5 | LOW | 161 | `throw new Exception("All GTFS URLs failed")` — avoid throwing the base `Exception`. Use `HttpRequestException` or a custom `GtfsFeedUnavailableException`. |
| G6 | LOW | 86, 131 | `File.ReadAllBytesAsync` loads the entire ZIP into memory before opening `ZipArchive`. Open a `FileStream` directly to reduce peak allocation. |

---

## 2. Backend — TelemetryFunctions

### `src/TelemetryFunctions/MetroIngestionFunction.cs`

| ID | Severity | Line(s) | Finding |
|----|----------|---------|---------|
| MF1 | MEDIUM | 43 | `RunAsync` has no `CancellationToken` parameter. The Azure Functions host provides one on shutdown; without it, in-flight SQL bulk copies run to completion during graceful shutdown, delaying host restart. |
| MF2 | MEDIUM | 43–94 | No top-level `try/catch` in `RunAsync`. An unexpected exception propagates untracked — no `TrackException` call covers the outer function invocation. |
| MF3 | LOW | 52, 82 | `sw.Stop()` is only called on the success path. The early-return at line 76 (zero vehicles) exits without stopping the stopwatch, so elapsed time for that path is never recorded. |

---

### `src/TelemetryFunctions/FlightIngestionFunction.cs`

| ID | Severity | Line(s) | Finding |
|----|----------|---------|---------|
| FF1 | MEDIUM | 43 | Same as MF1 — no `CancellationToken` parameter. |
| FF2 | MEDIUM | 43–106 | Same as MF2 — no top-level `try/catch` with `TrackException`. |
| FF3 | LOW | 52, 97 | Same as MF3 — `sw.Stop()` not reached on zero-vehicle early-return path. |
| FF4 | LOW | 72–73 | `vehicles = withPosition` when `filterOnGround = false` creates an alias to the same `List<T>` reference. Future mutations of `vehicles` would unexpectedly mutate `withPosition`. Use `.ToList()` to produce a distinct copy. |

---

### `src/TelemetryFunctions/RetentionCleanupFunction.cs`

| ID | Severity | Line(s) | Finding |
|----|----------|---------|---------|
| RC1 | MEDIUM | 57–77, 82 | The SQL WHILE loop uses `WAITFOR DELAY '00:00:01'` per batch. A large backlog (600 K+ rows = 120+ batches) accumulates over 120 s of delay alone, hitting `commandTimeout: 120` mid-loop and leaving a partial cleanup. Increase the command timeout significantly or move batching to application code with per-iteration `CancellationToken` checks. |
| RC2 | MEDIUM | 22–28 | SRE comment calculates "14,400 records/day" but the math (120 buses × 2/min × 60 min) equals **14,400 per hour**. During a 16-hour service day the actual figure is ~230,000/day. This affects all capacity-planning estimates that reference this comment. Correct the documentation. |
| RC3 | LOW | 50 | Timer trigger `"0 0 2 * * *"` does not explicitly set `RunOnStartup = false`. If the function app restarts within the trigger minute, the runtime may fire immediately. Set `RunOnStartup = false` if unintended execution is a concern. |

---

### `src/TelemetryFunctions/Services/VehicleIngestionService.cs`

| ID | Severity | Line(s) | Finding |
|----|----------|---------|---------|
| VI1 | HIGH | 33–68, 128–163 | The two `BulkInsertAsync` overloads duplicate the entire connection setup, `SqlBulkCopy` configuration, error handling, and logging verbatim. Any change (timeout, batch size, logging format) must be made in two places. Extract a shared private `ExecuteBulkCopyAsync(DataTable table, string vehicleType)` method. |
| VI2 | HIGH | 204 | `v.Latitude!.Value` uses the null-forgiving operator on a `double?`. The calling code currently filters nulls, but this cross-method contract is not enforced at the type level. Add an explicit guard inside `BuildDataTable` or model validated vehicles as a distinct non-nullable type. |
| VI3 | MEDIUM | 42–67, 135–162 | `BulkInsertAsync` accepts no `CancellationToken`. `SqlBulkCopy.WriteToServerAsync` has a cancellation-accepting overload; without it an in-progress bulk copy cannot be aborted during shutdown. |
| VI4 | MEDIUM | 42–49, 135–143 | No transaction wraps `SqlBulkCopy`. A dropped connection mid-copy with `BatchSize = 500` can commit some batches and skip others, leaving partially written data for a polling cycle. Wrap in a `SqlTransaction`. |
| VI5 | MEDIUM | 112 | `DBNull.Value` inserted for `on_ground` on metro rows. If the `on_ground` column is `NOT NULL BIT`, this causes a constraint violation on every metro batch. Confirm schema nullability; if NOT NULL, insert a default value (`false`). |
| VI6 | LOW | 23 | Constructor accepts a raw `string connectionString` rather than `IDbConnectionFactory`. Injecting the interface (as `RetentionCleanupFunction` does) is more consistent and testable. |

---

### `src/TelemetryFunctions/Services/OpenSkyFeedService.cs`

| ID | Severity | Line(s) | Finding |
|----|----------|---------|---------|
| OS1 | HIGH | 29–30, 86–101, 121 | `_lastRateLimitTime` is a `private static DateTime?` written from multiple threads without synchronization. Concurrent Function App invocations create a data race. Use `volatile` with `Interlocked.CompareExchange`, or protect with a `lock`. |
| OS2 | MEDIUM | 220–227 | `BuildUrl` interpolates bbox config segments directly into a URL without validating they are valid floating-point numbers. A misconfigured value produces a silently rejected request. Validate with `double.TryParse` and throw `ArgumentException` for invalid input. |
| OS3 | MEDIUM | 44–50 | Basic Auth header is set at construction time. If the OpenSky secret is rotated in Key Vault, the new value is not picked up until the function app restarts. Set the header per-request for rotatable credentials. |
| OS4 | LOW | 65–74 | In the Polly `onRetry` callback, `outcome.Result?.StatusCode` is null when the outcome is an `HttpRequestException`, logging `null` as the status code. Add an `outcome.Exception != null` branch. |
| OS5 | LOW | 138 | `ReadAsStringAsync()` has no size guard. A large WAF error page is loaded fully into memory. Consider `MaxResponseContentBufferSize` on the `HttpClient` or a stream length check. |

---

### `src/TelemetryFunctions/Services/ProtobufMetroFeedService.cs`

| ID | Severity | Line(s) | Finding |
|----|----------|---------|---------|
| PM1 | MEDIUM | 31–41 | The retry policy retries on **all** non-success HTTP responses, including 429 (rate limit), 401, and 404. Retrying a 429 actively worsens the rate-limit situation. Exclude status codes for which retrying is counter-productive. |
| PM2 | MEDIUM | 44–55 | No `CancellationToken` parameter. The retry policy can accumulate up to 14 s of backoff delays in a 30 s timer function, causing overlapping invocations. |
| PM3 | LOW | 175–264 | Nested protobuf model classes (`FeedMessage`, `FeedHeader`, etc.) are defined as `public` types inside `ProtobufMetroFeedService`. Move them to `Models/GtfsRt/` — they are data models unrelated to the service's behavior. |
| PM4 | LOW | 157 | `(long)vp.timestamp` casts a `ulong` without an overflow check. A corrupted far-future timestamp wraps silently to a negative value. Use `checked((long)vp.timestamp)` or clamp to a valid range. |
| PM5 | LOW | 78 | HTML detection checks `bytes[0] == '<'` but misses UTF-8 BOM-prefixed responses (`bytes[0]` is `0xEF`). Scan the first 512 bytes for `<!DOCTYPE` or `<html` after any BOM. |
| PM6 | LOW | 36 | Three retries with exponential delay (2 s, 4 s, 8 s) plus a 10 s `HttpClient.Timeout` per attempt can block a single invocation for ~42 s in a 30 s timer function. Combine with `Policy.TimeoutAsync` to cap total policy duration. |

---

## 3. Frontend — Dashboard

### `dashboard/src/App.tsx`

| ID | Severity | Line(s) | Finding |
|----|----------|---------|---------|
| A1 | HIGH | 327 | `prevHealth.current = health` is never assigned. The guard `if (prevHealth.current)` at line 236 is permanently `false`, so all health-transition alert logic (metro/flight degraded, recovered) **never fires**. Add the assignment at the end of the effect alongside the existing `prevMetrics.current = metrics` line. |
| A2 | HIGH | 335, 455–503 | No React `ErrorBoundary` anywhere in the component tree. An unhandled render exception in any child (Map, VehicleMarker, SreSidebar) will unmount the entire app to a blank screen. Wrap top-level sections in an `ErrorBoundary`. |
| A3 | MEDIUM | 47–48 | `prevHealth` and `prevMetrics` refs are typed `useRef<any>`. This suppresses TypeScript checking on all downstream property accesses. Type them with the actual response interfaces. |
| A4 | MEDIUM | 91–92 | `health?.sources.flight.configDisabled` — optional chaining stops at `health?.sources`; if `sources.flight` is absent a runtime error still occurs. Use full optional chaining: `health?.sources?.flight?.configDisabled`. |
| A5 | MEDIUM | 94–115 | `extractRouteId` is called inside a `useMemo` but is absent from the dependency array, violating `exhaustive-deps`. Add the function to the dep array or wrap it in `useCallback`. |
| A6 | MEDIUM | 390–395, 417–422 | Inline `onMouseEnter`/`onMouseLeave` style-mutation handlers recreated on every render of a frequently re-rendering root component. Memoize with `useCallback` or move hover logic to CSS. |
| A7 | LOW | 139 | `window.confirm()` and `window.location.reload()` are inconsistent with the rest of the UI and fail in sandboxed iframes. Use a controlled React modal. |
| A8 | LOW | 167 | Toast IDs generated with `Date.now() + Math.random()`. Use `crypto.randomUUID()` instead. |

---

### `dashboard/src/hooks/useVehicleData.ts`

| ID | Severity | Line(s) | Finding |
|----|----------|---------|---------|
| UD1 | MEDIUM | 54–57 | No `AbortController` for either `fetch` call. If the component unmounts while a request is in flight, `setState` is called on an unmounted component. Return `() => controller.abort()` from the effect. |
| UD2 | MEDIUM | 66 | Health fetch failures are silently discarded (`healthRes.ok ? … : null`). A 503 produces no user notification, while the vehicles fetch correctly throws. Apply consistent error handling. |
| UD3 | LOW | 65 | JSON parse errors and network errors are caught by the same handler, making them indistinguishable in error state. Wrap `JSON.parse` in a nested try/catch with a distinct message. |
| UD4 | LOW | 119 | `// eslint-disable-next-line react-hooks/exhaustive-deps` has no explanatory comment. Add a comment stating that `recordRequest` is intentionally excluded because it is a stable function identity from `useApiMetrics`. |

---

### `dashboard/src/hooks/useApiMetrics.ts`

| ID | Severity | Line(s) | Finding |
|----|----------|---------|---------|
| AM1 | MEDIUM | 28 | `recordRequest` is not wrapped in `useCallback`. A new function reference is created on every render, forcing `useVehicleData` to suppress `exhaustive-deps` via a lint-disable comment. Wrap in `useCallback([])`. |
| AM2 | MEDIUM | 42 | `lastError: error \|\| prev.lastError` retains the old error string indefinitely after a successful recovery. Set `lastError: null` unconditionally on success. |

---

### `dashboard/src/components/SreSidebar.tsx`

| ID | Severity | Line(s) | Finding |
|----|----------|---------|---------|
| SS1 | HIGH | 89–111 | The management token is collected via `window.prompt()`. This is trivially exfiltrable by any XSS payload and visible in browser developer tools. For an endpoint that can stop/start production ingestion, replace with a proper modal using a password input field. |
| SS2 | MEDIUM | 79 | `VITE_API_BASE_URL \|\| 'http://localhost:5200'` — a plaintext HTTP fallback in a production build triggers mixed-content blocking on HTTPS origins. Make the env variable required and fail the build if absent. |
| SS3 | MEDIUM | 83–87 | `fetch` in `useEffect` without `AbortController` cleanup causes state updates on an unmounted component if the sidebar is collapsed before the request completes. |
| SS4 | MEDIUM | 686–688 | Multiple `Sparkline` components with the same `color` emit duplicate SVG `linearGradient` IDs. The second gradient is ignored, producing incorrect fills. Use unique IDs per component instance. |
| SS5 | MEDIUM | 793–800 | Each `SLOBadge` instance injects the same `@keyframes pulse` block into the DOM on every render. Move the animation to a global stylesheet or CSS module. |
| SS6 | MEDIUM | 401–411 | Props inside the `simulateMetroFailure !== undefined` guard block use `!` null-forgiving operators on other optional props. If only `simulateMetroFailure` is provided, accessing the others throws at runtime. Guard each prop individually. |
| SS7 | LOW | 76 | `const handleToggleCollapse = onToggleCollapse` is a trivial alias with no added logic. Use `onToggleCollapse` directly in JSX. |

---

### `dashboard/src/components/VehicleMarker.tsx`

| ID | Severity | Line(s) | Finding |
|----|----------|---------|---------|
| VM1 | HIGH | 191–243 | The cleanup function (lines 237–241) sets `markerRef.current = null` before the next effect body runs. This means `if (!markerRef.current)` (line 197) is **always true**, making the `setLatLng`/`setIcon` optimization branch (lines 232–234) **permanently unreachable dead code**. Every position update performs a full remove-and-recreate cycle instead of a cheap mutation. Fix by nulling the ref only in the final unmount cleanup, not on every dependency change. |
| VM2 | HIGH | 203–218 | `createRoot(container)` inside the popup factory is never followed by `root.unmount()`. When the Leaflet popup closes, the React root and all component state are leaked. Store the root reference and call `root.unmount()` in the popup remove/close handler. |
| VM3 | MEDIUM | 108 | `label` from upstream data is interpolated directly into the Leaflet `DivIcon` HTML string without escaping. Characters like `<`, `>`, or `"` create a stored-XSS vector. Escape the value before interpolation (e.g., use `textContent` assignment instead of HTML string building). |
| VM4 | LOW | 117 | `renderToStaticMarkup(<PlaneIcon heading={…} />)` is called on every marker update for every flight. Cache results by heading value to avoid repeated server-side rendering. |
| VM5 | LOW | 165 | `22 + label.length * 7 + 28` hard-codes font-metric offsets for icon sizing. Any CSS change to label font-size or padding silently produces incorrect bounding boxes. Extract as named constants. |

---

## 4. Infrastructure — Terraform

### `infra/main.tf`

| ID | Severity | Line(s) | Finding |
|----|----------|---------|---------|
| TM1 | MEDIUM | 5 | `version = "~> 3.0"` permits all future 3.x minor releases, which may introduce undocumented breaking changes in resource schemas. Pin to a narrower range: `>= 3.90, < 4.0`. |
| TM2 | MEDIUM | 33–40 | `prevent_deletion_if_contains_resources = false` is configured globally on the provider. A mistyped `terraform destroy -target` or runbook error could silently remove an entire resource group. Apply this as a targeted exception only, not a global default. |
| TM3 | LOW | 56 | Hardcoded naming suffix `7d94f06a` is not tied to any verifiable source. If a second deployment is needed in the same subscription, all globally-unique resource names collide. Document the generation method or derive it via `random_id`. |

---

### `infra/modules/sql/main.tf`

| ID | Severity | Line(s) | Finding |
|----|----------|---------|---------|
| TS1 | HIGH | 55–61 | The `AllowAzureServices` firewall rule (`0.0.0.0`/`0.0.0.0`) does not restrict access to your own tenant — **any** Azure-hosted workload globally can reach the SQL Server endpoint. Replace with Virtual Network service endpoints or Private Endpoint and remove this rule. |
| TS2 | HIGH | 36 | The production database has no `lifecycle { prevent_destroy = true }` block. A `terraform destroy` or accidental resource replacement deletes all vehicle history without a safeguard. Add `prevent_destroy = true` to both the server and database resources. |
| TS3 | MEDIUM | 17 | `administrator_login_password = var.sql_admin_password` is stored in Terraform state in plaintext. Mark the variable `sensitive = true` to suppress it from logs and plan output. |
| TS4 | LOW | 36–53 | No explicit `azurerm_mssql_database_backup_short_term_retention_policy` resource. The default 7-day PITR for serverless tier is not expressed in code; document the intent to prevent silent changes to Azure defaults. |

---

### `infra/modules/keyvault/main.tf`

| ID | Severity | Line(s) | Finding |
|----|----------|---------|---------|
| TK1 | MEDIUM | 37 | `secret_permissions = ["Get", "List", "Set", "Delete", "Purge", "Recover"]` grants the CI/CD service principal `Purge` permission, allowing permanent deletion of secrets even with soft-delete active. Remove `Purge` from routine deployment access. |
| TK2 | MEDIUM | 59–98 | All `azurerm_key_vault_secret` resource values (including `opensky_client_secret` and `management_admin_token`) appear in plaintext in Terraform state. Mark the corresponding variables `sensitive = true`. |
| TK3 | MEDIUM | 59–98 | No `lifecycle { ignore_changes = [value] }` on secret resources. If a secret is rotated in Key Vault outside of Terraform, the next `terraform apply` overwrites the rotated value back to the state-stored original, breaking the rotation workflow. |
| TK4 | LOW | 12–29 | `soft_delete_retention_days = 7` is the minimum allowed value. For production secrets a 30–90 day window is the common operational standard. |

---

### `infra/modules/appservice/main.tf`

| ID | Severity | Line(s) | Finding |
|----|----------|---------|---------|
| TA1 | HIGH | 58 | `"AppInsights__ApiKey" = var.app_insights_api_key` stores the key as a plaintext App Service setting. All other secrets in this module use `@Microsoft.KeyVault(SecretUri=...)` references. Migrate this key to Key Vault and use the same reference pattern. |
| TA2 | MEDIUM | — | No `https_only = true` attribute on the `azurerm_windows_web_app` resource. Without it, the Azure platform accepts plaintext HTTP connections before the application layer. Add `https_only = true`. |
| TA3 | MEDIUM | 10 | `sku_name = "B1"` (Basic tier) provides no deployment slots, no VNet integration, no auto-scaling, and no SLA for traffic management. For production workloads, upgrade to Standard S1 or higher. |

---

### `infra/modules/monitoring/main.tf`

| ID | Severity | Line(s) | Finding |
|----|----------|---------|---------|
| TN1 | HIGH | 103–125 | The API 5xx alert uses `threshold = 5` against the raw failed-request count. The description states "5% error rate," but 5 absolute failures during low traffic fires the alert; a genuine 10% error rate during peak traffic may not. Convert to a dynamic-threshold alert or compute the ratio using a KQL-based scheduled alert. |
| TN2 | MEDIUM | 21 | Log Analytics 30-day retention may be insufficient for post-incident analysis and compliance frameworks (SOC 2, ISO 27001 typically require 90–365 days). Increase `retention_in_days`. |
| TN3 | MEDIUM | 127–131 | The Application Insights API key is granted `draft` and `extendqueries` permissions beyond what read-only monitoring requires. Reduce to `aggregate`, `api`, and `search`. |
| TN4 | LOW | 73–77 | KQL alert query does not include an explicit `| where timestamp > ago(5m)` time bound. Add an explicit filter as a defensive practice against delayed alert evaluations scanning unexpectedly large windows. |

---

## 5. CI/CD — GitHub Actions

### `.github/workflows/ci.yml`

| ID | Severity | Line(s) | Finding |
|----|----------|---------|---------|
| CI1 | HIGH | 31, 53–54, 61–62 | SQL Server container password `YourStrong@Passw0rd` is hardcoded in the workflow YAML committed to source control. Move to a GitHub Actions secret: `${{ secrets.CI_SQL_PASSWORD }}`. |
| CI2 | HIGH | 4–5 | CI only triggers on `workflow_dispatch`. There is no `push` or `pull_request` trigger, meaning broken commits can be merged to `main` with no automated gate. Add `on: push: branches: [main]` and `pull_request` triggers. |
| CI3 | HIGH | 63, 72 | `continue-on-error: true` on the `dotnet test` step and `fail-on-error: false` on the test reporter mean **test failures produce a green pipeline status**. Remove both flags so test failures block the run. |
| CI4 | MEDIUM | 36, 39, 51, 66, 91, 100, 112, 115, 131, 149 | All action `uses:` references use mutable version tags (e.g., `actions/checkout@v4`). A compromised tag owner can push malicious code under the same tag. Pin each action to a specific commit SHA. |

---

### `.github/workflows/deploy.yml`

| ID | Severity | Line(s) | Finding |
|----|----------|---------|---------|
| CD1 | MEDIUM | 64–67, 73–76, 90–93, 106–109 | `${{ fromJson(secrets.AZURE_CREDENTIALS).clientSecret }}` evaluates at YAML-rendering time. If the JSON is malformed, the raw string may appear in error output before GitHub's secret masking applies. Use dedicated per-field secrets or validate the JSON structure before parsing. |
| CD2 | MEDIUM | 117–119 | `terraform output -raw sql_connection_string` is captured before `add-mask` takes effect. The value may be echoed by the shell before masking. Move `add-mask` before the capture command, or avoid passing the connection string through workflow output entirely. |
| CD3 | MEDIUM | 20–22 | `cancel-in-progress: true` on the production deployment concurrency group cancels a running `terraform apply` mid-execution if a new dispatch is triggered, leaving infrastructure in a partially-applied state. Set `cancel-in-progress: false` for production; queue new runs instead. |
| CD4 | MEDIUM | 42, 45, 56, 140, 152, 158, 200, 205, 222, 224, 244 | All action `uses:` references use mutable version tags. Pin each to a specific commit SHA (same concern as CI4). |

---

## 6. Database — SQL Schema

### `scripts/init-schema.sql`

| ID | Severity | Line(s) | Finding |
|----|----------|---------|---------|
| DB1 | MEDIUM | 94–113 | Managed Identity SIDs and resource names are hardcoded as literals. The script cannot be used for staging or dev without manual editing, and SIDs change if the App Service or Function App is ever recreated. Parameterise via `SQLCMD` variables or environment-specific scripts. |
| DB2 | MEDIUM | 39–43 | `FLOAT` used for latitude and longitude. SQL Server `FLOAT` is binary IEEE 754, introducing rounding errors at the 15th–16th significant digit. Use `DECIMAL(9,6)` for exact decimal representation (~1 cm precision), consistent with geospatial conventions. |
| DB3 | MEDIUM | 34–47 | No unique constraint on `(vehicle_id, source, ingested_at)` or similar. The same vehicle can be inserted multiple times per poll cycle, silently inflating vehicle counts and corrupting history queries. |
| DB4 | LOW | 45 | `raw_json NVARCHAR(MAX)` rows exceeding ~4 KB push data to off-row LOB pages, fragmenting the clustered index. For payloads regularly above this threshold, compress via `COMPRESS`/`DECOMPRESS` or store in a separate `raw_payloads` table referenced by FK. |
| DB5 | LOW | 94–113 | The idempotency pattern `DROP USER … CREATE USER` silently revokes any permissions granted outside this script on re-execution. Prefer `IF NOT EXISTS … CREATE USER` without the preceding `DROP` for subsequent runs. |
| DB6 | LOW | 34–47 | `route_id` is not a dedicated column; `App.tsx` and `VehicleMarker.tsx` both parse `raw_json` on every render to extract it. Promoting `route_id` to `NVARCHAR(20) NULL` and including it in the `IX_vehicles_source_ingested` index eliminates repeated JSON parsing and enables server-side route filtering. |
| DB7 | LOW | 34–47 | No data retention / TTL mechanism is defined at the schema level. The `RetentionCleanupFunction` handles daily cleanup, but nothing prevents unbounded growth if the function stops running. Document or enforce a maximum retention window. |

---

## 7. Cross-Cutting Concerns

| ID | Severity | Affected Files | Finding |
|----|----------|---------------|---------|
| X1 | MEDIUM | All async methods (entire codebase) | `CancellationToken` is absent from every public async method across `VehicleEndpoints`, `HealthEndpoints`, `ManagementEndpoints`, `GtfsStaticService`, `MetroIngestionFunction`, `FlightIngestionFunction`, `VehicleIngestionService`, `OpenSkyFeedService`, and `ProtobufMetroFeedService`. Graceful shutdown during Azure deployments, scale-in events, or function host restarts cannot interrupt in-flight I/O. Add `CancellationToken` to all public async signatures and propagate to inner calls. |
| X2 | MEDIUM | `VehicleRepository`, `VehicleIngestionService` | The API project uses the concrete `DbConnectionFactory` class while the Functions project correctly uses `IDbConnectionFactory`. Align the API to use the interface to enable unit testing without a real database. |
| X3 | MEDIUM | `ManagementEndpoints`, `OpenSkyFeedService`, `ProtobufMetroFeedService` | No startup validation that `OPENSKY_CLIENT_ID`, `OPENSKY_CLIENT_SECRET`, and `MANAGEMENT_ADMIN_TOKEN` meet minimum format requirements. An empty-string value passes `IsNullOrEmpty` checks and silently degrades authentication behavior. Validate at startup and fail-fast with a descriptive error. |
| X4 | LOW | `MetroIngestionFunction`, `FlightIngestionFunction` | Elapsed time is not recorded on the zero-vehicle early-exit path. A fast empty (feed returned in 50 ms with no data) is operationally distinct from a slow empty (feed timed out). Log elapsed time on all exit paths. |

---

## 8. Summary Table

| Severity | Count | Key Themes |
|----------|-------|-----------|
| **HIGH** | 16 | Timing-safe token comparison; `ArmClient` per-request socket exhaustion; thread-unsafe static field; Polly policy per-call allocation; duplicated bulk insert code; `VehicleMarker` dead optimization + React root leak; `window.prompt()` for admin token; `prevHealth.current` never assigned (alert dead code); missing `ErrorBoundary`; SQL firewall `0.0.0.0`; missing `prevent_destroy`; plaintext App Insights API key in App Service settings; 5xx alert using absolute count not ratio; CI password hardcoded in YAML; test failures allowed to pass; no automatic CI trigger |
| **MEDIUM** | 38 | `CancellationToken` absent throughout codebase; unauthenticated read management endpoints; ASCII vs UTF-8 encoding; incorrect aggregate health logic; `dynamic` SQL mapping; GTFS cache stampede; CSV index validation missing; retry-all on 429; no interface for `DbConnectionFactory` in API; no transaction on bulk insert; `AbortController` missing in React hooks; XSS in `VehicleMarker` label; SVG gradient ID collision; `FLOAT` lat/lon in SQL; missing unique constraint; Terraform provider version too broad; Key Vault `Purge` permission; secrets in Terraform state; `https_only` missing; log retention 30 days; `cancel-in-progress` on production deploy; action versions not pinned |
| **LOW** | 24 | Duplicate URL arrays; base `Exception` thrown; `window.confirm` usage; toast ID generation; trivial alias; magic numbers in icon sizing; `soft_delete_retention_days = 7`; hardcoded naming suffix; SQL `DROP USER` idempotency issue; `raw_json` LOB fragmentation; `route_id` not a dedicated column; eslint-disable without explanation; `sw.Stop()` skipped on early-exit paths |

**Total findings: 78**

---

*All findings should be validated against current production context and business constraints before prioritising remediation.*
