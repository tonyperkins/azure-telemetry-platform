using TelemetryFunctions.Services;
using TelemetryFunctions.Data;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

// =============================================================================
// MetroIngestion — Azure Functions Isolated Worker host configuration
//
// SRE: We use the isolated worker model (.NET 8) rather than the in-process
// model because:
//   1. It runs on .NET 8 GA (in-process is pinned to the Functions host version)
//   2. It supports proper dependency injection and middleware
//   3. It will be the only supported model in future Functions versions
// =============================================================================

var host = new HostBuilder()
    .ConfigureFunctionsWorkerDefaults()
    .ConfigureServices((context, services) =>
    {
        // SRE: IHttpClientFactory manages HttpClient lifetimes and connection pooling.
        // Do NOT use 'new HttpClient()' inside a Function — it creates a new socket
        // per invocation, which causes port exhaustion at 30-second poll frequency.
        services.AddHttpClient<ProtobufMetroFeedService>(client =>
        {
            client.Timeout = TimeSpan.FromSeconds(10);
            client.DefaultRequestHeaders.Add(
                "User-Agent", "azure-telemetry-platform/1.0");
        });

        // SRE: Flight injection client
        services.AddHttpClient<OpenSkyFeedService>(client =>
        {
            client.Timeout = TimeSpan.FromSeconds(15);
            client.DefaultRequestHeaders.Add(
                "User-Agent", "azure-telemetry-platform/1.0");
        });

        // VehicleIngestionService requires the connection string at construction time
        services.AddSingleton<VehicleIngestionService>(sp =>
        {
            var config = sp.GetRequiredService<Microsoft.Extensions.Configuration.IConfiguration>();
            // SRE: Connection string resolved from Key Vault reference at startup.
            // In Azure, the Function App setting references @Microsoft.KeyVault(SecretUri=...)
            // which the Functions runtime resolves before passing to IConfiguration.
            var connStr = config["SQL_CONNECTION_STRING"]
                ?? throw new InvalidOperationException("SQL_CONNECTION_STRING is not configured.");
            var logger  = sp.GetRequiredService<Microsoft.Extensions.Logging.ILogger<VehicleIngestionService>>();
            return new VehicleIngestionService(connStr, logger);
        });

        // SRE: Connection factory for Retention cleanup
        services.AddSingleton<IDbConnectionFactory>(sp => 
        {
            var config = sp.GetRequiredService<Microsoft.Extensions.Configuration.IConfiguration>();
            var connStr = config["SQL_CONNECTION_STRING"]
                ?? throw new InvalidOperationException("SQL_CONNECTION_STRING is not configured.");
            return new SqlDbConnectionFactory(connStr);
        });

        // Application Insights
        services.AddApplicationInsightsTelemetryWorkerService();
    })
    .Build();

host.Run();
