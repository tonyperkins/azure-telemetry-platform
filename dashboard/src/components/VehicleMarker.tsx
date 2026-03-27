import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { useMap } from 'react-leaflet';
import { Vehicle } from '../types/vehicle';
import { createTeardropBusIcon } from '../utils/busIcon';
import { getRouteColor } from '../utils/routeColors';
import { VehiclePopup } from './VehiclePopup';

interface Props {
  vehicle: Vehicle;
  zoom:    number;
  showLabel?: boolean;
  allRouteIds?: string[];
  trackedVehicleId?: string | null;
  onMouseEnter?: () => void;
  onTrack?: (vehicleId: string, source: 'metro' | 'flight') => void;
  onStopTracking?: () => void;
}

/** Extract route ID from vehicle data */
function getVehicleRouteId(vehicle: Vehicle): string | null {
  if (vehicle.routeId) return vehicle.routeId;
  if (!vehicle.rawJson) return null;
  try {
    const raw = JSON.parse(vehicle.rawJson) as Record<string, unknown>;
    return (raw['route_id'] ?? raw['routeId']) as string | null;
  } catch {
    return null;
  }
}

function PlaneIcon({ heading }: { heading: number }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="#D97706"
      xmlns="http://www.w3.org/2000/svg"
      style={{ transform: `rotate(${heading}deg)` }}
    >
      <path d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 11.5 2 1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
    </svg>
  );
}

/** Label text shown next to the icon when zoomed in enough. */
function vehicleLabel(vehicle: Vehicle): string | null {
  if (vehicle.source === 'metro') {
    // Use the stored label (vehicle number or route short name).
    // Trim whitespace and callsign noise from GTFS-RT data.
    return vehicle.label?.trim() || null;
  }
  // Flights: callsign (e.g. "SWA1203"), trimmed to remove padding from OpenSky
  return vehicle.label?.trim() || vehicle.vehicleId.toUpperCase();
}

/**
 * Creates the Leaflet DivIcon for a vehicle marker.
 * Metro buses get a teardrop icon with route color and heading rotation.
 * Flights get a rotated plane icon.
 */
function createIcon(
  vehicle: Vehicle, 
  zoom: number, 
  showLabel: boolean, 
  allRouteIds: string[],
  isTracked: boolean
): L.DivIcon {
  if (vehicle.source === 'metro') {
    const routeId = getVehicleRouteId(vehicle);
    const routeColor = routeId && allRouteIds.length > 0 
      ? getRouteColor(routeId, allRouteIds) 
      : '#0D9488';
    
    const heading = vehicle.heading ?? 0;
    const isStationary = vehicle.speedKmh === 0;
    const opacity = isStationary ? 0.7 : 1.0;
    
    const teardropSvg = createTeardropBusIcon(routeColor);
    const label = showLabel && zoom >= 13 ? vehicleLabel(vehicle) : null;
    
    // Rotation and scaling for tracked vehicle
    const scale = isTracked ? 1.3 : 1.0;
    const pulseClass = isTracked ? 'tracking-pulse' : '';

    return L.divIcon({
      html: `
        <div class="${pulseClass}" style="display: flex; align-items: center; gap: 4px; opacity: ${opacity};">
          <div style="transform: rotate(${heading}deg) scale(${scale}); transform-origin: center center; transition: transform 0.3s ease;">
            ${teardropSvg}
          </div>
          ${label ? `<span style="font-size: 11px; font-weight: 600; color: ${routeColor}; white-space: nowrap;">${label}</span>` : ''}
        </div>
      `,
      className: '',
      iconSize: [20, 28],
      iconAnchor: [10, 14],
      popupAnchor: [0, -14],
    });
  } else {
    const iconMarkup = renderToStaticMarkup(<PlaneIcon heading={vehicle.heading ?? 0} />);
    const label = showLabel && zoom >= 11 ? vehicleLabel(vehicle) : null;

    const labelHtml = label
      ? `<span style="
           position:absolute;
           left:24px;
           top:50%;
           transform:translateY(-50%);
           white-space:nowrap;
           font-family:'Inter',sans-serif;
           font-size:11px;
           font-weight:600;
           color:#1A202C;
           background:rgba(255,255,255,0.85);
           border-radius:3px;
           padding:1px 4px;
           pointer-events:none;
           line-height:1.4;
         ">${label}</span>`
      : '';

    return L.divIcon({
      html: `<div style="position:relative;display:inline-flex;align-items:center;">${iconMarkup}${labelHtml}</div>`,
      className: '',
      iconSize:    label ? [22 + label.length * 7 + 28, 22] : [22, 22],
      iconAnchor:  [11, 11],
      popupAnchor: [0, -12],
    });
  }
}

/**
 * Renders a single vehicle marker on the Leaflet map.
 * Uses imperative Leaflet API (not react-leaflet Marker) so we can call
 * marker.setLatLng() for smooth position updates — Leaflet handles the
 * CSS transition internally without a full React re-render cycle.
 */
export function VehicleMarker({ 
  vehicle, 
  zoom, 
  showLabel = true, 
  allRouteIds = [],
  trackedVehicleId = null,
  onMouseEnter, 
  onTrack,
  onStopTracking
}: Props) {
  const map        = useMap();
  const markerRef  = useRef<L.Marker | null>(null);

  useEffect(() => {
    const isTracked = vehicle.vehicleId === trackedVehicleId;
    const icon = createIcon(vehicle, zoom, showLabel, allRouteIds, isTracked);
    const trackHandler = onTrack ? () => onTrack(vehicle.vehicleId, vehicle.source) : undefined;
    const stopTrackingHandler = onStopTracking;

    if (!markerRef.current) {
      markerRef.current = L.marker([vehicle.latitude, vehicle.longitude], { 
          icon,
          pane: 'busMarkers'
        })
        .addTo(map)
        .bindPopup(() => {
          const container = document.createElement('div');
          const root = createRoot(container);
          root.render(
            <VehiclePopup 
              vehicle={vehicle} 
              isTracked={isTracked}
              onTrack={trackHandler}
              onStopTracking={stopTrackingHandler}
            />
          );
          return container;
        }, {
          maxHeight: 500,
          minWidth: 300,
          autoPan: true,
          keepInView: true,
          closeButton: true,
          autoClose: false,
          closeOnClick: false
        });
      
      // Add mouse event handlers for hover (only mouseover for route highlighting)
      if (onMouseEnter) {
        markerRef.current.on('mouseover', onMouseEnter);
      }
      // Don't add mouseout handler - let popup stay open for clicking Track button
      // Route will clear on next mouseover of a different vehicle
    } else {
      markerRef.current.setLatLng([vehicle.latitude, vehicle.longitude]);
      markerRef.current.setIcon(icon);
    }

    return () => {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
    };
  }, [vehicle, zoom, showLabel, allRouteIds, trackedVehicleId, map, onMouseEnter, onTrack, onStopTracking]);

  return null;
}
