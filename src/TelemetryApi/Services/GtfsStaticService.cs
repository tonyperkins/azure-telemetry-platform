using System.Globalization;
using System.IO.Compression;
using System.Text;
using Microsoft.Extensions.Caching.Memory;

namespace TelemetryApi.Services;

/// <summary>
/// Downloads and parses the Capital Metro GTFS static feed to extract
/// route shapes. Shapes are cached in-memory with a 24-hour TTL —
/// static GTFS data changes only on scheduled feed updates.
///
/// SRE: Route shapes are the large part of the GTFS static ZIP (~2–5 MB).
/// We download once, parse into a lean in-memory structure, and discard the
/// raw ZIP bytes. The cache prevents re-downloading on every /api/routes call.
///
/// Shape URL is configurable via MetroGtfsStaticUrl config key so it can be
/// updated without a code deploy when Capital Metro publishes a new feed.
/// </summary>
public sealed class GtfsStaticService
{
    private const string CacheKey   = "gtfs_route_shapes";
    private readonly IMemoryCache   _cache;
    private readonly IConfiguration _config;
    private readonly IHttpClientFactory _httpFactory;
    private readonly ILogger<GtfsStaticService> _logger;

    public GtfsStaticService(
        IMemoryCache cache,
        IConfiguration config,
        IHttpClientFactory httpFactory,
        ILogger<GtfsStaticService> logger)
    {
        _cache      = cache;
        _config     = config;
        _httpFactory = httpFactory;
        _logger     = logger;
    }

    /// <summary>
    /// Returns all route shapes indexed by route_id.
    /// Loads from cache if available; otherwise downloads and parses the GTFS feed.
    /// Returns an empty dictionary if the feed is unavailable — the map still
    /// works without route lines.
    /// </summary>
    public async Task<Dictionary<string, RouteInfo>> GetRoutesAsync()
    {
        if (_cache.TryGetValue(CacheKey, out Dictionary<string, RouteInfo>? cached) && cached is not null)
            return cached;

        try
        {
            var routes = await FetchAndParseAsync();
            _cache.Set(CacheKey, routes, TimeSpan.FromHours(24));
            _logger.LogInformation("GTFS static loaded: {Count} routes cached.", routes.Count);
            return routes;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex,
                "GTFS static feed unavailable. Route lines will not render in the dashboard. " +
                "Set MetroGtfsStaticUrl in config to enable this feature.");
            return new Dictionary<string, RouteInfo>();
        }
    }

    /// <summary>
    /// Returns all bus stops from the GTFS static feed.
    /// Cached alongside route shapes with the same 24h TTL.
    /// </summary>
    public async Task<List<BusStop>> GetStopsAsync()
    {
        const string stopsCacheKey = "gtfs_bus_stops";

        if (_cache.TryGetValue(stopsCacheKey, out List<BusStop>? cached) && cached is not null)
            return cached;

        try
        {
            // Check local file first
            var localPath = _config["MetroGtfsLocalPath"];
            byte[]? zipBytes = null;

            if (!string.IsNullOrEmpty(localPath) && File.Exists(localPath))
            {
                zipBytes = await File.ReadAllBytesAsync(localPath);
            }
            else
            {
                var urls = new[]
                {
                    _config["MetroGtfsStaticUrl"],
                    "https://www.capmetro.org/planner/includes/gtfs.zip",
                    "https://data.texas.gov/download/r4v4-vz24/application/zip",
                }.Where(u => !string.IsNullOrEmpty(u)).Cast<string>().Distinct().ToArray();

                var client = _httpFactory.CreateClient("GtfsStatic");
                foreach (var url in urls)
                {
                    try { zipBytes = await client.GetByteArrayAsync(url); break; }
                    catch (Exception ex) { _logger.LogWarning("Stops URL {Url} failed: {Msg}", url, ex.Message); }
                }
            }

            if (zipBytes is null) return new List<BusStop>();

            using var zipStream = new MemoryStream(zipBytes);
            using var archive   = new ZipArchive(zipStream, ZipArchiveMode.Read);

            var stops = ParseStopsCsv(archive);
            _cache.Set(stopsCacheKey, stops, TimeSpan.FromHours(24));
            _logger.LogInformation("GTFS stops loaded: {Count} stops cached.", stops.Count);
            return stops;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "GTFS stops unavailable. Bus stops will not render.");
            return new List<BusStop>();
        }
    }

    // -------------------------------------------------------------------------

    private async Task<Dictionary<string, RouteInfo>> FetchAndParseAsync()
    {
        // Check for a local GTFS file first (fastest, no network required)
        var localPath = _config["MetroGtfsLocalPath"];
        if (!string.IsNullOrEmpty(localPath) && File.Exists(localPath))
        {
            _logger.LogInformation("Loading GTFS static from local file {Path}", localPath);
            var localBytes = await File.ReadAllBytesAsync(localPath);
            return ParseZipBytes(localBytes);
        }

        // Try multiple known URLs in order
        var urls = new[]
        {
            _config["MetroGtfsStaticUrl"],
            "https://www.capmetro.org/planner/includes/gtfs.zip",
            "https://data.texas.gov/download/r4v4-vz24/application/zip",
        }.Where(u => !string.IsNullOrEmpty(u)).Cast<string>().Distinct().ToArray();

        var client = _httpFactory.CreateClient("GtfsStatic");
        Exception? lastEx = null;

        foreach (var url in urls)
        {
            try
            {
                _logger.LogInformation("Downloading GTFS static from {Url}", url);
                var zipBytes = await client.GetByteArrayAsync(url);
                return ParseZipBytes(zipBytes);
            }
            catch (Exception ex)
            {
                _logger.LogWarning("GTFS URL {Url} failed: {Msg}", url, ex.Message);
                lastEx = ex;
            }
        }

        throw lastEx ?? new Exception("All GTFS URLs failed");
    }

    private Dictionary<string, RouteInfo> ParseZipBytes(byte[] zipBytes)
    {
        using var zipStream = new MemoryStream(zipBytes);
        using var archive   = new ZipArchive(zipStream, ZipArchiveMode.Read);

        var rawRoutes = ParseRoutesCsv(archive);
        var shapeMap  = ParseShapesCsv(archive);
        var tripMap   = ParseTripsCsv(archive);
        return BuildRouteDict(rawRoutes, shapeMap, tripMap);
    }

    private static Dictionary<string, RouteInfo> BuildRouteDict(
        Dictionary<string, (string ShortName, string? Color)> rawRoutes,
        Dictionary<string, List<(double Lat, double Lon)>> shapeMap,
        Dictionary<string, List<(int DirectionId, string ShapeId)>> tripMap)
    {
        var result = new Dictionary<string, RouteInfo>(StringComparer.OrdinalIgnoreCase);

        foreach (var (routeId, routeMeta) in rawRoutes)
        {
            if (!tripMap.TryGetValue(routeId, out var tripShapes))
                continue;

            var directions = new List<RouteDirection>();
            var seen       = new HashSet<string>();

            foreach (var (directionId, shapeId) in tripShapes)
            {
                if (!seen.Add($"{directionId}:{shapeId}")) continue;
                if (!shapeMap.TryGetValue(shapeId, out var points)) continue;
                directions.Add(new RouteDirection(directionId, points));
            }

            if (directions.Count == 0) continue;

            result[routeId] = new RouteInfo(
                RouteId:    routeId,
                ShortName:  routeMeta.ShortName,
                Color:      routeMeta.Color,
                Directions: directions);
        }

        return result;
    }

    private static Dictionary<string, (string ShortName, string? Color)> ParseRoutesCsv(ZipArchive archive)
    {
        var entry = archive.GetEntry("routes.txt");
        if (entry is null) return new();

        using var reader = new StreamReader(entry.Open(), Encoding.UTF8);
        var header = ParseCsvLine(reader.ReadLine() ?? string.Empty);

        int idIdx    = IndexOf(header, "route_id");
        int nameIdx  = IndexOf(header, "route_short_name");
        int colorIdx = IndexOf(header, "route_color");

        var result = new Dictionary<string, (string, string?)>(StringComparer.OrdinalIgnoreCase);
        string? line;
        while ((line = reader.ReadLine()) is not null)
        {
            var cols = ParseCsvLine(line);
            if (cols.Length <= idIdx) continue;

            var routeId  = cols[idIdx].Trim();
            var name     = nameIdx  >= 0 && nameIdx  < cols.Length ? cols[nameIdx].Trim()  : routeId;
            var color    = colorIdx >= 0 && colorIdx < cols.Length ? cols[colorIdx].Trim() : null;
            result[routeId] = (name, string.IsNullOrEmpty(color) ? null : $"#{color}");
        }

        return result;
    }

    private static Dictionary<string, List<(double Lat, double Lon)>> ParseShapesCsv(ZipArchive archive)
    {
        var entry = archive.GetEntry("shapes.txt");
        if (entry is null) return new();

        using var reader = new StreamReader(entry.Open(), Encoding.UTF8);
        var header = ParseCsvLine(reader.ReadLine() ?? string.Empty);

        int idIdx  = IndexOf(header, "shape_id");
        int latIdx = IndexOf(header, "shape_pt_lat");
        int lonIdx = IndexOf(header, "shape_pt_lon");
        int seqIdx = IndexOf(header, "shape_pt_sequence");

        var raw = new Dictionary<string, List<(int seq, double lat, double lon)>>(StringComparer.OrdinalIgnoreCase);
        string? line;
        while ((line = reader.ReadLine()) is not null)
        {
            var cols = ParseCsvLine(line);
            if (cols.Length <= Math.Max(idIdx, Math.Max(latIdx, lonIdx))) continue;

            var id  = cols[idIdx].Trim();
            if (!double.TryParse(cols[latIdx].Trim(), NumberStyles.Any, CultureInfo.InvariantCulture, out var lat)) continue;
            if (!double.TryParse(cols[lonIdx].Trim(), NumberStyles.Any, CultureInfo.InvariantCulture, out var lon)) continue;
            int seq = seqIdx >= 0 && seqIdx < cols.Length &&
                      int.TryParse(cols[seqIdx].Trim(), out var s) ? s : 0;

            if (!raw.TryGetValue(id, out var list))
                raw[id] = list = new();
            list.Add((seq, lat, lon));
        }

        return raw.ToDictionary(
            kv => kv.Key,
            kv => kv.Value
                     .OrderBy(p => p.seq)
                     .Select(p => (p.lat, p.lon))
                     .ToList(),
            StringComparer.OrdinalIgnoreCase);
    }

    private static Dictionary<string, List<(int DirectionId, string ShapeId)>> ParseTripsCsv(ZipArchive archive)
    {
        var entry = archive.GetEntry("trips.txt");
        if (entry is null) return new();

        using var reader = new StreamReader(entry.Open(), Encoding.UTF8);
        var header = ParseCsvLine(reader.ReadLine() ?? string.Empty);

        int routeIdx  = IndexOf(header, "route_id");
        int shapeIdx  = IndexOf(header, "shape_id");
        int dirIdx    = IndexOf(header, "direction_id");

        var result = new Dictionary<string, List<(int, string)>>(StringComparer.OrdinalIgnoreCase);
        var seen   = new HashSet<string>(StringComparer.OrdinalIgnoreCase); // dedup route+dir+shape

        string? line;
        while ((line = reader.ReadLine()) is not null)
        {
            var cols = ParseCsvLine(line);
            if (cols.Length <= Math.Max(routeIdx, shapeIdx)) continue;

            var routeId = cols[routeIdx].Trim();
            var shapeId = cols[shapeIdx].Trim();
            int dirId   = dirIdx >= 0 && dirIdx < cols.Length &&
                          int.TryParse(cols[dirIdx].Trim(), out var d) ? d : 0;

            var key = $"{routeId}:{dirId}:{shapeId}";
            if (!seen.Add(key)) continue;

            if (!result.TryGetValue(routeId, out var list))
                result[routeId] = list = new();
            list.Add((dirId, shapeId));
        }

        return result;
    }

    private static string[] ParseCsvLine(string line)
    {
        var fields  = new List<string>();
        var current = new StringBuilder();
        bool inQuote = false;

        foreach (var ch in line)
        {
            if (ch == '"')  { inQuote = !inQuote; continue; }
            if (ch == ',' && !inQuote) { fields.Add(current.ToString()); current.Clear(); continue; }
            current.Append(ch);
        }
        fields.Add(current.ToString());
        return fields.ToArray();
    }

    private static int IndexOf(string[] header, string name) =>
        Array.FindIndex(header, h => h.Trim().Equals(name, StringComparison.OrdinalIgnoreCase));

    private static List<BusStop> ParseStopsCsv(ZipArchive archive)
    {
        var entry = archive.GetEntry("stops.txt");
        if (entry is null) return new();

        using var reader = new StreamReader(entry.Open(), Encoding.UTF8);
        var header = ParseCsvLine(reader.ReadLine() ?? string.Empty);

        int idIdx   = IndexOf(header, "stop_id");
        int nameIdx = IndexOf(header, "stop_name");
        int latIdx  = IndexOf(header, "stop_lat");
        int lonIdx  = IndexOf(header, "stop_lon");

        var result = new List<BusStop>();
        string? line;
        while ((line = reader.ReadLine()) is not null)
        {
            var cols = ParseCsvLine(line);
            if (cols.Length <= Math.Max(idIdx, Math.Max(nameIdx, Math.Max(latIdx, lonIdx)))) continue;

            var id   = cols[idIdx].Trim();
            var name = cols[nameIdx].Trim();
            if (!double.TryParse(cols[latIdx].Trim(), NumberStyles.Any, CultureInfo.InvariantCulture, out var lat)) continue;
            if (!double.TryParse(cols[lonIdx].Trim(), NumberStyles.Any, CultureInfo.InvariantCulture, out var lon)) continue;

            result.Add(new BusStop(id, name, lat, lon));
        }

        return result;
    }
}

// ---------------------------------------------------------------------------
// DTOs returned by GtfsStaticService
// ---------------------------------------------------------------------------

public record RouteInfo(
    string           RouteId,
    string           ShortName,
    string?          Color,
    List<RouteDirection> Directions);

public record RouteDirection(
    int                         DirectionId,
    List<(double Lat, double Lon)> Shape);

public record BusStop(
    string StopId,
    string Name,
    double Lat,
    double Lon);
