using TelemetryApi.Services;

namespace TelemetryApi.Endpoints;

/// <summary>
/// Route shape endpoints — serve Capital Metro GTFS static route geometries
/// to the dashboard for map rendering.
///
/// SRE: Route shapes are cached in GtfsStaticService for 24 hours so these
/// endpoints are effectively free after the first call. If the GTFS feed is
/// unreachable at startup, endpoints return empty arrays — the map continues
/// to function without route overlays (graceful degradation).
/// </summary>
public static class RouteEndpoints
{
    public static void MapRouteEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/routes")
                       .WithTags("Routes")
                       .WithOpenApi();

        group.MapGet("/", GetAllRoutes)
             .WithName("GetAllRoutes")
             .WithSummary("Returns all Capital Metro route shapes from the GTFS static feed.");

        group.MapGet("/{routeId}", GetRoute)
             .WithName("GetRoute")
             .WithSummary("Returns the shape for a single route.");

        group.MapGet("/stops/all", GetAllStops)
             .WithName("GetAllStops")
             .WithSummary("Returns all Capital Metro bus stops from the GTFS static feed.");
    }

    /// <summary>
    /// GET /api/routes
    ///
    /// Returns all routes as an array of GeoJSON-friendly objects:
    /// [{ routeId, shortName, color, directions: [{ directionId, shape: [[lat,lon],...] }] }]
    ///
    /// The dashboard fetches this once at startup and caches client-side.
    /// Shape coordinates are arrays of [lat, lon] pairs for Leaflet Polyline.
    /// </summary>
    private static async Task<IResult> GetAllRoutes(GtfsStaticService gtfs)
    {
        var routes = await gtfs.GetRoutesAsync();

        var response = routes.Values.Select(r => new
        {
            routeId   = r.RouteId,
            shortName = r.ShortName,
            color     = r.Color,
            directions = r.Directions.Select(d => new
            {
                directionId = d.DirectionId,
                shape       = d.Shape.Select(p => new[] { p.Lat, p.Lon }).ToArray(),
            }).ToArray(),
        });

        return Results.Ok(response);
    }

    /// <summary>
    /// GET /api/routes/{routeId}
    ///
    /// Returns a single route by ID. Useful when the dashboard needs to
    /// lazy-load a route shape after clicking a bus marker.
    /// </summary>
    private static async Task<IResult> GetRoute(string routeId, GtfsStaticService gtfs)
    {
        var routes = await gtfs.GetRoutesAsync();

        if (!routes.TryGetValue(routeId, out var route))
            return Results.NotFound(new { error = $"Route '{routeId}' not found." });

        var response = new
        {
            routeId   = route.RouteId,
            shortName = route.ShortName,
            color     = route.Color,
            directions = route.Directions.Select(d => new
            {
                directionId = d.DirectionId,
                shape       = d.Shape.Select(p => new[] { p.Lat, p.Lon }).ToArray(),
            }).ToArray(),
        };

        return Results.Ok(response);
    }

    /// <summary>
    /// GET /api/routes/stops/all
    ///
    /// Returns all bus stops as an array:
    /// [{ stopId, name, lat, lon }]
    ///
    /// Capital Metro has ~2,500 stops. The dashboard can filter/cluster these
    /// based on zoom level to avoid overwhelming the map.
    /// </summary>
    private static async Task<IResult> GetAllStops(GtfsStaticService gtfs)
    {
        var stops = await gtfs.GetStopsAsync();

        var response = stops.Select(s => new
        {
            stopId = s.StopId,
            name   = s.Name,
            lat    = s.Lat,
            lon    = s.Lon,
        });

        return Results.Ok(response);
    }
}
