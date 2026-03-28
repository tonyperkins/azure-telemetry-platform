import L from 'leaflet';
import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, useMap, useMapEvent } from 'react-leaflet';
import { BusStop } from '../hooks/useBusStops';
import { RouteShape, Vehicle } from '../types/vehicle';
import { getRouteColor } from '../utils/routeColors';
import { AirportMarker } from './AirportMarker';
import { BusStopsLayer } from './BusStopsLayer';
import { FitBoundsButton } from './FitBoundsButton';
import { FlightTrailPolyline } from './FlightTrailPolyline';
import { RouteLine } from './RouteLine';
import { VehicleMarker } from './VehicleMarker';

interface TrailPoint {
  latitude: number;
  longitude: number;
  timestamp: number;
}

interface Props {
  vehicles:     Vehicle[];
  routeShapes:  Map<string, RouteShape>;
  busStops:     BusStop[];
  flightTrails: Record<string, TrailPoint[]>;
  flightEnabled: boolean;
  showBusStops: boolean;
  showBusRoutes: boolean;
  showFlightPaths: boolean;
  showVehicleLabels: boolean;
  enableClustering: boolean;
  selectedRoutes: Set<string>;
  trackedVehicleId: string | null;
  trackedStopId:    string | null;
  onTrackVehicle:  (vehicleId: string, source: 'metro' | 'flight') => void;
  onTrackStop:     (stopId: string | null) => void;
  onStopTracking:  () => void;
  mapStyle: 'light' | 'dark' | 'streets';
}

const AUSTIN_CENTER: [number, number] = [30.2672, -97.7431];
const CARTO_POSITRON = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
const CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';
const STADIA_ATTRIBUTION =
  '&copy; <a href="https://stamen.com">Stamen Design</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://stadiamaps.com">Stadia Maps</a>';

// Stadia alidade_smooth_dark has far more contrast than CartoDB dark_all:
// roads, terrain, and labels are all clearly differentiated.
const MAP_STYLES: Record<string, { url: string; attribution?: string; subdomains?: string; filter?: string }> = {
  light: { url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', subdomains: 'abcd' },
  dark: {
    url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png',
    attribution: STADIA_ATTRIBUTION,
    subdomains: 'abcd',
    // Punch up contrast & brightness slightly — still dark but roads/terrain pop
    filter: 'contrast(1.15) brightness(0.95)',
  },
  streets: { url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', subdomains: 'abcd' }
};

function MapStyleSetter({ styleKey }: { styleKey: string }) {
  const map = useMap();
  useEffect(() => {
    const style = MAP_STYLES[styleKey];
    map.eachLayer(layer => {
      if (layer instanceof L.TileLayer) {
        layer.setUrl(style.url);
        // Apply CSS filter for contrast boost on dark tile
        const el = layer.getContainer?.();
        if (el) {
          (el as HTMLElement).style.filter = style.filter ?? '';
        }
      }
    });
  }, [styleKey, map]);
  return null;
}

// ---------------------------------------------------------------------------
// Simple clustering - group nearby vehicles at low zoom levels
// ---------------------------------------------------------------------------
function clusterVehicles(vehicles: Vehicle[], zoom: number): Vehicle[] {
  // At very low zoom, cluster more aggressively
  const clusterDistance = zoom < 9 ? 0.05 : 0.02; // degrees (~5km or ~2km)
  
  const clusters: Vehicle[][] = [];
  const used = new Set<number>();
  
  vehicles.forEach((v, i) => {
    if (used.has(i)) return;
    
    const cluster = [v];
    used.add(i);
    
    // Find nearby vehicles
    vehicles.forEach((other, j) => {
      if (i === j || used.has(j)) return;
      const dist = Math.sqrt(
        Math.pow(v.latitude - other.latitude, 2) + 
        Math.pow(v.longitude - other.longitude, 2)
      );
      if (dist < clusterDistance) {
        cluster.push(other);
        used.add(j);
      }
    });
    
    clusters.push(cluster);
  });
  
  // Return one representative per cluster (the first one)
  return clusters.map(cluster => cluster[0]);
}

// ---------------------------------------------------------------------------
// ZoomTracker — inner component that listens to Leaflet zoom events and
// lifts the current zoom level into Map's local state.
// Must live inside MapContainer to access the Leaflet map context.
// ---------------------------------------------------------------------------
function ZoomTracker({ onZoom }: { onZoom: (z: number) => void }) {
  useMapEvent('zoomend', e => onZoom((e.target as L.Map).getZoom()));
  return null;
}

// ---------------------------------------------------------------------------
// TrackingController — auto-pans map to tracked vehicle position
// ---------------------------------------------------------------------------
function TrackingController({ 
  trackedVehicleId, 
  vehicles, 
  onStopTracking 
}: { 
  trackedVehicleId: string | null; 
  vehicles: Vehicle[]; 
  onStopTracking: () => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (!trackedVehicleId) return;
    const tracked = vehicles.find(v => v.vehicleId === trackedVehicleId);
    if (tracked) {
      map.setView([tracked.latitude, tracked.longitude], 15, { animate: true, duration: 0.5 });
    } else {
      onStopTracking();
    }
  }, [trackedVehicleId, vehicles, map, onStopTracking]);

  return null;
}

// ---------------------------------------------------------------------------
// Pane setup component - creates custom Leaflet panes for z-index control
function PaneSetup() {
  const map = useMap();
  
  useEffect(() => {
    // Create custom panes for proper layering
    if (!map.getPane('routeLines')) {
      map.createPane('routeLines');
      map.getPane('routeLines')!.style.zIndex = '350';
    }
    if (!map.getPane('busMarkers')) {
      map.createPane('busMarkers');
      map.getPane('busMarkers')!.style.zIndex = '450';
    }
  }, [map]);

  return null;
}

// ---------------------------------------------------------------------------
// Watches the Leaflet container for CSS transition resizes (like when the SRE sidebar
// expands/collapses) to prevent blank (#F1F0EE) rendering gaps.
function MapResizer() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    const ro = new ResizeObserver(() => {
      map.invalidateSize();
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [map]);
  return null;
}

export function Map({ 
  vehicles, 
  routeShapes, 
  busStops, 
  flightTrails, 
  flightEnabled, 
  showBusStops, 
  showBusRoutes, 
  showFlightPaths, 
  showVehicleLabels, 
  enableClustering, 
  selectedRoutes,
  trackedVehicleId,
  trackedStopId,
  onTrackVehicle, 
  onTrackStop,
  onStopTracking, 
  mapStyle 
}: Props) {
  const [zoom, setZoom] = useState(11);
  
  // Sync map theme to <html> so Leaflet popup CSS overrides can target it.
  // Leaflet appends popups to <body>, outside any [data-theme] wrapper.
  useEffect(() => {
    document.documentElement.setAttribute('data-map-theme', mapStyle === 'dark' ? 'dark' : 'light');
  }, [mapStyle]);

  // Get all route IDs for consistent color assignment
  const allRouteIds = useMemo(() => {
    return Array.from(routeShapes.keys());
  }, [routeShapes]);

  return (
    <MapContainer
      center={AUSTIN_CENTER}
      zoom={10}
      style={{ flex: 1, background: '#F1F0EE' }}
      zoomControl={true}
    >
      <TileLayer
        url={CARTO_POSITRON}
        attribution={CARTO_ATTRIBUTION}
        subdomains="abcd"
        maxZoom={19}
        keepBuffer={8}
        updateWhenIdle={false}
      />

      <PaneSetup />
      <MapResizer />
      <ZoomTracker onZoom={setZoom} />
      <TrackingController trackedVehicleId={trackedVehicleId} vehicles={vehicles} onStopTracking={onStopTracking} />
      <FitBoundsButton vehicles={vehicles} />
      <MapStyleSetter styleKey={mapStyle} />
      <AirportMarker />
      {showBusStops && <BusStopsLayer stops={busStops} zoom={zoom} vehicles={vehicles} onTrackVehicle={onTrackVehicle} trackedStopId={trackedStopId} onTrackStop={onTrackStop} onStopTracking={onStopTracking} />}

      {/* Route lines — only show selected/visible routes in color */}
      {showBusRoutes && Array.from(routeShapes.entries()).map(([routeId, shape]) => {
        if (shape.directions.length === 0) return null;

        // selectedRoutes is a "hidden" set (matches MapControls logic)
        // If empty: all routes visible
        // If has items: those routes are hidden, don't render them
        const isVisible = selectedRoutes.size === 0 || !selectedRoutes.has(routeId);
        if (!isVisible) return null; // Skip hidden routes completely

        const routeColor = getRouteColor(routeId, allRouteIds);

        // Render all directions for this visible route
        return shape.directions.map((direction, idx) => (
          <RouteLine
            key={`routeline-${routeId}-${direction.directionId ?? idx}-${idx}`}
            routeId={routeId}
            direction={direction}
            color={routeColor}
            isSelected={true}
          />
        ));
      })}

      {/* Flight trails - only show when flights are enabled and showFlightPaths is true */}
      {flightEnabled && showFlightPaths && Object.entries(flightTrails).map(([vehicleId, points]) => (
        <FlightTrailPolyline key={`flight-trail-${vehicleId}`} vehicleId={vehicleId} points={points} />
      ))}

      {/* Vehicle markers — on top of routes and trails */}
      {(enableClustering && zoom < 11 ? clusterVehicles(vehicles, zoom) : vehicles).map((v, i) => (
        <VehicleMarker
          key={`vehicle-${v.source}-${v.vehicleId || i}`}
          vehicle={v}
          zoom={zoom}
          showLabel={showVehicleLabels}
          allRouteIds={allRouteIds}
          trackedVehicleId={trackedVehicleId}
          onTrack={onTrackVehicle}
          onStopTracking={onStopTracking}
        />
      ))}
    </MapContainer>
  );
}
