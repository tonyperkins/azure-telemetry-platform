import { useEffect, useRef, useState } from 'react';
import { PathPoint, Vehicle, VehiclePathGroup } from '../types/vehicle';

const API_BASE       = import.meta.env.VITE_API_BASE_URL ?? '';
const TRAIL_MINUTES  = 20;
const TRIM_MS        = TRAIL_MINUTES * 60 * 1000;

/**
 * Manages per-vehicle position trails for flight trail polylines and metro
 * route progress.
 *
 * Strategy:
 *   1. On mount, fetch /api/vehicles/paths?source=flight to pre-seed trails
 *      with historical data from the database — trails appear immediately
 *      instead of building up from zero over the first 20 minutes.
 *   2. On each vehicles update (every 30s), append the new position for each
 *      vehicle and trim positions older than TRAIL_MINUTES.
 *
 * This avoids N per-vehicle API calls while keeping the trail accurate as
 * new positions arrive from the polling hook.
 */
export function useVehiclePaths(vehicles: Vehicle[]): Map<string, PathPoint[]> {
  const [paths, setPaths] = useState<Map<string, PathPoint[]>>(new Map());
  const seeded = useRef(false);

  // Step 1: seed historical paths from the backend on first mount
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;

    Promise.all([
      fetch(`${API_BASE}/api/vehicles/paths?source=flight&minutes=${TRAIL_MINUTES}`),
      fetch(`${API_BASE}/api/vehicles/paths?source=metro&minutes=90`),
    ])
      .then(([fr, mr]) => Promise.all([
        fr.ok ? (fr.json() as Promise<VehiclePathGroup[]>) : Promise.resolve([] as VehiclePathGroup[]),
        mr.ok ? (mr.json() as Promise<VehiclePathGroup[]>) : Promise.resolve([] as VehiclePathGroup[]),
      ]))
      .then(([flightGroups, metroGroups]) => {
        const map = new Map<string, PathPoint[]>();
        for (const g of [...flightGroups, ...metroGroups]) {
          if (g.points.length > 0) map.set(g.vehicleId, g.points);
        }
        setPaths(map);
      })
      .catch(err => console.warn('Path seed fetch failed (trails will build live):', err));
  }, []);

  // Step 2: append latest position from each poll cycle
  useEffect(() => {
    if (vehicles.length === 0) return;

    const cutoff = Date.now() - TRIM_MS;

    setPaths(prev => {
      const next = new Map(prev);

      for (const v of vehicles) {
        const newPt: PathPoint = {
          latitude:   v.latitude,
          longitude:  v.longitude,
          ingestedAt: v.ingestedAt,
        };

        const existing = next.get(v.vehicleId) ?? [];
        const last     = existing[existing.length - 1];

        // Skip duplicate positions (same ingestedAt timestamp)
        if (last?.ingestedAt === newPt.ingestedAt) continue;

        const trimmed = existing.filter(
          p => new Date(p.ingestedAt).getTime() > cutoff,
        );
        next.set(v.vehicleId, [...trimmed, newPt]);
      }

      return next;
    });
  }, [vehicles]);

  return paths;
}
