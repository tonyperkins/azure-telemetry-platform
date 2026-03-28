import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { useMap } from 'react-leaflet';
import { BusStop } from '../hooks/useBusStops';
import { Vehicle } from '../types/vehicle';

interface Props {
  stops:            BusStop[];
  zoom:             number;
  vehicles?:        Vehicle[];
  onTrackVehicle?:  (vehicleId: string, source: 'metro' | 'flight') => void;
  trackedStopId?:   string | null;
  onTrackStop?:     (stopId: string | null) => void;
  onStopTracking?:  () => void; // clears both vehicle + stop tracking
}

const MIN_ZOOM_FOR_STOPS = 14;

/** Extract route ID from a metro vehicle's raw JSON */
function getRouteId(v: Vehicle): string | null {
  if (v.routeId) return v.routeId;
  if (!v.rawJson) return null;
  try {
    const raw = JSON.parse(v.rawJson) as Record<string, unknown>;
    return (raw['route_id'] ?? raw['routeId']) as string | null;
  } catch {
    return null;
  }
}

/** Haversine distance in km between two lat/lon points. */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Find the nearest active metro bus within ~3 km of a stop —
 * used as a proxy for "next arrival" since we have no realtime predictions.
 */
function findNearestBus(stop: BusStop, vehicles: Vehicle[]): Vehicle | null {
  const metro = vehicles.filter(v => v.source === 'metro');
  if (metro.length === 0) return null;

  let nearest: Vehicle | null = null;
  let minDist = Infinity;

  for (const v of metro) {
    const dist = haversineKm(stop.lat, stop.lon, v.latitude, v.longitude);
    if (dist < minDist) {
      minDist = dist;
      nearest = v;
    }
  }

  return minDist <= 3 ? nearest : null;
}

/** Build the stop dot icon. Tracked stop = larger amber beacon. */
function buildStopIcon(isTracked: boolean): L.DivIcon {
  if (isTracked) {
    return L.divIcon({
      html: `
        <svg width="18" height="18" viewBox="0 0 18 18">
          <circle cx="9" cy="9" r="8" fill="#F59E0B" stroke="white" stroke-width="2" opacity="0.95"/>
          <circle cx="9" cy="9" r="4" fill="white"/>
        </svg>
      `,
      className: 'bus-stop-tracked',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
  }
  return L.divIcon({
    html: `
      <svg width="8" height="8" viewBox="0 0 8 8">
        <circle cx="4" cy="4" r="3" fill="#0D9488" stroke="white" stroke-width="1"/>
      </svg>
    `,
    className: '',
    iconSize: [8, 8],
    iconAnchor: [4, 4],
  });
}

/** Popup body colours — always explicit to avoid CSS variable context issues in Leaflet popups */
const isDarkMap = () => document.documentElement.getAttribute('data-map-theme') === 'dark';

/** React popup content for a bus stop */
function StopPopup({
  stop,
  vehicles,
  isTrackedStop,
  onTrackVehicle,
  onTrackStop,
  onStopTracking,
}: {
  stop: BusStop;
  vehicles: Vehicle[];
  isTrackedStop: boolean;
  onTrackVehicle?: (vehicleId: string, source: 'metro' | 'flight') => void;
  onTrackStop?: (stopId: string | null) => void;
  onStopTracking?: () => void;
}) {
  const dark = isDarkMap();
  const nearestBus = isTrackedStop ? null : findNearestBus(stop, vehicles);
  const routeId = nearestBus ? getRouteId(nearestBus) : null;

  const handleTrack = () => {
    if (nearestBus && onTrackVehicle) {
      onTrackVehicle(nearestBus.vehicleId, 'metro');
    }
    if (onTrackStop) {
      onTrackStop(stop.stopId);
    }
    document.querySelector<HTMLElement>('.leaflet-popup-close-button')?.click();
  };

  const handleStopTracking = () => {
    if (onStopTracking) onStopTracking();
    document.querySelector<HTMLElement>('.leaflet-popup-close-button')?.click();
  };

  return (
    <div style={{
      fontFamily: "'Inter', sans-serif",
      minWidth: '170px',
      padding: '11px 13px 12px',
      color: dark ? '#F8FAFC' : '#1E293B',
    }}>
      <div style={{
        fontWeight: 700,
        fontSize: '13px',
        marginBottom: '3px',
        color: dark ? '#F8FAFC' : '#1E293B',
      }}>
        {stop.name}
      </div>
      <div style={{
        fontSize: '11px',
        color: dark ? '#94A3B8' : '#64748B',
        marginBottom: (nearestBus || isTrackedStop) ? '10px' : 0,
      }}>
        Stop ID: {stop.stopId}
      </div>

      {/* Actively tracking this stop → show Stop Tracking */}
      {isTrackedStop && (
        <button
          onClick={handleStopTracking}
          style={{
            width: '100%',
            padding: '7px 10px',
            background: '#DC2626',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '5px',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#B91C1C')}
          onMouseLeave={e => (e.currentTarget.style.background = '#DC2626')}
        >
          ✕ Stop Tracking
        </button>
      )}

      {/* Bus nearby → offer to track it */}
      {!isTrackedStop && nearestBus && onTrackVehicle && (
        <button
          onClick={handleTrack}
          style={{
            width: '100%',
            padding: '7px 10px',
            background: '#0D9488',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '5px',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#0F766E')}
          onMouseLeave={e => (e.currentTarget.style.background = '#0D9488')}
        >
          📍 Track next arrival{routeId ? ` · Rt ${routeId}` : ''}
        </button>
      )}
    </div>
  );
}

/**
 * Renders bus stop markers at zoom ≥ 14.
 * Tracked stop gets an amber highlight + pulsing beacon.
 * Its popup swaps "Track next arrival" → "Stop Tracking" once active.
 */
export function BusStopsLayer({
  stops,
  zoom,
  vehicles = [],
  onTrackVehicle,
  trackedStopId = null,
  onTrackStop,
  onStopTracking,
}: Props) {
  const map = useMap();
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (zoom < MIN_ZOOM_FOR_STOPS) {
      layerRef.current?.remove();
      layerRef.current = null;
      return;
    }

    if (!layerRef.current) {
      const layer = L.layerGroup();
      const bounds = map.getBounds();

      for (const stop of stops) {
        if (!bounds.contains([stop.lat, stop.lon])) continue;

        const isTracked = stop.stopId === trackedStopId;
        const icon = buildStopIcon(isTracked);

        const marker = L.marker([stop.lat, stop.lon], { icon }).bindPopup(
          () => {
            const container = document.createElement('div');
            const root = createRoot(container);
            root.render(
              <StopPopup
                stop={stop}
                vehicles={vehicles}
                isTrackedStop={stop.stopId === trackedStopId}
                onTrackVehicle={onTrackVehicle}
                onTrackStop={onTrackStop}
                onStopTracking={onStopTracking}
              />
            );
            return container;
          },
          { minWidth: 170, maxWidth: 280, offset: [0, -4] }
        );

        layer.addLayer(marker);
      }

      layer.addTo(map);
      layerRef.current = layer;
    }

    return () => {
      layerRef.current?.remove();
      layerRef.current = null;
    };
  }, [map, stops, zoom, vehicles, onTrackVehicle, trackedStopId, onTrackStop, onStopTracking]);

  return null;
}
