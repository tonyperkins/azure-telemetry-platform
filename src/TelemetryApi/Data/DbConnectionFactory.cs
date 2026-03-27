using Microsoft.Data.SqlClient;
using System.Data;

namespace TelemetryApi.Data;

/// <summary>
/// Factory that creates SQL connections on demand.
/// Using a factory (rather than a long-lived IDbConnection singleton) is
/// intentional — SqlClient uses connection pooling internally, so each
/// call to CreateConnection() returns a pooled connection at near-zero cost.
///
/// SRE: Connection string is never stored in appsettings.json or environment
/// variables directly. At runtime it is resolved from Key Vault via the
/// IConfiguration pipeline (DefaultAzureCredential → Key Vault provider).
/// This satisfies zero-trust secret management requirements and means a
/// rotated secret takes effect on next connection without a redeploy.
/// </summary>
public sealed class DbConnectionFactory
{
    private readonly string _connectionString;

    public DbConnectionFactory(IConfiguration configuration)
    {
        // SRE: Key Vault reference resolution is transparent here.
        // In Azure, the configuration provider has already resolved
        // @Microsoft.KeyVault(SecretUri=...) into the raw connection string.
        // Locally, this falls back to ConnectionStrings:DefaultConnection
        // in appsettings.Development.json or user secrets.
        _connectionString = configuration.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException(
                "Connection string 'DefaultConnection' is not configured. " +
                "For local development, set it in appsettings.Development.json or user secrets.");
    }

    /// <summary>
    /// Creates a new (pooled) SQL connection. The caller is responsible for
    /// opening and disposing it — use within a 'using' statement.
    /// </summary>
    public IDbConnection CreateConnection() => new SqlConnection(_connectionString);
}
