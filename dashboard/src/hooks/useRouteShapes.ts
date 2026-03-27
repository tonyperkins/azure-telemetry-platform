import { useEffect, useState } from 'react';
import { RouteShape } from '../types/vehicle';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

/**
 * Fetches all Capital Metro route shapes from /api/routes once at startup.
 * Returns a Map<routeId, RouteShape> for O(1) lookup per bus marker.
 *
 * Fails silently — if the GTFS static feed is unavailable the map still
 * functions; buses just won't have a route line underneath them.
 */
export function useRouteShapes(): Map<string, RouteShape> {
  const [shapes, setShapes] = useState<Map<string, RouteShape>>(new Map());

  useEffect(() => {
    fetch(`${API_BASE}/api/routes`)
      .then(r => {
        if (!r.ok) throw new Error(`/api/routes returned ${r.status}`);
        return r.json() as Promise<RouteShape[]>;
      })
      .then(routes => {
        const map = new Map<string, RouteShape>();
        for (const r of routes) map.set(r.routeId, r);
        setShapes(map);
      })
      .catch(err => console.warn('Route shapes unavailable:', err));
  }, []);

  return shapes;
}
