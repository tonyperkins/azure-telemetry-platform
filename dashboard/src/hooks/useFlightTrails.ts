import { useEffect, useRef, useState } from 'react';
import { Vehicle } from '../types/vehicle';

export interface TrailPoint {
  latitude: number;
  longitude: number;
  timestamp: number;
}

export function useFlightTrails(vehicles: Vehicle[]): Record<string, TrailPoint[]> {
  const trailsRef = useRef<Map<string, TrailPoint[]>>(new Map());
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const flights = vehicles.filter(v => v.source === 'flight');
    let changed = false;

    flights.forEach(flight => {
      const existing = trailsRef.current.get(flight.vehicleId) || [];
      
      const newPoint: TrailPoint = {
        latitude: flight.latitude,
        longitude: flight.longitude,
        timestamp: Date.now(),
      };

      const isDuplicate = existing.length > 0 &&
        existing[existing.length - 1].latitude === newPoint.latitude &&
        existing[existing.length - 1].longitude === newPoint.longitude;

      if (!isDuplicate) {
        const updated = [...existing, newPoint].slice(-5);
        trailsRef.current.set(flight.vehicleId, updated);
        changed = true;
      }
    });

    const currentFlightIds = new Set(flights.map(f => f.vehicleId));
    for (const [vehicleId] of trailsRef.current) {
      if (!currentFlightIds.has(vehicleId)) {
        trailsRef.current.delete(vehicleId);
        changed = true;
      }
    }

    if (changed) forceUpdate(n => n + 1);
  }, [vehicles]);

  return Object.fromEntries(trailsRef.current);
}
