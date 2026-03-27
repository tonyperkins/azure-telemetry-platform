import { useEffect, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export interface BusStop {
  stopId: string;
  name:   string;
  lat:    number;
  lon:    number;
}

/**
 * Fetches all Capital Metro bus stops from /api/routes/stops/all once at startup.
 * Returns an array of ~2,500 stops. The BusStopsLayer component filters these
 * based on zoom level to avoid rendering thousands of markers at once.
 */
export function useBusStops(): BusStop[] {
  const [stops, setStops] = useState<BusStop[]>([]);

  useEffect(() => {
    fetch(`${API_BASE}/api/routes/stops/all`)
      .then(r => {
        if (!r.ok) throw new Error(`/api/routes/stops/all returned ${r.status}`);
        return r.json() as Promise<BusStop[]>;
      })
      .then(data => setStops(data))
      .catch(err => console.warn('Bus stops unavailable:', err));
  }, []);

  return stops;
}
