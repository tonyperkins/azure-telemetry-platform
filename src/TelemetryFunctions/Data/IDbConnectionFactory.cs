using System.Data;
using System.Threading.Tasks;

namespace TelemetryFunctions.Data;

public interface IDbConnectionFactory
{
    Task<IDbConnection> CreateConnectionAsync();
}
