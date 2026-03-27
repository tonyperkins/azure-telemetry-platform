using FlightIngestion.Services;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

var host = new HostBuilder()
    .ConfigureFunctionsWorkerDefaults()
    .ConfigureServices((context, services) =>
    {
        services.AddHttpClient<OpenSkyFeedService>(client =>
        {
            client.Timeout = TimeSpan.FromSeconds(10);
            client.DefaultRequestHeaders.Add(
                "User-Agent", "azure-telemetry-platform/1.0");
        });

        services.AddSingleton<VehicleIngestionService>(sp =>
        {
            var config = sp.GetRequiredService<Microsoft.Extensions.Configuration.IConfiguration>();
            var connStr = config["SQL_CONNECTION_STRING"]
                ?? throw new InvalidOperationException("SQL_CONNECTION_STRING is not configured.");
            var logger  = sp.GetRequiredService<Microsoft.Extensions.Logging.ILogger<VehicleIngestionService>>();
            return new VehicleIngestionService(connStr, logger);
        });

        services.AddApplicationInsightsTelemetryWorkerService();
    })
    .Build();

host.Run();
