import { Vehicle } from '../types/vehicle';

interface Props {
  vehicle: Vehicle;
  isTracked?: boolean;
  onTrack?: () => void;
  onStopTracking?: () => void;
}

function getCompassDirection(degrees: number | null): string {
  if (degrees === null) return 'N/A';
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(((degrees % 360) / 22.5)) % 16;
  return directions[index];
}

function formatSpeed(speedKmh: number | null): string | null {
  if (speedKmh === null) return null; // No data - suppress display
  if (speedKmh === 0) return 'Stationary';
  const mph = Math.round(speedKmh * 0.621371);
  return `${mph} mph`;
}

function formatAltitude(altitudeM: number | null, onGround: boolean | null): string {
  if (onGround) return 'On Ground';
  if (altitudeM === null) return 'N/A';
  const feet = Math.round(altitudeM * 3.28084);
  return `${feet.toLocaleString()} ft`;
}

function formatVerticalRate(verticalRateMs: number | null | undefined): string | null {
  if (verticalRateMs === null || verticalRateMs === undefined) return null;
  if (verticalRateMs > 2) return '↑ Climbing';
  if (verticalRateMs < -2) return '↓ Descending';
  return '→ Level';
}

function extractTripId(vehicle: Vehicle): string | null {
  if (vehicle.tripId) return vehicle.tripId;
  if (!vehicle.rawJson) return null;
  try {
    const raw = JSON.parse(vehicle.rawJson) as Record<string, unknown>;
    return (raw['trip_id'] ?? raw['tripId']) as string | null;
  } catch {
    return null;
  }
}

function extractRouteId(vehicle: Vehicle): string | null {
  if (vehicle.routeId) return vehicle.routeId;
  if (!vehicle.rawJson) return null;
  try {
    const raw = JSON.parse(vehicle.rawJson) as Record<string, unknown>;
    return (raw['route_id'] ?? raw['routeId']) as string | null;
  } catch {
    return null;
  }
}

function getTimeAgo(timestamp: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(timestamp + 'Z').getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

export function VehiclePopup({ vehicle, isTracked = false, onTrack, onStopTracking }: Props) {
  const isMetro = vehicle.source === 'metro';
  const routeId = extractRouteId(vehicle);
  const tripId = extractTripId(vehicle);
  const heading = vehicle.heading !== null ? `${Math.round(vehicle.heading)}° ${getCompassDirection(vehicle.heading)}` : 'N/A';
  const speed = formatSpeed(vehicle.speedKmh);
  const coords = `${vehicle.latitude.toFixed(4)}, ${vehicle.longitude.toFixed(4)}`;
  const mapsUrl = `https://maps.google.com/?q=${vehicle.latitude},${vehicle.longitude}`;
  const verticalRate = formatVerticalRate(vehicle.verticalRateMs);

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", width: '280px' }}>
      {/* Header */}
      <div style={{ 
        background: isMetro ? '#0D9488' : '#D97706',
        color: 'white',
        padding: '12px 16px',
        borderRadius: '6px 6px 0 0',
        fontWeight: 600,
        fontSize: '14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isMetro ? '🚌' : '✈️'} {isMetro && routeId ? `Route ${routeId}` : vehicle.label || vehicle.vehicleId}
        </div>
      </div>

      {/* Data Grid */}
      <div style={{ fontSize: '12px', lineHeight: '1.8' }}>
        {isMetro ? (
          // Metro Bus Data
          <>
            <DataRow label="Vehicle ID" value={vehicle.vehicleId} />
            {routeId && <DataRow label="Route" value={routeId} />}
            {tripId && <DataRow label="Trip ID" value={tripId.length > 16 ? tripId.substring(0, 16) + '...' : tripId} />}
            <DataRow label="Heading" value={heading} />
            {speed && <DataRow label="Speed" value={speed} />}
            <DataRow label="Last Updated" value={getTimeAgo(vehicle.ingestedAt)} />
            <DataRow label="Coordinates" value={<a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#3B82F6', textDecoration: 'none' }}>{coords}</a>} />
          </>
        ) : (
          // Flight Data
          <>
            <DataRow label="Callsign" value={vehicle.label || vehicle.vehicleId} />
            <DataRow label="ICAO24" value={vehicle.vehicleId} />
            <DataRow label="Altitude" value={formatAltitude(vehicle.altitudeM, vehicle.onGround)} />
            {speed && <DataRow label="Speed" value={speed} />}
            <DataRow label="Heading" value={heading} />
            {verticalRate && <DataRow label="Vertical Rate" value={verticalRate} />}
            <DataRow label="On Ground" value={vehicle.onGround ? 'Yes' : 'No'} />
            <DataRow label="Last Updated" value={getTimeAgo(vehicle.ingestedAt)} />
            <DataRow label="Coordinates" value={<a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#3B82F6', textDecoration: 'none' }}>{coords}</a>} />
          </>
        )}
      </div>

      {/* Track/Stop Tracking Button */}
      {isTracked && onStopTracking ? (
        <button
          onClick={onStopTracking}
          style={{
            width: '100%',
            padding: '10px',
            marginTop: '12px',
            background: '#DC2626',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
          }}
        >
          ✕ Stop Tracking
        </button>
      ) : onTrack ? (
        <button
          onClick={onTrack}
          style={{
            width: '100%',
            padding: '10px',
            marginTop: '12px',
            background: '#2563EB',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
          }}
        >
          📍 Track Vehicle
        </button>
      ) : null}
    </div>
  );
}

function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px', marginBottom: '4px' }}>
      <span style={{ color: '#64748B', fontWeight: 500 }}>{label}</span>
      <span style={{ color: '#1E293B', fontFamily: "'Courier New', monospace" }}>{value}</span>
    </div>
  );
}
