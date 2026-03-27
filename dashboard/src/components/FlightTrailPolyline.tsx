import { Polyline } from 'react-leaflet';

interface TrailPoint {
  latitude: number;
  longitude: number;
  timestamp: number;
}

interface Props {
  vehicleId: string;
  points: TrailPoint[];
}

export function FlightTrailPolyline({ vehicleId, points }: Props) {
  if (points.length < 2) return null;

  const positions: [number, number][] = points.map(p => [p.latitude, p.longitude]);

  const segments = [];
  for (let i = 0; i < positions.length - 1; i++) {
    const opacity = 0.1 + (i / (positions.length - 1)) * 0.5;
    segments.push(
      <Polyline
        key={`${vehicleId}-segment-${i}`}
        positions={[positions[i], positions[i + 1]]}
        pathOptions={{
          color: '#D97706',
          weight: 1.5,
          opacity,
        }}
      />
    );
  }

  return <>{segments}</>;
}
