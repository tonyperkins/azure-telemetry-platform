import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { PathPoint } from '../types/vehicle';

interface Props {
  vehicleId: string; // used by parent as React key
  points:    PathPoint[];
}

/**
 * Renders a fading polyline trail for a single flight.
 *
 * The trail uses a single gray-to-amber gradient effect by rendering
 * one polyline per consecutive pair of points with decreasing opacity —
 * the oldest segments are nearly transparent, the most recent are solid.
 * This gives a clear visual sense of direction without requiring a canvas
 * renderer or a WebGL layer.
 *
 * SRE: Uses the imperative Leaflet API to avoid React re-render overhead
 * on every 30-second poll. The effect only re-runs when the points array
 * reference changes (which happens each time a new position is appended).
 */
export function FlightTrail({ vehicleId: _vehicleId, points }: Props) {
  const map      = useMap();
  const linesRef = useRef<L.Polyline[]>([]);

  useEffect(() => {
    // Remove previous trail segments
    linesRef.current.forEach(l => l.remove());
    linesRef.current = [];

    if (points.length < 2) return;

    const n = points.length;

    for (let i = 0; i < n - 1; i++) {
      // Opacity increases toward the most-recent end
      // Segment 0 (oldest) → 0.08 opacity; segment n-2 (newest) → 0.75 opacity
      const progress = i / (n - 2);
      const opacity  = 0.08 + progress * 0.67;

      const line = L.polyline(
        [
          [points[i].latitude,     points[i].longitude],
          [points[i + 1].latitude, points[i + 1].longitude],
        ],
        {
          color:     '#D97706', // amber — matches the plane icon color
          weight:    2,
          opacity,
          lineCap:   'round',
          lineJoin:  'round',
        },
      ).addTo(map);

      linesRef.current.push(line);
    }

    return () => {
      linesRef.current.forEach(l => l.remove());
      linesRef.current = [];
    };
  }, [map, points]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      linesRef.current.forEach(l => l.remove());
      linesRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
