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
import { MapStyleToggle } from './MapStyleToggle';
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
  onTrackVehicle: (vehicleId: string, source: 'metro' | 'flight') => void;
  onStopTracking: () => void;
  onThemeChange?: (isDark: boolean) => void;
}

const AUSTIN_CENTER: [number, number] = [30.2672, -97.7431];
const CARTO_POSITRON = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
const CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

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
      map.panTo([tracked.latitude, tracked.longitude], { animate: true, duration: 0.5 });
    } else {
      onStopTracking();
    }
  }, [trackedVehicleId, vehicles, map, onStopTracking]);

  return null;
}

// ---------------------------------------------------------------------------
// RouteLines — render route shapes for all visible metro buses.
// Extracts routeId from rawJson (stored by the ingestion services).
// Falls back to label-based lookup if rawJson is missing or unparseable.
// ---------------------------------------------------------------------------
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
  onTrackVehicle, 
  onStopTracking, 
  onThemeChange 
}: Props) {
  const [zoom, setZoom] = useState(11);
  
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
      <ZoomTracker onZoom={setZoom} />
      <TrackingController trackedVehicleId={trackedVehicleId} vehicles={vehicles} onStopTracking={onStopTracking} />
      <FitBoundsButton vehicles={vehicles} />
      <MapStyleToggle onThemeChange={onThemeChange} />
      <AirportMarker />
      {showBusStops && <BusStopsLayer stops={busStops} zoom={zoom} />}

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
            key={`${routeId}-${direction.directionId ?? idx}`}
            routeId={routeId}
            direction={direction}
            color={routeColor}
            isSelected={true}
          />
        ));
      })}

      {/* Flight trails - only show when flights are enabled and showFlightPaths is true */}
      {flightEnabled && showFlightPaths && Object.entries(flightTrails).map(([vehicleId, points]) => (
        <FlightTrailPolyline key={vehicleId} vehicleId={vehicleId} points={points} />
      ))}

      {/* Vehicle markers — on top of routes and trails */}
      {(enableClustering && zoom < 11 ? clusterVehicles(vehicles, zoom) : vehicles).map(v => (
        <VehicleMarker
          key={`${v.source}-${v.vehicleId}`}
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
